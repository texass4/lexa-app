/**
 * Captura diária de intimações do DJEN por OAB — roda na mesma rota e no mesmo
 * agendador do monitoramento de processos (Etapa 5). Somente servidor.
 *
 *   rota do agendador → runIntimacoesCapture
 *     → banco escolhe e reserva as inscrições com consulta vencida (`claim_djen_oabs`) —
 *       a mesma OAB em dois escritórios é UMA consulta
 *     → DJEN: comunicações da janela (desde a última lida, com 1 dia de sobra)
 *     → para cada escritório que tem a OAB: processo pelo CNJ, responsável, sugestão
 *       de prazo → `save_intimacoes` (nunca duplica)
 *     → vincula as que estavam "sem processo" se o número foi cadastrado depois
 *     → estado de cada OAB (próxima consulta) + registro da execução
 *
 * O Realtime entrega as novas intimações a quem está com a Íntegra aberta; o banco
 * registra a trilha de auditoria e a atividade no processo. Nenhum prazo é criado.
 *
 * Mesmas regras de consumo da Etapa 5 (`monitoring-policy.ts`): 429 para a execução
 * e respeita o `Retry-After`; falhas seguidas de indisponibilidade param; a falha de
 * uma OAB não interrompe as outras.
 */

import { LookupError, type LookupErrorCode } from "@/lib/integrations/legal/errors"
import type { DjenItem, DjenQuery } from "@/lib/integrations/legal/djen/client"
import { mapCommunication, type Communication } from "@/lib/integrations/legal/djen/mapper"
import { suggestDeadline } from "@/lib/intimacoes/deadline"
import { addCalendarDays } from "@/lib/intimacoes/calendar"
import { toLocalISOIn } from "@/lib/dates"
import type { RunRecord, RunSummary } from "@/lib/services/processes/monitor"
import {
  CLAIM_LEASE_MS,
  OFFICE_TIME_ZONE,
  nextCheckAfterFailure,
  resumeAfter,
  runStopFor,
  startOfDayIn,
  type RunStop,
} from "@/lib/services/processes/monitoring-policy"
import type { TriageStatus } from "@/types"

const DAY = 86_400_000

/** Primeira consulta de uma OAB: lê os últimos dias (captura o que foi publicado antes do cadastro). */
export const BACKFILL_DAYS = 7
/** Relê o último dia já lido: a fonte pode acrescentar comunicações ao dia depois da consulta. */
export const OVERLAP_DAYS = 1
/** Hora local a partir da qual a consulta do dia é feita (a fonte publica de madrugada). */
export const DAILY_HOUR = 6

