/**
 * Monitoramento automático de processos — o worker que o agendador da hospedagem
 * chama por `/api/cron/process-sync`. Somente servidor.
 *
 *   agendador → rota (segredo) → runProcessMonitor
 *     → reserva os processos elegíveis (banco decide: `claim_process_monitoring`)
 *     → consulta cada um pelo serviço de sempre (`lookup-service`: cache → fonte)
 *     → aplica só o que é novo (`mergeProcessSheet`) com gravação condicionada à versão
 *     → atividade "N novas movimentações…" só quando há novidade (autora: Íntegra)
 *     → as novas que pedem atenção (sentença, decisão, audiência…) entram na Triagem
 *     → estado de cada processo (próxima consulta permitida) + registro da execução
 *
 * O Realtime entrega as gravações a quem está com a Íntegra aberta — nada de
 * polling no navegador.
 *
 * Quando consultar, quanto esperar e quando parar: `monitoring-policy.ts`. A
 * conversa com a fonte (timeout, tentativas, Retry-After) continua no cliente do
 * provider; o cache e a deduplicação, no `lookup-service`. Aqui não há outro
 * limitador nem outro cache.
 *
 * A falha de um processo não interrompe o lote. Só param a execução as falhas
 * da fonte inteira (429, indisponibilidade seguida, chave recusada).
 */

import { toLocalISOIn } from "@/lib/core/dates"
import { LookupError, type LookupErrorCode } from "@/lib/integrations/legal/errors"
import { SYSTEM_ACTOR_ID } from "@/lib/auth/system-actor"
import { movementTriageItems, type TriageItemInput } from "@/lib/triagem/sources"
import type { Activity, Process } from "@/types"
import type { LookupResult } from "./lookup-service"
import {
  CLAIM_LEASE_MS,
  CONFLICT_RETRY_MS,
  OFFICE_TIME_ZONE,
  nextCheckAfterFailure,
  nextCheckAfterSuccess,
  resumeAfter,
  runStopFor,
  type MonitorConfig,
  type RunStop,
} from "./monitoring-policy"
import { mergeProcessSheet, newMovementsMessage } from "./process-sync"

/* --------------------------------- contratos -------------------------------- */

export interface ClaimedProcess {
  organizationId: string
  processId: string
  cnj: string
  /** Falhas seguidas antes desta execução. */
  failures: number
}

export interface ProcessRow {
  organizationId: string
  id: string
  data: Process
  /** `updated_at` — a versão do registro (gravação condicionada, `0006_team_sync.sql`). */
  version: string
}

export type MonitorResult = "updated" | "unchanged" | "not_found" | "unsupported" | "rate_limited" | "unavailable" | "conflict" | "error"

export interface MonitoringState {
  organizationId: string
  processId: string
  cnj: string
  /** ISO UTC. */
  lastCheckedAt: string
  /** ISO UTC; `undefined` mantém o que está gravado. */
  lastSuccessAt?: string
  lastResult: MonitorResult
  lastError: LookupErrorCode | "CONFLICT" | null
  lastNewMovements: number
  consecutiveFailures: number
  nextCheckAt: string
}

export type RunStatus = "completed" | "partial" | "failed" | "skipped"

export interface RunSummary {
  status: RunStatus
  evaluated: number
  queried: number
  fromCache: number
  updatedProcesses: number
  newMovements: number
  errors: number
  /** HTTP 429. */
  rateLimited: number
  /** HTTP 503. */
  unavailable: number
  resumeAfter: string | null
  note: string | null
}

export interface RunRecord extends RunSummary {
  startedAt: string
  finishedAt: string
  durationMs: number
}

export type SaveOutcome = { status: "saved" } | { status: "stale"; current: ProcessRow | null }

