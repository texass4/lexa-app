/**
 * Workflow "Consultar processo" — orquestração das 8 etapas, sem rede nem banco
 * próprios (tudo entra por `deps`, o que deixa o fluxo testável de ponta a ponta).
 *
 *   1 validar → 2 fonte principal (DataJud) → 3 normalizar → 4 complementares
 *   (comunicações DJEN, jurisprudência) → 5 magistrado/órgão → 6 consolidar →
 *   7 registrar → 8 relatório
 *
 * - Cada fonte tem prazo próprio; uma fonte fora do ar não derruba as outras: o
 *   relatório sai parcial, dizendo o que faltou.
 * - Processo do escritório em segredo de justiça: as fontes públicas não são
 *   consultadas (não se presume acesso aos autos) e o cadastro fica como está.
 * - O detalhe técnico de cada falha vai para `internalErrors` (só servidor); a tela
 *   recebe estado + mensagem pública.
 */

import { hasValidCheckDigits, onlyDigits } from "@/lib/processos/cnj"
import { LookupError, type LookupErrorCode } from "@/lib/integrations/legal/errors"
import type { Communication } from "@/lib/integrations/legal/djen/mapper"
import type { ProcessSheet } from "@/lib/services/processos/sheet"
import type { Process } from "@/types"
import { assembleReport, DATAJUD_DOCS_URL, DJEN_PUBLIC_URL, fieldSummary, type JurisprudenceData } from "./report"
import {
  SOURCE_NAMES,
  STEP_LABELS,
  type EnrichmentReport,
  type RunStatus,
  type SourceId,
  type SourceRecord,
  type SourceStatus,
  type StepId,
  type StepState,
  type StepStatus,
} from "./types"

export interface PrimaryResult {
  sheet: ProcessSheet
  checkedAt: string
  cached: boolean
}

export interface CommunicationsResult {
  items: Communication[]
  total: number
  checkedAt: string
  cached: boolean
}

export interface RelatedInput {
  subject?: string
  className?: string
  type?: string
  area?: Process["area"]
}

export interface WorkflowDeps {
  now: () => Date
  /** Fonte principal. Falha → `LookupError`. */
  primary: (cnj: string, options: { force: boolean }) => Promise<PrimaryResult>
  /** Comunicações oficiais; `null` = fonte não habilitada neste ambiente. */
  communications: ((cnj: string, options: { force: boolean }) => Promise<CommunicationsResult>) | null
  /** Jurisprudência relacionada (base da Íntegra); `null` = módulo sem fonte configurada. */
  jurisprudence: ((input: RelatedInput) => Promise<JurisprudenceData>) | null
  /** Recebe o estado a cada etapa (gravado no banco pelo servidor). */
  progress: (state: RunState) => Promise<void>
  /** Prazo de cada fonte, em ms. */
  timeouts?: { primary?: number; complementary?: number }
}

export interface WorkflowInput {
  cnj: string
  process?: Process | null
  clientName?: string
  force?: boolean
}

export interface InternalError {
  source: SourceId | "workflow"
  code: string
  detail?: string
}

export interface RunState {
  status: RunStatus
  steps: StepState[]
  sources: SourceRecord[]
  report?: EnrichmentReport
  foundFields: string[]
  missingFields: string[]
  dataVersion?: string
  internalErrors: InternalError[]
  durationMs?: number
}

const DEFAULT_TIMEOUTS = { primary: 70_000, complementary: 30_000 }

