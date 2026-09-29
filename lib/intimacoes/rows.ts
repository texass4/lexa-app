/**
 * Intimações: linha do banco → modelo da tela, e as regras da caixa de triagem.
 * Lógica pura (navegador e testes).
 */

import type { Intimacao, TriageStatus } from "@/types"
import type { Tone } from "@/lib/config"
import type { DeadlineSuggestion } from "./deadline"

export interface IntimacaoDbRow {
  id: string
  organization_id: string
  source: "djen"
  external_id: string
  hash: string | null
  oab_ids: string[] | null
  responsible_id: string | null
  cnj: string | null
  process_number: string | null
  tribunal: string | null
  orgao: string | null
  tipo_comunicacao: string | null
  tipo_documento: string | null
  classe: string | null
  meio: string | null
  available_at: string
  published_at: string | null
  content: string
  document_url: string | null
  official_url: string | null
  parties: Intimacao["parties"] | null
  lawyers: Intimacao["lawyers"] | null
  process_id: string | null
  client_id: string | null
  link_method: Intimacao["linkMethod"] | null
  status: TriageStatus
  suggestion: DeadlineSuggestion | null
  prazo_id: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
}

/** Colunas lidas pela tela (sem `raw`, que só serve para suporte). */
export const INTIMACAO_COLUMNS =
  "id, organization_id, source, external_id, hash, oab_ids, responsible_id, cnj, process_number, tribunal, orgao, tipo_comunicacao, tipo_documento, classe, meio, available_at, published_at, content, document_url, official_url, parties, lawyers, process_id, client_id, link_method, status, suggestion, prazo_id, decision_note, created_at, updated_at"

const opt = <T>(value: T | null | undefined) => (value === null ? undefined : value)

export function toIntimacao(r: IntimacaoDbRow): Intimacao {
  return {
    id: r.id,
    organizationId: r.organization_id,
    source: r.source,
    externalId: r.external_id,
    hash: opt(r.hash),
    oabIds: r.oab_ids ?? [],
    responsibleId: opt(r.responsible_id),
    cnj: opt(r.cnj),
    processNumber: opt(r.process_number),
    tribunal: opt(r.tribunal),
    orgao: opt(r.orgao),
    tipoComunicacao: opt(r.tipo_comunicacao),
    tipoDocumento: opt(r.tipo_documento),
    classe: opt(r.classe),
    meio: opt(r.meio),
    availableAt: r.available_at,
    publishedAt: opt(r.published_at),
    content: r.content,
    documentUrl: opt(r.document_url),
    officialUrl: opt(r.official_url),
    parties: r.parties ?? [],
    lawyers: r.lawyers ?? [],
    processId: opt(r.process_id),
    clientId: opt(r.client_id),
    linkMethod: opt(r.link_method),
    status: r.status,
    suggestion: opt(r.suggestion),
    prazoId: opt(r.prazo_id),
    decisionNote: opt(r.decision_note),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export const TRIAGE_STATUS: Record<TriageStatus, { label: string; tone: Tone }> = {
  pendente: { label: "Aguardando confirmação", tone: "warning" },
  revisao: { label: "Revisar", tone: "danger" },
  sem_processo: { label: "Processo não cadastrado", tone: "violet" },
  confirmada: { label: "Prazo criado", tone: "success" },
  rejeitada: { label: "Sem prazo", tone: "neutral" },
}

/** Ainda pede ação de alguém. */
export const isOpenTriage = (i: Pick<Intimacao, "status">) => i.status === "pendente" || i.status === "revisao" || i.status === "sem_processo"

/** Mais nova primeiro; as abertas antes das decididas. */
export const byTriageOrder = (a: Intimacao, b: Intimacao) =>
  Number(isOpenTriage(b)) - Number(isOpenTriage(a)) || b.availableAt.localeCompare(a.availableAt) || b.createdAt.localeCompare(a.createdAt)

/** Situação depois de vincular um processo: a confiança da sugestão decide. */
export const statusAfterLink = (i: Pick<Intimacao, "suggestion">): TriageStatus => (i.suggestion?.confidence === "alta" ? "pendente" : "revisao")

/** Coloca/troca a intimação na lista, sem duplicar, mantendo a versão mais nova. */
export function upsertIntimacao(list: readonly Intimacao[], next: Intimacao): Intimacao[] {
  const index = list.findIndex((i) => i.id === next.id)
  if (index < 0) return [next, ...list].sort(byTriageOrder)
  if (list[index].updatedAt > next.updatedAt) return list as Intimacao[]
  const copy = [...list]
  copy[index] = next
  return copy.sort(byTriageOrder)
}