/** Persistência do worker (Supabase com service role em produção; memória nos testes). */
export interface MonitorRepository {
  /** Pausa em vigor pedida por uma execução anterior (429, fonte fora). */
  pausedUntil(now: Date): Promise<string | null>
  /** Há outra execução rodando (iniciada há menos que a reserva)? */
  isRunning(now: Date): Promise<boolean>
  startRun(startedAt: Date): Promise<string>
  finishRun(id: string, record: RunRecord): Promise<void>
  /** Execução que nem começou (desligada, pausada, outra rodando). */
  recordSkipped(record: RunRecord): Promise<void>
  claim(limit: number, leaseMs: number): Promise<ClaimedProcess[]>
  /** Processos atuais, numa leitura só. Os que não voltam foram excluídos. */
  loadProcesses(keys: { organizationId: string; processId: string }[]): Promise<ProcessRow[]>
  saveProcess(row: ProcessRow, data: Process): Promise<SaveOutcome>
  insertActivities(activities: Activity[]): Promise<void>
  /** Eventos para a Triagem (sem duplicar); devolve quantos entraram. */
  saveTriageItems(items: TriageItemInput[]): Promise<number>
  saveStates(states: MonitoringState[]): Promise<void>
  /** Devolve à fila, sem esperar a reserva vencer, o que não chegou a ser consultado. */
  release(claimed: ClaimedProcess[], now: Date): Promise<void>
}

export interface MonitorDeps {
  repo: MonitorRepository
  /** Consulta pelo serviço de sempre (cache do escritório → fonte). */
  lookup(request: { organizationId: string; cnj: string }): Promise<LookupResult>
  config: MonitorConfig
  /** A administração desligou a consulta, ou a plataforma está em manutenção: motivo. */
  disabledReason?: string | null
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  newId?: (prefix: string) => string
  log?: (message: string) => void
}

/* ---------------------------------- worker ---------------------------------- */

type Outcome = { claimed: ClaimedProcess; result: LookupResult } | { claimed: ClaimedProcess; error: LookupError }

const keyOf = (organizationId: string, processId: string) => `${organizationId}:${processId}`

/** Códigos que só existem se a fonte foi de fato chamada. */
const REACHED_SOURCE = new Set<LookupErrorCode>(["RATE_LIMIT", "TIMEOUT", "UNAVAILABLE", "NOT_FOUND", "AUTHENTICATION"])

const RESULT_OF: Partial<Record<LookupErrorCode, MonitorResult>> = {
  NOT_FOUND: "not_found",
  UNSUPPORTED_COURT: "unsupported",
  INVALID_CNJ: "unsupported",
  RATE_LIMIT: "rate_limited",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "unavailable",
}

const STOP_NOTE: Record<RunStop, string> = {
  rate_limited: "Interrompida: a fonte limitou as consultas (429).",
  unavailable: "Interrompida: a fonte está indisponível.",
  configuration: "Interrompida: a chave da consulta foi recusada ou não está configurada.",
}

/** Mais de um motivo no mesmo grupo: vale o mais grave (menor número). */
const STOP_PRIORITY: Record<RunStop, number> = { configuration: 0, rate_limited: 1, unavailable: 2 }

type Stop = { reason: RunStop; retryAfterMs?: number }