/** Rejeita com `LookupError("TIMEOUT")` se a promessa não terminar no prazo. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LookupError("TIMEOUT", `sem resposta em ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const STATUS_BY_CODE: Partial<Record<LookupErrorCode, SourceStatus>> = {
  NOT_FOUND: "not_found",
  RATE_LIMIT: "rate_limited",
  TIMEOUT: "timeout",
  UNAVAILABLE: "unavailable",
  AUTHENTICATION: "unavailable",
  NOT_CONFIGURED: "not_configured",
  UNSUPPORTED_COURT: "unsupported",
  INVALID_CNJ: "error",
}

/** Mensagens públicas por estado (sem nome de status HTTP, sem detalhe técnico). */
export const PUBLIC_SOURCE_MESSAGE: Record<SourceStatus, string> = {
  ok: "Consulta concluída.",
  not_found: "A fonte não tem informações para este número.",
  unsupported: "A fonte não cobre este tribunal.",
  unavailable: "A fonte não respondeu. Tente novamente mais tarde.",
  timeout: "A fonte demorou demais para responder.",
  rate_limited: "A fonte limitou as consultas por agora. Tente novamente em alguns minutos.",
  skipped: "Não consultada.",
  not_configured: "Fonte não habilitada neste ambiente.",
  error: "Não foi possível concluir a consulta nesta fonte.",
}

