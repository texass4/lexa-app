/**
 * Início e execução da consulta processual. Somente servidor; sem dependência do
 * Next ou do Supabase (tudo por `deps`), o que deixa testável.
 *
 *   pedido → valida → reaproveita (recente ou em andamento) → limite por pessoa
 *          → cria a execução → responde na hora → executa em segundo plano
 *
 * A tela acompanha pela leitura da execução (etapas e fontes são gravadas a cada passo).
 */

import { hasValidCheckDigits, onlyDigits } from "@/lib/processos/cnj"
import type { Process } from "@/types"
import { STALE_RUNNING_MS, KEEP_PER_PROCESS, type EnrichmentStore } from "./store"
import { initialSources, initialSteps, runWorkflow, type RunState, type WorkflowDeps } from "./workflow"

/** Consulta concluída há menos que isso é reaproveitada (a menos que peçam "Consultar novamente"). */
export const REUSE_RECENT_MS = 10 * 60_000

export type EnrichmentErrorCode = "INVALID_CNJ" | "NO_NUMBER" | "RATE_LIMIT" | "NOT_FOUND" | "UNAVAILABLE"

export class EnrichmentError extends Error {
  readonly code: EnrichmentErrorCode
  /** Detalhe técnico — somente para log. */
  readonly detail?: string

  constructor(code: EnrichmentErrorCode, detail?: string) {
    super(detail ?? code)
    this.name = "EnrichmentError"
    this.code = code
    this.detail = detail
  }
}

export const ENRICHMENT_MESSAGES: Record<EnrichmentErrorCode, { status: number; message: string }> = {
  INVALID_CNJ: { status: 400, message: "Número CNJ inválido. Confira os 20 dígitos do processo." },
  NO_NUMBER: { status: 422, message: "Este processo não tem número CNJ no cadastro. A consulta pública precisa do número." },
  RATE_LIMIT: { status: 429, message: "Muitas consultas em pouco tempo. Aguarde alguns minutos e tente de novo." },
  NOT_FOUND: { status: 404, message: "Consulta não encontrada." },
  UNAVAILABLE: { status: 503, message: "Não foi possível iniciar a consulta agora. Tente novamente em instantes." },
}

export interface StartInput {
  organizationId: string
  userId: string
  cnj: string
  process?: Process | null
  clientName?: string
  force?: boolean
}

export interface ServiceDeps {
  store: EnrichmentStore
  now: () => Date
  /** Limite de consultas (por pessoa e por escritório). `false` = acima do limite. */
  allow: () => Promise<boolean>
  /** Fontes do workflow (sem `progress` e `now`, que o serviço fornece). */
  sources: Omit<WorkflowDeps, "progress" | "now">
  /** Mantém a execução viva depois da resposta (`after` do Next em produção). */
  defer: (task: Promise<unknown>) => void
  log?: (message: string, detail?: unknown) => void
}

export interface StartResult {
  runId: string
  /** A consulta não foi refeita: devolveu uma recente ou a que está em andamento. */
  reused: "recent" | "running" | false
}

/** CNJ de um processo do cadastro (o campo `cnj` ou os dígitos do número). */
export function processCnj(process: Pick<Process, "cnj" | "number">) {
  const digits = process.cnj ?? onlyDigits(process.number ?? "")
  return digits.length === 20 && hasValidCheckDigits(digits) ? digits : undefined
}

export async function startEnrichment(input: StartInput, deps: ServiceDeps): Promise<StartResult> {
  const cnj = onlyDigits(input.cnj ?? "")
  if (cnj.length !== 20 || !hasValidCheckDigits(cnj)) throw new EnrichmentError("INVALID_CNJ", `número inválido: ${input.cnj}`)
  const { store } = deps
  const org = input.organizationId
  const now = deps.now()

  if (!input.force) {
    const recent = await store.findRecent(org, cnj, new Date(now.getTime() - REUSE_RECENT_MS).toISOString())
    if (recent) return { runId: recent.id, reused: "recent" }
  }

  const running = await store.findRunning(org, cnj)
  if (running && now.getTime() - Date.parse(running.startedAt) < STALE_RUNNING_MS) return { runId: running.id, reused: "running" }
  await store.expireStale(org, cnj, new Date(now.getTime() - STALE_RUNNING_MS).toISOString())

  // O limite vale só para consultas novas (reaproveitar não custa nada à fonte).
  if (!(await deps.allow())) throw new EnrichmentError("RATE_LIMIT", "limite de consultas")

  const initial: RunState = { status: "running", steps: initialSteps(), sources: initialSources(), foundFields: [], missingFields: [], internalErrors: [] }
  const id = await store.create({ organizationId: org, processId: input.process?.id, cnj, requestedBy: input.userId, forced: !!input.force, state: initial })
  if (!id) {
    // Outro pedido criou a execução no mesmo instante.
    const other = await store.findRunning(org, cnj)
    if (other) return { runId: other.id, reused: "running" }
    throw new EnrichmentError("UNAVAILABLE", "corrida ao criar a execução")
  }

  deps.defer(executeRun(id, { ...input, cnj }, deps))
  return { runId: id, reused: false }
}

/** Executa o workflow gravando cada passo. Nunca lança: falha vira execução "failed". */
export async function executeRun(id: string, input: StartInput, deps: ServiceDeps): Promise<RunState | null> {
  const { store } = deps
  const org = input.organizationId
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(message, detail ?? ""))
  try {
    const state = await runWorkflow(
      { cnj: input.cnj, process: input.process, clientName: input.clientName, force: input.force },
      { ...deps.sources, now: deps.now, progress: (s) => store.update(org, id, s, false) },
    )
    await store.update(org, id, state, true, deps.now().toISOString())
    await store.prune(org, input.cnj, KEEP_PER_PROCESS).catch((error) => log("[consulta] falha ao limpar execuções antigas", error))
    return state
  } catch (error) {
    log(`[consulta] execução ${id} falhou`, error)
    const failed: RunState = {
      status: "failed",
      steps: initialSteps().map((s) => ({ ...s, status: "skipped" })),
      sources: initialSources(),
      foundFields: [],
      missingFields: [],
      internalErrors: [{ source: "workflow", code: "UNEXPECTED", detail: error instanceof Error ? error.message : String(error) }],
    }
    failed.steps[failed.steps.length - 1] = { ...failed.steps[failed.steps.length - 1], status: "failed", detail: "Não foi possível concluir a consulta." }
    await store.update(org, id, failed, true, deps.now().toISOString()).catch((e) => log("[consulta] falha ao registrar a falha", e))
    return null
  }
}
