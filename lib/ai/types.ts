/**
 * Contratos da Íntegra IA compartilhados entre servidor e navegador.
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

/** `consulta`: uma fonte da Consulta processual (DataJud, DJEN, cadastro do escritório). */
export type SourceKind = "movement" | "process" | "task" | "deadline" | "appointment" | "document" | "client" | "invoice" | "jurisprudence" | "consulta"

/**
 * Registro real da Íntegra que o modelo recebeu com uma referência curta ("M3").
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
  /** Alertas da verificação feita pela Íntegra sobre a resposta (ex.: data que não consta dos dados). */
  warnings: string[]
  /** De onde veio a análise, em uma frase ("Baseado em 12 movimentações…"). */
  basis: string
  generatedAt: string
  cached: boolean
}

/** Números calculados pelo banco — a IA só interpreta. */
export interface OfficeMetrics {
  clients?: { total: number; active: number; delinquent: number }
  processes?: {
    total: number
    active: number
    movedLast7Days: number
    staleOver60Days: number
    withDeadlineNext7Days: number
    byArea: Record<string, number>
  }
  tasks?: { open: number; overdue: number; dueToday: number; dueNext7Days: number }
  agenda?: { next7Days: number; today: number }
  documents?: { total: number; addedLast30Days: number }
  finance?: {
    openAmount: number
    overdueAmount: number
    overdueInvoices: number
    clientsWithOverdue: number
    receivedThisMonth: number
    expectedThisMonth: number
  }
}

export interface OfficeOverviewResult extends AIResult<OfficeOverview> {
  metrics: OfficeMetrics
}

/* ------------------------------- financeiro ------------------------------- */

/** Leitura do financeiro: interpretação dos números calculados — nunca números novos. */
export interface FinanceAnalysis {
  leitura: string
  pontos_atencao: AttentionPoint[]
  sugestoes: string[]
  perguntas_para_verificar: string[]
}

/** Números do financeiro calculados das faturas reais (a IA só interpreta). */
export interface FinanceMetrics {
  month: string
  previousMonth: string
  receivedThisMonth: number
  expectedThisMonth: number
  /** Recebido no mês anterior até o mesmo dia de hoje. */
  receivedPreviousSamePeriod: number
  openAmount: number
  overdueAmount: number
  overdueInvoices: number
  clientsWithOverdue: number
  dueNext30Days: number
  dueNext30DaysInvoices: number
}

export interface FinanceAnalysisResult extends AIResult<FinanceAnalysis> {
  metrics: FinanceMetrics
}

/* ---------------------------------- chat ---------------------------------- */

export type ChatRole = "user" | "assistant"

export interface AIMessage {
  role: ChatRole
  content: string
}

export type ChatScope = { type: "process"; id: string } | { type: "client"; id: string } | { type: "office" } | { type: "jurisprudence"; id: string }

/**
 * De onde a conversa tira as respostas, escolhido pela pessoa no chat:
 * - `all`: dados do escritório da conversa e, quando a pergunta é sobre decisões, a base de jurisprudência;
 * - `office`: só os dados do escritório (nunca pesquisa jurisprudência);
 * - `jurisprudence`: só a base de jurisprudência, pesquisada a cada pergunta (sem dados do escritório).
 * Numa conversa sobre uma decisão, o modo não se aplica.
 */
export const CHAT_MODES = ["all", "office", "jurisprudence"] as const
export type ChatMode = (typeof CHAT_MODES)[number]

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
  | "PLAN_LIMIT"
  | "PROVIDER_RATE_LIMITED"
  | "TIMEOUT"
  | "CANCELLED"
  | "EMPTY_RESPONSE"
  | "INVALID_RESPONSE"
  | "BLOCKED"
  | "UNAVAILABLE"
  | "UNEXPECTED"
  /** Conversa por voz: a gravação não tinha fala inteligível. */
  | "NO_SPEECH"
  /** Conversa por voz: áudio fora do formato, curto ou longo demais. */
  | "INVALID_AUDIO"

/* ------------------------------ jurisprudência ----------------------------- */