function classify(error: unknown): { status: SourceStatus; code: string; detail?: string } {
  if (error instanceof LookupError) return { status: STATUS_BY_CODE[error.code] ?? "error", code: error.code, detail: error.detail }
  return { status: "error", code: "UNEXPECTED", detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
}

const OK_LIKE: SourceStatus[] = ["ok", "skipped", "not_configured", "not_found"]

export function initialSteps(): StepState[] {
  return (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({ id, label: STEP_LABELS[id], status: "pending" }))
}

export function initialSources(): SourceRecord[] {
  return [
    { id: "datajud", name: SOURCE_NAMES.datajud, role: "principal", status: "skipped", fields: [], url: DATAJUD_DOCS_URL },
    { id: "djen", name: SOURCE_NAMES.djen, role: "complementar", status: "skipped", fields: [], url: DJEN_PUBLIC_URL },
    { id: "jurisprudencia", name: SOURCE_NAMES.jurisprudencia, role: "complementar", status: "skipped", fields: [] },
    { id: "cadastro", name: SOURCE_NAMES.cadastro, role: "interna", status: "skipped", fields: [] },
  ]
}

export async function runWorkflow(input: WorkflowInput, deps: WorkflowDeps): Promise<RunState> {
  const started = deps.now().getTime()
  const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts }
  const force = !!input.force
  const state: RunState = { status: "running", steps: initialSteps(), sources: initialSources(), foundFields: [], missingFields: [], internalErrors: [] }

  const iso = () => deps.now().toISOString()
  const emit = async () => {
    try {
      await deps.progress(state)
    } catch (error) {
      // Progresso é para a tela; falha ao gravar não interrompe a consulta.
      state.internalErrors.push({ source: "workflow", code: "PROGRESS", detail: error instanceof Error ? error.message : String(error) })
    }
  }
  const step = async (id: StepId, status: StepStatus, detail?: string) => {
    const s = state.steps.find((x) => x.id === id)!
    s.status = status
    s.detail = detail
    if (status !== "running") s.finishedAt = iso()
    await emit()
  }
  const source = (id: SourceId) => state.sources.find((x) => x.id === id)!
  const begin = (id: SourceId) => {
    const s = source(id)
    s.status = "skipped"
    s.startedAt = iso()
    return deps.now().getTime()
  }
  const finish = (id: SourceId, t0: number, status: SourceStatus, extra: Partial<SourceRecord> = {}) => {
    Object.assign(source(id), { status, finishedAt: iso(), durationMs: deps.now().getTime() - t0, message: PUBLIC_SOURCE_MESSAGE[status], ...extra })
  }
  const fail = (id: SourceId, t0: number, error: unknown) => {
    const { status, code, detail } = classify(error)
    state.internalErrors.push({ source: id, code, detail })
    finish(id, t0, status)
    return status
  }

  /* 1. Validar ------------------------------------------------------------ */
  await step("validar", "running")
  const cnj = onlyDigits(input.cnj ?? "")
  if (cnj.length !== 20 || !hasValidCheckDigits(cnj)) {
    await step("validar", "failed", "Número CNJ inválido: confira os 20 dígitos.")
    for (const s of state.steps) if (s.status === "pending") s.status = "skipped"
    state.status = "failed"
    state.durationMs = deps.now().getTime() - started
    await emit()
    return state
  }
  const process = input.process ?? null
  const secret = !!process?.secret
  await step("validar", "done", process ? "Número válido · processo do cadastro do escritório." : "Número válido.")

  if (process) {
    const t0 = begin("cadastro")
    finish("cadastro", t0, "ok", { message: "Dados do escritório lidos (nunca alterados pela consulta)." })
  } else {
    source("cadastro").message = "O número não está no cadastro do escritório."
  }

  /* 2. Fonte principal ---------------------------------------------------- */
  let primary: PrimaryResult | null = null
  let primaryStatus: SourceStatus = "skipped"
  await step("fonte_principal", "running")
  if (secret) {
    source("datajud").message = "Não consultada: processo em segredo de justiça."
    await step("fonte_principal", "skipped", "Processo em segredo de justiça: a consulta pública não foi feita.")
  } else {
    const t0 = begin("datajud")
    try {
      primary = await withTimeout(deps.primary(cnj, { force }), timeouts.primary)
      primaryStatus = "ok"
      finish("datajud", t0, "ok", {
        cached: primary.cached,
        checkedAt: primary.checkedAt,
        dataVersion: primary.sheet.updatedAt,
        message: primary.cached ? "Dados da consulta recente do escritório (cache)." : "Consulta concluída.",
      })
      await step("fonte_principal", "done", primary.cached ? "Dados encontrados (consulta recente reaproveitada)." : "Dados encontrados.")
    } catch (error) {
      primaryStatus = fail("datajud", t0, error)
      await step(
        "fonte_principal",
        primaryStatus === "not_found" ? "done" : "failed",
        primaryStatus === "not_found" ? "A fonte não tem este número." : PUBLIC_SOURCE_MESSAGE[primaryStatus],
      )
    }
  }

  /* 3. Normalizar --------------------------------------------------------- */
  if (primary) await step("normalizar", "done", `${primary.sheet.movements.length} movimentações e dados do processo organizados.`)
  else await step("normalizar", "skipped", "Sem dados da fonte principal para organizar.")

  /* 4. Complementares (em paralelo, cada uma com o seu prazo) ------------- */
  await step("complementares", "running")
  // Objeto (e não variáveis soltas): as consultas abaixo rodam em paralelo e escrevem aqui.
  const extra: { communications: CommunicationsResult | null; communicationsStatus: SourceStatus; jurisprudence: JurisprudenceData | null } = {
    communications: null,
    communicationsStatus: "not_configured",
    jurisprudence: null,
  }

  const runCommunications = async () => {
    if (secret) {
      extra.communicationsStatus = "skipped"
      source("djen").message = "Não consultada: processo em segredo de justiça."
      return
    }
    if (!deps.communications) {
      extra.communicationsStatus = "not_configured"
      Object.assign(source("djen"), { status: "not_configured", message: PUBLIC_SOURCE_MESSAGE.not_configured })
      return
    }
    const t0 = begin("djen")
    try {
      const communications = await withTimeout(deps.communications(cnj, { force }), timeouts.complementary)
      extra.communications = communications
      const found = communications.items.length
      extra.communicationsStatus = found ? "ok" : "not_found"
      finish("djen", t0, extra.communicationsStatus, {
        cached: communications.cached,
        checkedAt: communications.checkedAt,
        message: found ? `${found} comunicação(ões) publicada(s) encontrada(s).` : "Nenhuma comunicação publicada para este número.",
      })
    } catch (error) {
      extra.communicationsStatus = fail("djen", t0, error)
    }
  }

  const runJurisprudence = async () => {
    if (!deps.jurisprudence) {
      Object.assign(source("jurisprudencia"), { status: "not_configured", message: "Base de jurisprudência não configurada." })
      return
    }
    const sheet = primary?.sheet
    const query: RelatedInput = {
      subject: sheet?.subjects?.[0] ?? sheet?.subject ?? process?.subject,
      className: sheet?.className ?? process?.className,
      type: process?.type,
      area: process?.area,
    }
    if (!query.subject && !query.className && !query.type) {
      Object.assign(source("jurisprudencia"), { status: "skipped", message: "Sem assunto, classe ou tipo de ação para orientar a pesquisa." })
      return
    }
    const t0 = begin("jurisprudencia")
    try {
      const jurisprudence = await withTimeout(deps.jurisprudence(query), timeouts.complementary)
      extra.jurisprudence = jurisprudence
      finish("jurisprudencia", t0, jurisprudence.items.length ? "ok" : "not_found", {
        checkedAt: iso(),
        message: jurisprudence.items.length ? `${jurisprudence.total} decisão(ões) potencialmente relacionada(s).` : "Nenhuma decisão relacionada na base.",
      })
    } catch (error) {
      fail("jurisprudencia", t0, error)
    }
  }

  await Promise.all([runCommunications(), runJurisprudence()])
  const complementaryFailed = state.sources.filter((s) => s.role === "complementar" && !OK_LIKE.includes(s.status))
  await step(
    "complementares",
    complementaryFailed.length ? "partial" : "done",
    complementaryFailed.length ? `Sem resposta de: ${complementaryFailed.map((s) => s.name).join(", ")}.` : "Fontes complementares consultadas.",
  )

  /* 5–6. Magistrado, consolidação ---------------------------------------- */
  const report = assembleReport({
    cnj,
    now: deps.now(),
    process,
    clientName: input.clientName,
    primary: primary ? { sheet: primary.sheet, checkedAt: primary.checkedAt } : null,
    primaryStatus,
    communications: extra.communications,
    communicationsStatus: extra.communicationsStatus,
    jurisprudence: extra.jurisprudence,
    secretSkipped: secret,
  })
  await step(
    "magistrado",
    "done",
    report.magistrate.mentions.length
      ? `${report.magistrate.mentions.length} menção(ões) em comunicação oficial — não confirma o responsável atual.`
      : report.magistrate.unit
        ? "Órgão julgador identificado; magistrado não informado pelas fontes."
        : "Magistrado e órgão julgador não informados pelas fontes.",
  )
  await step(
    "consolidar",
    "done",
    [`${report.movements.total} movimentação(ões)`, report.conflicts.length ? `${report.conflicts.length} divergência(s) entre fontes` : "sem divergências"].join(" · "),
  )

  /* Fontes: campos que cada uma trouxe ------------------------------------ */
  for (const s of state.sources) {
    s.fields = report.fields.filter((f) => f.values.some((v) => v.source === s.id)).map((f) => f.label)
  }
  if (report.parties.items.some((p) => p.source === "djen")) source("djen").fields.push("Partes")
  if (report.parties.lawyers.length) source("djen").fields.push("Representantes (advogados)")
  if (report.magistrate.mentions.length) source("djen").fields.push("Menções a magistrado")
  if (report.communications.items.length) source("djen").fields.push("Comunicações publicadas")
  if (report.movements.total) source("datajud").fields.push("Movimentações")
  if (report.jurisprudence.items.length) source("jurisprudencia").fields.push("Decisões relacionadas")

  const { found, missing } = fieldSummary(report)
  state.report = report
  state.foundFields = found
  state.missingFields = missing
  state.dataVersion = primary?.sheet.updatedAt

  /* Resultado ------------------------------------------------------------- */
  const anyData = !!primary || extra.communicationsStatus === "ok" || !!process
  const failedSources = state.sources.filter((s) => !OK_LIKE.includes(s.status))
  state.status = !anyData ? "failed" : failedSources.length ? "partial" : "completed"

  /* 7–8. Registrar e relatório -------------------------------------------- */
  await step("registrar", "done", `${state.sources.filter((s) => s.startedAt).length} fonte(s) registrada(s) com horário e resultado.`)
  state.durationMs = deps.now().getTime() - started
  await step(
    "relatorio",
    state.status === "failed" ? "failed" : "done",
    state.status === "completed" ? "Relatório pronto." : state.status === "partial" ? "Relatório parcial: veja as fontes que falharam." : "Nenhuma fonte trouxe dados.",
  )
  return state
}