export interface CaptureConfig {
  /** Inscrições por execução. */
  batchSize: number
  /** Pausa entre consultas à fonte. */
  pauseMs: number
  /** Depois disso, não começa consultas novas. */
  timeBudgetMs: number
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = { batchSize: 30, pauseMs: 1000, timeBudgetMs: 90_000 }

const bounded = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

export function captureConfig(env: Record<string, string | undefined> = process.env): CaptureConfig {
  return {
    batchSize: bounded(env.DJEN_BATCH_SIZE, DEFAULT_CAPTURE_CONFIG.batchSize, 1, 200),
    pauseMs: bounded(env.DJEN_PAUSE_MS, DEFAULT_CAPTURE_CONFIG.pauseMs, 500, 30_000),
    timeBudgetMs: bounded(env.DJEN_TIME_BUDGET_MS, DEFAULT_CAPTURE_CONFIG.timeBudgetMs, 10_000, 150_000),
  }
}

/* --------------------------------- contratos -------------------------------- */

export interface ClaimedOab {
  number: string
  uf: string
  /** Último dia de disponibilização já lido (`YYYY-MM-DD`). */
  windowEnd?: string
  failures: number
}

/** Quem tem a inscrição, em cada escritório. */
export interface OabHolder {
  organizationId: string
  oabId: string
  userId: string
  number: string
  uf: string
}

export interface ProcessMatch {
  cnj: string
  processId: string
  clientId?: string
  ownerId?: string
}

export interface OabState {
  number: string
  uf: string
  windowEnd?: string
  lastCheckedAt: string
  lastSuccessAt?: string
  lastResult: "ok" | "rate_limited" | "unavailable" | "error"
  lastError: LookupErrorCode | null
  lastFound: number
  consecutiveFailures: number
  nextCheckAt: string
}

/** Linha para `save_intimacoes` (nomes das colunas). */
export interface IntimacaoRow {
  organization_id: string
  source: "djen"
  external_id: string
  hash?: string
  oab_ids: string[]
  responsible_id: string
  cnj?: string
  process_number?: string
  tribunal?: string
  orgao?: string
  tipo_comunicacao?: string
  tipo_documento?: string
  classe?: string
  meio?: string
  available_at: string
  published_at: string
  content: string
  document_url?: string
  official_url?: string
  parties: Communication["parties"]
  lawyers: Communication["lawyers"]
  raw: unknown
  process_id?: string
  client_id?: string
  link_method?: "cnj"
  status: TriageStatus
  suggestion: ReturnType<typeof suggestDeadline>
}

export interface CaptureRepository {
  pausedUntil(now: Date): Promise<string | null>
  isRunning(now: Date): Promise<boolean>
  startRun(startedAt: Date): Promise<string>
  finishRun(id: string, record: RunRecord): Promise<void>
  recordSkipped(record: RunRecord): Promise<void>
  claim(limit: number, leaseMs: number): Promise<ClaimedOab[]>
  /** Titulares ativos dessas inscrições (uma leitura só). */
  holders(oabs: { number: string; uf: string }[]): Promise<OabHolder[]>
  matchProcesses(organizationId: string, cnjs: string[]): Promise<ProcessMatch[]>
  /** Grava sem duplicar; devolve quantas são novas e quantas das novas já têm processo. */
  save(rows: IntimacaoRow[]): Promise<{ inserted: number; linked: number }>
  saveStates(states: OabState[]): Promise<void>
  release(claimed: ClaimedOab[], now: Date): Promise<void>
  /** Vincula as "sem processo" cujo número foi cadastrado depois. */
  relink(): Promise<number>
}

export interface CaptureDeps {
  repo: CaptureRepository
  fetchCommunications(query: DjenQuery): Promise<DjenItem[]>
  config: CaptureConfig
  disabledReason?: string | null
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  log?: (message: string) => void
}

/* ---------------------------------- regras ---------------------------------- */

const isoDay = (date: Date) => toLocalISOIn(date, OFFICE_TIME_ZONE).slice(0, 10)

/** Janela de disponibilização a consultar para uma OAB. */
export function captureWindow(claimed: Pick<ClaimedOab, "windowEnd">, now: Date) {
  const today = isoDay(now)
  const from = claimed.windowEnd ? addCalendarDays(claimed.windowEnd, -OVERLAP_DAYS) : addCalendarDays(today, -BACKFILL_DAYS)
  return { from: from > today ? today : from, to: today }
}

/** Próxima consulta depois de um sucesso: amanhã, a partir das 6 h (hora do escritório). */
export function nextDailyCheck(now: Date) {
  return new Date(startOfDayIn(now, OFFICE_TIME_ZONE).getTime() + DAY + DAILY_HOUR * 3_600_000)
}

/** Responsável: o dono do processo, se ele é um dos titulares; senão, o primeiro titular. */
export function pickResponsible(holders: OabHolder[], ownerId?: string) {
  return holders.find((h) => h.userId === ownerId)?.userId ?? holders[0].userId
}

/** Situação inicial na triagem. */
export function initialStatus(match: ProcessMatch | undefined, confident: boolean, ambiguous: boolean): TriageStatus {
  if (!match) return ambiguous ? "revisao" : "sem_processo"
  return confident ? "pendente" : "revisao"
}

/** Comunicações de uma OAB → linhas por escritório titular. */
export async function buildRows(
  repo: Pick<CaptureRepository, "matchProcesses">,
  communications: Communication[],
  holders: OabHolder[],
): Promise<IntimacaoRow[]> {
  const rows: IntimacaoRow[] = []
  const byOrg = new Map<string, OabHolder[]>()
  for (const h of holders) byOrg.set(h.organizationId, [...(byOrg.get(h.organizationId) ?? []), h])

  for (const [organizationId, orgHolders] of byOrg) {
    const cnjs = [...new Set(communications.map((c) => c.cnj).filter((c): c is string => !!c))]
    const matches = cnjs.length ? await repo.matchProcesses(organizationId, cnjs) : []
    for (const c of communications) {
      const found = c.cnj ? matches.filter((m) => m.cnj === c.cnj) : []
      // Dois processos com o mesmo número no escritório: não escolhe sozinho.
      const match = found.length === 1 ? found[0] : undefined
      const suggestion = suggestDeadline({ availableAt: c.availableAt, text: c.content, tribunal: c.tribunal, classe: c.classe })
      const ambiguous = found.length > 1
      if (ambiguous) suggestion.reasons.unshift("Há mais de um processo com este número no escritório: vincule o correto.")
      rows.push({
        organization_id: organizationId,
        source: "djen",
        external_id: c.externalId,
        hash: c.hash,
        oab_ids: orgHolders.map((h) => h.oabId),
        responsible_id: pickResponsible(orgHolders, match?.ownerId),
        cnj: c.cnj,
        process_number: c.processNumber,
        tribunal: c.tribunal,
        orgao: c.orgao,
        tipo_comunicacao: c.tipoComunicacao,
        tipo_documento: c.tipoDocumento,
        classe: c.classe,
        meio: c.meio,
        available_at: c.availableAt,
        published_at: suggestion.publishedAt,
        content: c.content,
        document_url: c.documentUrl,
        official_url: c.officialUrl,
        parties: c.parties,
        lawyers: c.lawyers,
        raw: c.raw,
        process_id: match?.processId,
        client_id: match?.clientId,
        link_method: match ? "cnj" : undefined,
        status: initialStatus(match, suggestion.confidence === "alta", ambiguous),
        suggestion,
      })
    }
  }
  return rows
}

/* ---------------------------------- worker ---------------------------------- */

const STOP_NOTE: Record<RunStop, string> = {
  rate_limited: "Interrompida: a fonte limitou as consultas (429).",
  unavailable: "Interrompida: a fonte está indisponível.",
  configuration: "Interrompida: a fonte recusou o acesso ou os parâmetros (403/400) — confira a região do servidor.",
}

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

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Uma execução da captura. No registro: `evaluated` = OABs reservadas, `queried` =
 * consultas à fonte, `newMovements` = intimações novas, `updatedProcesses` = novas já
 * vinculadas a processo.
 */
export async function runIntimacoesCapture(deps: CaptureDeps): Promise<RunRecord> {
  const { repo, config } = deps
  const now = deps.now ?? (() => new Date())
  const sleep = deps.sleep ?? defaultSleep
  const log = deps.log ?? ((m: string) => console.info(m))
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
    return done
  }

