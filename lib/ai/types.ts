/**
 * Contratos da LEXA IA compartilhados entre servidor e navegador.
 *
 * Só tipos e constantes: nada aqui fala com a Gemini, com o banco ou com o
 * ambiente. Os nomes dos campos das análises estão em português porque são
 * exatamente os que o modelo devolve (e que o schema valida).
 */

import type { Priority } from "@/types"

export type Confidence = "alto" | "medio" | "baixo"

/** Fato registrado, inferência da IA ou algo que o advogado precisa conferir. */
export type Nature = "fato" | "inferencia" | "verificacao"

export interface AttentionPoint {
  texto: string
  natureza: Nature
  /** Referências às fontes (ex.: "M3", "T1") usadas para sustentar o ponto. */
  refs: string[]
}

export interface ActionSuggestion {
  titulo: string
  descricao: string
  prioridade: Priority
  justificativa: string
  refs: string[]
}

export interface ReferencedNote {
  ref: string
  comentario: string
}

export interface ProcessSummary {
  resumo: string
  situacao: string
  fatos_relevantes: string[]
  movimentacoes_relevantes: ReferencedNote[]
  pontos_atencao: AttentionPoint[]
  proximas_acoes: string[]
  informacoes_ausentes: string[]
  nivel_confianca: Confidence
}

export interface MovementAnalysis {
  o_que_aconteceu: string
  o_que_o_registro_informa: string[]
  o_que_nao_e_possivel_concluir: string[]
  pontos_atencao: string[]
  /** Zero ou uma sugestão — nunca criada automaticamente. */
  sugestoes_tarefa: ActionSuggestion[]
  nivel_confianca: Confidence
}

export interface NextActions {
  pontos_atencao: AttentionPoint[]
  sugestoes: ActionSuggestion[]
  informacoes_ausentes: string[]
}

export interface ClientSummary {
  resumo: string
  processos: ReferencedNote[]
  pontos_atencao: AttentionPoint[]
  atividades_recentes: string[]
  pendencias: string[]
  proximas_acoes: string[]
  informacoes_ausentes: string[]
  nivel_confianca: Confidence
}

export interface OfficeOverview {
  visao_geral: string
  pontos_atencao: AttentionPoint[]
  processos_para_analise: ReferencedNote[]
  pendencias: string[]
  tarefas_atrasadas: string
  situacao_financeira: string
  sugestoes_organizacao: string[]
  perguntas_para_verificar: string[]
}

export interface ChatReply {
  text: string
}

/* --------------------------------- fontes --------------------------------- */

export type SourceKind = "movement" | "process" | "task" | "appointment" | "document" | "client" | "invoice"

/**
 * Registro real do LEXA que o modelo recebeu com uma referência curta ("M3").
 * A interface mostra estes dados — vindos do banco, não do modelo — quando a
 * resposta cita a referência.
 */
export interface AISource {
  ref: string
  kind: SourceKind
  id: string
  label: string
  /** ISO local, quando o registro tem data. */
  date?: string
  processId?: string
  href?: string
}

export type AISources = Record<string, AISource>

/* -------------------------------- envelope -------------------------------- */

export interface AIResult<T> {
  data: T
  sources: AISources
  /** Alertas da verificação feita pelo LEXA sobre a resposta (ex.: data que não consta dos dados). */
  warnings: string[]
  /** De onde veio a análise, em uma frase ("Baseado em 12 movimentações…"). */
  basis: string
  generatedAt: string
  cached: boolean
}

/** Números calculados pelo banco — a IA só interpreta. */
export interface OfficeMetrics {
  clients?: { total: number; active: number; delinquent: number }
  processes?: { total: number; active: number; movedLast7Days: number; staleOver60Days: number; withDeadlineNext7Days: number; byArea: Record<string, number> }
  tasks?: { open: number; overdue: number; dueToday: number; dueNext7Days: number }
  agenda?: { next7Days: number; today: number }
  documents?: { total: number; addedLast30Days: number }
  finance?: { openAmount: number; overdueAmount: number; overdueInvoices: number; clientsWithOverdue: number; receivedThisMonth: number; expectedThisMonth: number }
}

export interface OfficeOverviewResult extends AIResult<OfficeOverview> {
  metrics: OfficeMetrics
}

/* ---------------------------------- chat ---------------------------------- */

export type ChatRole = "user" | "assistant"

export interface AIMessage {
  role: ChatRole
  content: string
}

export type ChatScope = { type: "process"; id: string } | { type: "client"; id: string } | { type: "office" }

export const CHAT_LIMITS = {
  /** Mensagens anteriores enviadas ao modelo (o resto fica só na tela). */
  history: 10,
  /** Caracteres por mensagem do usuário. */
  messageChars: 2000,
} as const

/* --------------------------------- estado --------------------------------- */

export interface AIStatus {
  enabled: boolean
  configured: boolean
}

export type AIErrorCode =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "INVALID_API_KEY"
  | "MODEL_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "INSUFFICIENT_DATA"
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "TIMEOUT"
  | "CANCELLED"
  | "EMPTY_RESPONSE"
  | "INVALID_RESPONSE"
  | "BLOCKED"
  | "UNAVAILABLE"
  | "UNEXPECTED"