/** Junta as paradas do mesmo grupo: o motivo mais grave e a maior espera pedida pela fonte. */
function mergeStop(current: Stop | undefined, reason: RunStop, retryAfterMs?: number): Stop {
  const wait = Math.max(current?.retryAfterMs ?? 0, retryAfterMs ?? 0)
  return {
    reason: current && STOP_PRIORITY[current.reason] < STOP_PRIORITY[reason] ? current.reason : reason,
    retryAfterMs: wait || undefined,
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const emptySummary = (): RunSummary => ({
  status: "completed",
  evaluated: 0,
  queried: 0,
  fromCache: 0,
  updatedProcesses: 0,
  newMovements: 0,
  errors: 0,
  rateLimited: 0,
  unavailable: 0,
  resumeAfter: null,
  note: null,
})

export async function runProcessMonitor(deps: MonitorDeps): Promise<RunRecord> {
  const { repo, config } = deps
  const now = deps.now ?? (() => new Date())
  const sleep = deps.sleep ?? defaultSleep
  const newId = deps.newId ?? ((prefix: string) => `${prefix}_${crypto.randomUUID()}`)
  const log = deps.log ?? ((message: string) => console.info(message))

  const started = now()
  const summary = emptySummary()
  const record = (): RunRecord => {
    const finished = now()
    return { ...summary, startedAt: started.toISOString(), finishedAt: finished.toISOString(), durationMs: finished.getTime() - started.getTime() }
  }
  const skip = async (note: string, resume: string | null = null) => {
    Object.assign(summary, { status: "skipped", note, resumeAfter: resume })
    const done = record()
    await repo.recordSkipped(done)
    log(`[process-monitor] execução ignorada: ${note}`)
    return done
  }

  if (deps.disabledReason) return skip(deps.disabledReason)
  const paused = await repo.pausedUntil(started)
  if (paused) return skip("Aguardando a fonte liberar novas consultas.", paused)
  if (await repo.isRunning(started)) return skip("Outra execução ainda está em andamento.")

  const runId = await repo.startRun(started)
  let queue: ClaimedProcess[] = []
  let finished: RunRecord | undefined

  try {
    queue = await repo.claim(config.batchSize, CLAIM_LEASE_MS)
    summary.evaluated = queue.length
    let stop: Stop | undefined
    let unavailableStreak = 0

    while (queue.length && !stop) {
      if (now().getTime() - started.getTime() > config.timeBudgetMs) break
      const chunk = queue.splice(0, config.concurrency)

      const outcomes = await Promise.all(
        chunk.map(async (claimed): Promise<Outcome> => {
          try {
            return { claimed, result: await deps.lookup({ organizationId: claimed.organizationId, cnj: claimed.cnj }) }
          } catch (error) {
            return { claimed, error: error instanceof LookupError ? error : new LookupError("UNEXPECTED", String(error)) }
          }
        }),
      )

      const checkedAt = now()
      const states: MonitoringState[] = []
      const successes: { claimed: ClaimedProcess; result: LookupResult }[] = []
      let reachedSource = false

      for (const outcome of outcomes) {
        const { claimed } = outcome
        if ("result" in outcome) {
          unavailableStreak = 0
          if (outcome.result.cached) summary.fromCache += 1
          else {
            summary.queried += 1
            reachedSource = true
          }
          successes.push(outcome)
          continue
        }

        const { error } = outcome
        if (REACHED_SOURCE.has(error.code)) {
          summary.queried += 1
          reachedSource = true
        }
        summary.errors += 1
        if (error.status === 429 || error.code === "RATE_LIMIT") summary.rateLimited += 1
        if (error.status === 503) summary.unavailable += 1
        unavailableStreak = error.code === "UNAVAILABLE" || error.code === "TIMEOUT" ? unavailableStreak + 1 : 0

        const failures = claimed.failures + 1
        states.push({
          organizationId: claimed.organizationId,
          processId: claimed.processId,
          cnj: claimed.cnj,
          lastCheckedAt: checkedAt.toISOString(),
          lastResult: RESULT_OF[error.code] ?? "error",
          lastError: error.code,
          lastNewMovements: 0,
          consecutiveFailures: failures,
          nextCheckAt: nextCheckAfterFailure(error.code, failures, checkedAt, error.retryAfterMs).toISOString(),
        })
        const reason = runStopFor(error.code, unavailableStreak)
        if (reason) stop = mergeStop(stop, reason, error.retryAfterMs)
      }

      const { applied, activities, triage } = await applySuccesses(deps, successes, checkedAt, newId, summary)
      states.push(...applied)

      // Atividades depois dos processos: só descrevem o que foi gravado.
      if (activities.length) await repo.insertActivities(activities)
      // A Triagem é um extra: se falhar, o processo e as movimentações já estão salvos.
      if (triage.length) {
        await repo
          .saveTriageItems(triage)
          .then((count) => count && log(`[process-monitor] ${count} movimentações na Triagem`))
          .catch((error) => console.error("[process-monitor] falha ao enviar movimentações para a Triagem", error))
      }
      if (states.length) await repo.saveStates(states)

      if (reachedSource && queue.length && !stop) await sleep(config.pauseMs)
    }

    if (stop) {
      summary.status = stop.reason === "configuration" ? "failed" : "partial"
      summary.note = STOP_NOTE[stop.reason]
      summary.resumeAfter = resumeAfter(stop.reason, now(), stop.retryAfterMs).toISOString()
    } else if (queue.length) {
      summary.status = "partial"
      summary.note = "Tempo da execução esgotado; o restante segue na próxima."
    }
  } catch (error) {
    summary.status = "failed"
    summary.note = "Falha inesperada na execução."
    console.error("[process-monitor] falha inesperada", error)
  } finally {
    if (queue.length) await repo.release(queue, now()).catch((error) => console.error("[process-monitor] falha ao liberar reservas", error))
    finished = record()
    await repo.finishRun(runId, finished)
    log(
      `[process-monitor] ${finished.status} avaliados=${finished.evaluated} consultados=${finished.queried} cache=${finished.fromCache} ` +
        `novidades=${finished.newMovements} erros=${finished.errors} 429=${finished.rateLimited} 503=${finished.unavailable} ms=${finished.durationMs}`,
    )
  }
  return finished
}

/**
 * Aplica as fichas obtidas: uma leitura dos processos do grupo, mescla pura e
 * gravação condicionada à versão. Se alguém editou o processo no meio-tempo, mescla
 * de novo sobre a versão atual (uma vez) — a edição da pessoa nunca é sobrescrita.
 */
async function applySuccesses(
  deps: MonitorDeps,
  successes: { claimed: ClaimedProcess; result: LookupResult }[],
  checkedAt: Date,
  newId: (prefix: string) => string,
  summary: RunSummary,
): Promise<{ applied: MonitoringState[]; activities: Activity[]; triage: TriageItemInput[] }> {
  const applied: MonitoringState[] = []
  const activities: Activity[] = []
  const triage: TriageItemInput[] = []
  if (!successes.length) return { applied, activities, triage }

  const rows = await deps.repo.loadProcesses(successes.map(({ claimed }) => ({ organizationId: claimed.organizationId, processId: claimed.processId })))
  const byKey = new Map(rows.map((row) => [keyOf(row.organizationId, row.id), row]))
  const localNow = toLocalISOIn(checkedAt, OFFICE_TIME_ZONE)

  for (const { claimed, result } of successes) {
    const infoAt = new Date(result.checkedAt)
    const infoLocal = toLocalISOIn(infoAt, OFFICE_TIME_ZONE)
    let row = byKey.get(keyOf(claimed.organizationId, claimed.processId))
    let merged: ReturnType<typeof mergeProcessSheet> | undefined
    let saved = false

    for (let attempt = 0; row && attempt < 2 && !saved; attempt += 1) {
      merged = mergeProcessSheet(row.data, result.sheet, infoLocal, { newId: () => newId("m"), automatic: true })
      // Nada mudou (mesma ficha já aplicada): não grava, não gera evento.
      if (!merged.imported.length && JSON.stringify(merged.process) === JSON.stringify(row.data)) {
        saved = true
        break
      }
      const outcome = await deps.repo.saveProcess(row, merged.process)
      if (outcome.status === "saved") saved = true
      else row = outcome.current ?? undefined
    }

    // Excluído no meio-tempo: o estado saiu junto (FK em cascata); nada a registrar.
    if (!row) continue

    const base = {
      organizationId: claimed.organizationId,
      processId: claimed.processId,
      cnj: claimed.cnj,
      lastCheckedAt: checkedAt.toISOString(),
    }

    if (!saved || !merged) {
      applied.push({
        ...base,
        lastResult: "conflict",
        lastError: "CONFLICT",
        lastNewMovements: 0,
        consecutiveFailures: claimed.failures,
        nextCheckAt: new Date(checkedAt.getTime() + CONFLICT_RETRY_MS).toISOString(),
      })
      continue
    }

    const count = merged.imported.length
    if (count) {
      summary.updatedProcesses += 1
      summary.newMovements += count
      const process = merged.process
      activities.push({
        id: newId("act"),
        organizationId: claimed.organizationId,
        createdAt: localNow,
        at: localNow,
        type: "movement",
        message: newMovementsMessage(count, process.code),
        detail: merged.imported[0]?.title,
        clientId: process.clientId,
        processId: process.id,
        actorUserId: SYSTEM_ACTOR_ID,
        href: `/processos/${process.id}`,
      })
      triage.push(...movementTriageItems({ organizationId: claimed.organizationId, process, movements: merged.imported, today: localNow.slice(0, 10) }))
    }

    applied.push({
      ...base,
      lastSuccessAt: infoAt.toISOString(),
      lastResult: count ? "updated" : "unchanged",
      lastError: null,
      lastNewMovements: count,
      consecutiveFailures: 0,
      // A regra conta da data real da informação (pode vir do cache); nunca antes de alguns minutos.
      nextCheckAt: new Date(Math.max(nextCheckAfterSuccess(infoAt, OFFICE_TIME_ZONE).getTime(), checkedAt.getTime() + CONFLICT_RETRY_MS)).toISOString(),
    })
  }

  return { applied, activities, triage }
}