  if (deps.disabledReason) return skip(deps.disabledReason)
  const paused = await repo.pausedUntil(started)
  if (paused) return skip("Aguardando a fonte liberar novas consultas.", paused)
  if (await repo.isRunning(started)) return skip("Outra execução ainda está em andamento.")

  const runId = await repo.startRun(started)
  let queue: ClaimedOab[] = []
  let finished: RunRecord | undefined
  try {
    queue = await repo.claim(config.batchSize, CLAIM_LEASE_MS)
    summary.evaluated = queue.length
    const holders = queue.length ? await repo.holders(queue) : []
    let stop: { reason: RunStop; retryAfterMs?: number } | undefined
    let unavailableStreak = 0

    while (queue.length && !stop) {
      if (now().getTime() - started.getTime() > config.timeBudgetMs) break
      const oab = queue.shift()!
      const checkedAt = now()
      const window = captureWindow(oab, checkedAt)
      const own = holders.filter((h) => h.number === oab.number && h.uf === oab.uf)
      try {
        summary.queried += 1
        const items = await deps.fetchCommunications({ numeroOab: oab.number, ufOab: oab.uf, from: window.from, to: window.to })
        // Canceladas na fonte e itens sem o essencial ficam de fora.
        const communications = items.map(mapCommunication).filter((c): c is Communication => !!c && !c.cancelled)
        const rows = own.length ? await buildRows(repo, communications, own) : []
        const saved = rows.length ? await repo.save(rows) : { inserted: 0, linked: 0 }
        summary.newMovements += saved.inserted
        summary.updatedProcesses += saved.linked
        unavailableStreak = 0
        await repo.saveStates([
          {
            number: oab.number,
            uf: oab.uf,
            windowEnd: window.to,
            lastCheckedAt: checkedAt.toISOString(),
            lastSuccessAt: checkedAt.toISOString(),
            lastResult: "ok",
            lastError: null,
            lastFound: communications.length,
            consecutiveFailures: 0,
            nextCheckAt: nextDailyCheck(checkedAt).toISOString(),
          },
        ])
      } catch (error) {
        const failure = error instanceof LookupError ? error : new LookupError("UNEXPECTED", String(error))
        summary.errors += 1
        if (failure.status === 429 || failure.code === "RATE_LIMIT") summary.rateLimited += 1
        if (failure.status === 503) summary.unavailable += 1
        unavailableStreak = failure.code === "UNAVAILABLE" || failure.code === "TIMEOUT" ? unavailableStreak + 1 : 0
        const failures = oab.failures + 1
        log(`[djen] OAB ${oab.uf}${oab.number} falhou code=${failure.code} ${failure.detail ?? ""}`)
        await repo.saveStates([
          {
            number: oab.number,
            uf: oab.uf,
            windowEnd: oab.windowEnd,
            lastCheckedAt: checkedAt.toISOString(),
            lastResult: failure.code === "RATE_LIMIT" ? "rate_limited" : failure.code === "UNAVAILABLE" || failure.code === "TIMEOUT" ? "unavailable" : "error",
            lastError: failure.code,
            lastFound: 0,
            consecutiveFailures: failures,
            nextCheckAt: nextCheckAfterFailure(failure.code, failures, checkedAt, failure.retryAfterMs).toISOString(),
          },
        ])
        const reason = runStopFor(failure.code, unavailableStreak)
        if (reason) stop = { reason, retryAfterMs: failure.retryAfterMs }
      }
      if (queue.length && !stop) await sleep(config.pauseMs)
    }

    // Processos cadastrados depois da captura: vincula o que ficou "sem processo".
    summary.updatedProcesses += await repo.relink().catch((error) => {
      console.error("[djen] falha ao revincular", error)
      return 0
    })

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
    summary.note = "Falha inesperada na captura."
    console.error("[djen] falha inesperada", error)
  } finally {
    if (queue.length) await repo.release(queue, now()).catch((error) => console.error("[djen] falha ao liberar reservas", error))
    finished = record()
    await repo.finishRun(runId, finished)
    log(
      `[djen] ${finished.status} oabs=${finished.evaluated} consultas=${finished.queried} novas=${finished.newMovements} ` +
        `erros=${finished.errors} 429=${finished.rateLimited} ms=${finished.durationMs}`,
    )
  }
  return finished
}
