/**
 * Triagem jurídica — o modelo comum a todas as fontes (DJEN, DataJud…): linha do
 * banco → evento da tela, abas, prioridade e o que mostrar como "exige ação" e
 * "prazo sugerido". Lógica pura (navegador, servidor e testes).
 *
 *   evento → interpretação → atenção → decisão → ação
 *
 * Nenhuma fonte tem regra de triagem própria: todas gravam `triage_items` pelo mesmo
 * caminho (`save_triage_items`, `0012_triagem.sql`) e a tela só conhece este modelo.
 */

import type { Tone } from "@/lib/core/config"
import { readableContent } from "@/lib/integrations/legal/djen/mapper"
import type { DeadlineSuggestion } from "@/lib/intimacoes/deadline"
import type { TriageAI, TriageItem, TriageKind, TriageRequiresAction, TriageSource, TriageState } from "@/types"

export interface TriageDbRow {
  id: string
  organization_id: string
  kind: TriageKind
  source: TriageSource
  source_key: string
  intimacao_id: string | null
  process_id: string | null
  client_id: string | null
  link_method: TriageItem["linkMethod"] | null
  cnj: string | null
  process_number: string | null
  event_date: string
  available_at: string | null
  title: string
  excerpt: string | null
  tribunal: string | null
  orgao: string | null
  responsible_id: string | null
  suggestion: DeadlineSuggestion | null
  ai: TriageAI | null
  ai_status: TriageItem["aiStatus"]
  state: TriageState
  decision: TriageItem["decision"] | null
  review_reason: string | null
  decision_note: string | null
  prazo_id: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export const TRIAGE_COLUMNS =
  "id, organization_id, kind, source, source_key, intimacao_id, process_id, client_id, link_method, cnj, process_number, event_date, available_at, title, excerpt, tribunal, orgao, responsible_id, suggestion, ai, ai_status, state, decision, review_reason, decision_note, prazo_id, decided_by, decided_at, created_at, updated_at"

const opt = <T>(value: T | null | undefined) => (value === null ? undefined : value)

export function toTriageItem(r: TriageDbRow): TriageItem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    kind: r.kind,
    source: r.source,
    sourceKey: r.source_key,
    intimacaoId: opt(r.intimacao_id),
    processId: opt(r.process_id),
    clientId: opt(r.client_id),
    linkMethod: opt(r.link_method),
    cnj: opt(r.cnj),
    processNumber: opt(r.process_number),
    eventDate: r.event_date,
    availableAt: opt(r.available_at),
    title: r.title,
    excerpt: opt(r.excerpt),
    tribunal: opt(r.tribunal),
    orgao: opt(r.orgao),
    responsibleId: opt(r.responsible_id),
    suggestion: opt(r.suggestion),
    ai: opt(r.ai),
    aiStatus: r.ai_status,
    state: r.state,
    decision: opt(r.decision),
    reviewReason: opt(r.review_reason),
    decisionNote: opt(r.decision_note),
    prazoId: opt(r.prazo_id),
    decidedBy: opt(r.decided_by),
    decidedAt: opt(r.decided_at),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/* --------------------------------- rótulos --------------------------------- */

export const KIND_LABEL: Record<TriageKind, string> = { intimacao: "Intimação", movimentacao: "Movimentação" }
export const SOURCE_LABEL: Record<TriageSource, string> = { djen: "DJEN", datajud: "DataJud" }

/** Estado na tela (decidido mostra a decisão). */
export function stateBadge(item: Pick<TriageItem, "state" | "decision">): { label: string; tone: Tone } {
  switch (item.state) {
    case "pendente":
      return { label: "Pendente", tone: "warning" }
    case "em_revisao":
      return { label: "Em revisão", tone: "danger" }
    case "ignorado":
      return { label: "Ignorado", tone: "neutral" }
    case "decidido":
      return item.decision === "prazo_criado" ? { label: "Prazo criado", tone: "success" } : { label: "Sem prazo", tone: "neutral" }
  }
}

/* ---------------------------------- abas ----------------------------------- */

export type TriageTab = "a_revisar" | "sem_processo" | "revisar" | "decididos"

/** Ainda pede atenção de alguém. */
export const isOpen = (item: Pick<TriageItem, "state">) => item.state === "pendente" || item.state === "em_revisao"

/**
 * Cada evento está em exatamente uma aba:
 * - A revisar: pendente, com processo;
 * - Sem processo: aberto, sem processo vinculado;
 * - Revisar: em revisão manual, com processo;
 * - Decididos: decidido ou ignorado.
 */
export function tabOf(item: Pick<TriageItem, "state" | "processId">): TriageTab {
  if (!isOpen(item)) return "decididos"
  if (!item.processId) return "sem_processo"
  return item.state === "em_revisao" ? "revisar" : "a_revisar"
}

/* ------------------------- o que mostrar em cada item ----------------------- */

export interface SuggestedDeadline {
  fatalDate: string
  days: number
  unit: "uteis" | "corridos"
  /** De onde veio o número de dias. */
  from: "teor" | "ia" | "advogado"
  excerpt?: string
  basis: string[]
}

/**
 * Prazo sugerido: o das regras (lido do teor) tem precedência; o da IA só aparece
 * quando as regras não acharam nenhum — e o evento já está em revisão nesse caso.
 */
export function suggestedDeadline(item: Pick<TriageItem, "suggestion" | "ai">): SuggestedDeadline | undefined {
  const s = item.suggestion
  if (s?.fatalDate && s.days && s.unit) {
    return { fatalDate: s.fatalDate, days: s.days, unit: s.unit, from: s.daysSource ?? "teor", excerpt: s.excerpt, basis: s.basis }
  }
  const ai = item.ai
  if (ai?.fatalDate && ai.term) {
    return { fatalDate: ai.fatalDate, days: ai.term.days, unit: ai.term.unit, from: "ia", excerpt: ai.term.excerpt, basis: ai.basis ?? [] }
  }
  return undefined
}

/**
 * "Exige ação?": a leitura da IA quando existe; sem ela, só o que as regras sabem
 * afirmar (um prazo explícito no teor exige ação). Sem base, não diz nada.
 */
export function requiresAction(item: Pick<TriageItem, "ai" | "suggestion">): { value: TriageRequiresAction; by: "ia" | "teor" } | undefined {
  if (item.ai) return { value: item.ai.requiresAction, by: "ia" }
  if (item.suggestion?.days) return { value: "sim", by: "teor" }
  return undefined
}

/** Resumo em uma frase: o da IA, ou o começo do original. */
export const summaryOf = (item: Pick<TriageItem, "ai" | "excerpt" | "title">) => item.ai?.summary ?? item.excerpt ?? item.title

/* -------------------------------- prioridade -------------------------------- */

export type Urgency = "alta" | "media" | "baixa"

const DAY = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

/** Dias corridos até a data fatal sugerida (negativo = já passou). */
function daysLeft(item: Pick<TriageItem, "suggestion" | "ai">, today: string) {
  const fatal = suggestedDeadline(item)?.fatalDate
  return fatal ? daysBetween(today, fatal) : undefined
}

/**
 * Urgência de um evento aberto: prazo sugerido em até 5 dias (ou vencido) é alta;
 * prazo em até 15 dias, ação exigida ou revisão pendente é média; o resto, baixa.
 */
export function urgencyOf(item: Pick<TriageItem, "state" | "suggestion" | "ai">, today: string): Urgency {
  if (!isOpen(item)) return "baixa"
  const left = daysLeft(item, today)
  if (left !== undefined && left <= 5) return "alta"
  if ((left !== undefined && left <= 15) || item.state === "em_revisao" || requiresAction(item)?.value === "sim") return "media"
  return "baixa"
}

const URGENCY_RANK: Record<Urgency, number> = { alta: 0, media: 1, baixa: 2 }
const ACTION_RANK: Record<TriageRequiresAction | "none", number> = { sim: 0, incerto: 1, none: 2, nao: 3 }

/**
 * Ordem da Triagem: abertos primeiro; depois urgência, necessidade de ação e prazo
 * (o mais próximo antes); por fim, o mais recente.
 */
export function byPriority(today: string) {
  return (a: TriageItem, b: TriageItem) =>
    Number(isOpen(b)) - Number(isOpen(a)) ||
    URGENCY_RANK[urgencyOf(a, today)] - URGENCY_RANK[urgencyOf(b, today)] ||
    ACTION_RANK[requiresAction(a)?.value ?? "none"] - ACTION_RANK[requiresAction(b)?.value ?? "none"] ||
    (suggestedDeadline(a)?.fatalDate ?? "9999").localeCompare(suggestedDeadline(b)?.fatalDate ?? "9999") ||
    b.eventDate.localeCompare(a.eventDate) ||
    b.createdAt.localeCompare(a.createdAt)
}

/** Coloca/troca o evento na lista, sem duplicar, mantendo a versão mais nova. */
export function upsertTriage(list: readonly TriageItem[], next: TriageItem): TriageItem[] {
  const index = list.findIndex((i) => i.id === next.id)
  if (index < 0) return [next, ...list]
  if (list[index].updatedAt > next.updatedAt) return list as TriageItem[]
  const copy = [...list]
  copy[index] = next
  return copy
}

/** Trecho legível para a lista (sem HTML, numa linha). O original continua intacto na fonte. */
export function excerptOf(text: string, max = 400) {
  const plain = readableContent(text).replace(/\s+/g, " ").trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}