/** Leitura de UMA decisão real da base. A IA interpreta; não é a fonte. */
export interface JurisprudenceAnalysis {
  resumo: string
  tese_principal: string
  resultado: string
  pontos_relevantes: string[]
  fundamentos_mencionados: string[]
  relevancia_para_pesquisa: string
  /** Só quando um processo foi informado. */
  comparacao_com_processo: string
  informacoes_ausentes: string[]
}

export type Similarity = "alta" | "media" | "baixa"

/** Leitura de um conjunto de resultados reais frente a um processo. */
/** Resumo da Consulta processual: o que está confirmado, o que é inferência e o que falta. */
export interface EnrichmentSummary {
  resumo: string
  fatos_confirmados: { texto: string; refs: string[] }[]
  inferencias: { texto: string; refs: string[] }[]
  /** Preenchido pela Íntegra a partir do relatório (não pelo modelo). */
  ausentes: string[]
  cuidados: string[]
}

/** Trecho de uma decisão usado na análise: literal só se CONFERIDO com o texto da base. */
export interface StrategyExcerpt {
  texto: string
  tipo: "literal" | "parafrase"
  /** Preenchida pela Íntegra quando o trecho dito literal não confere com a decisão. */
  nota?: string
}

export interface StrategyPrecedent {
  ref: string
  por_que_importa: string
  semelhancas: string[]
  distincoes: string[]
  compatibilidade: string
  limitacoes: string[]
  trechos: StrategyExcerpt[]
}

export interface StrategyThesis {
  tese: string
  justificativa: string
  requisitos: string[]
  elementos_do_caso: string[]
  refs: string[]
  distincoes: string[]
  riscos: string[]
  informacoes_necessarias: string[]
}

/** Análise comparativa: só sobre precedentes REAIS recuperados da base; a IA interpreta. */
export interface JurisprudenceStrategy {
  sintese: string
  precedentes: StrategyPrecedent[]
  teses_favoraveis: StrategyThesis[]
  contrarios_e_distincoes: { ref: string; fundamento_contrario: string; distincao_possivel: string; como_demonstrar: string }[]
  riscos: { texto: string; refs: string[] }[]
  lacunas_probatorias: { fato: string; situacao: "informado" | "prova mencionada" | "sem prova informada" | "contraditorio"; observacao: string }[]
  cenarios: { se: string; entao: string; refs: string[] }[]
  proximos_pontos: string[]
  informacoes_ausentes: string[]
}

/** O que a pesquisa encontrou, calculado pela Íntegra (não pelo modelo) — a tela mostra junto. */
export interface StrategyRetrievalView {
  status: "ok" | "sem_resultados" | "nao_executada" | "indisponivel" | "cancelada"
  support: "suficiente" | "parcial" | "insuficiente"
  message: string
  caso: {
    profundidade: "simples" | "completa"
    questoes: { questao: string; tese?: string; ampla: boolean; roteiro: { texto: string; situacao: string; detalhe?: string }[] }[]
    fatos: { fato: string; origem: "pergunta" | "processo"; trecho?: string }[]
    provas: { prova: string; situacao: "mencionada" | "ausente"; origem: "pergunta" | "processo" }[]
    posicao: "autor" | "reu" | "nao_informada"
    fase?: string
    lacunas: string[]
  }
  precedentes: {
    ref: string
    id: string
    label: string
    href: string
    questao: string
    tribunal: string
    orgao?: string
    relator?: string
    dataJulgamento?: string
    publicacao?: string
    assunto?: string
    nivel: "aplicavel" | "relacionada"
    posicao: "acolhe" | "rejeita" | "indeterminada"
    posicaoCliente: "favoravel" | "contraria" | "indeterminada"
    trechoPosicao?: string
    ressalva?: string
    resultado?: string
    trecho?: { campo: "ementa" | "tese"; texto: string; cortado: boolean }
    fatosEmComum: string[]
    distincoes: string[]
    metadadosAusentes: string[]
    pontuacao: number
  }[]
  consultas: { questao: string; tipo: string; conceitos: string[]; resultados: number; situacao: string }[]
  metricas: { candidatas: number; unicas: number; duplicatas: number; pertinentes: number; selecionadas: number; aplicaveis: number; contrarias: number; cobertura: number; ms: number }
}

export interface RelatedJurisprudenceAnalysis {
  visao_geral: string
  decisoes: { ref: string; semelhanca: Similarity; motivo: string }[]
  cuidados: string[]
}
