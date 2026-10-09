/**
 * Consulta processual (workflow "Consultar processo") — o contrato entre o servidor
 * e a tela. Sem nada de servidor aqui: este arquivo é importado pelo navegador.
 *
 * Princípio: cada informação diz de onde veio (`source`), quando foi conferida
 * (`checkedAt`) e, quando existe, onde verificar (`url`). O que nenhuma fonte trouxe
 * aparece como "Não disponível na fonte consultada" — nunca é completado.
 */

/** Fontes que o workflow conhece. */
export type SourceId = "datajud" | "djen" | "jurisprudencia" | "cadastro" | "tribunal"

export type SourceStatus =
  | "ok"
  | "not_found"
  | "unsupported"
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "skipped"
  | "not_configured"
  | "error"

export interface SourceRecord {
  id: SourceId
  name: string
  role: "principal" | "complementar" | "interna"
  status: SourceStatus
  /** ISO (UTC). */
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  /** A resposta veio do cache do escritório (a fonte não foi chamada de novo). */
  cached?: boolean
  /** ISO (UTC) de quando a fonte foi efetivamente consultada (pode ser anterior, se do cache). */
  checkedAt?: string
  /** Versão/data dos dados informada pela fonte (ex.: última atualização no DataJud). */
  dataVersion?: string
  /** Campos que esta fonte efetivamente trouxe (rótulos de tela). */
  fields: string[]
  /** Mensagem pública (sem detalhe técnico). */
  message?: string
  /** Onde conhecer/verificar a fonte. */
  url?: string
}

export type StepId = "validar" | "fonte_principal" | "normalizar" | "complementares" | "magistrado" | "consolidar" | "registrar" | "relatorio"

export type StepStatus = "pending" | "running" | "done" | "partial" | "failed" | "skipped"

export interface StepState {
  id: StepId
  label: string
  status: StepStatus
  /** Frase pública sobre o resultado da etapa. */
  detail?: string
  finishedAt?: string
}

export type RunStatus = "running" | "completed" | "partial" | "failed"

/** Um valor e a sua origem. */
export interface ReportValue {
  value: string
  source: SourceId
  /** ISO (UTC) de quando a fonte informou. */
  checkedAt?: string
  /** Onde verificar esta informação na fonte oficial. */
  url?: string
  note?: string
}

export type FieldKey =
  | "numero"
  | "tribunal"
  | "grau"
  | "sistema"
  | "formato"
  | "classe"
  | "assuntos"
  | "orgao_julgador"
  | "codigo_orgao"
  | "municipio_ibge"
  | "data_ajuizamento"
  | "situacao"
  | "valor_causa"
  | "prioridades"
  | "sigilo"
  | "ultima_atualizacao"

export interface ReportField {
  key: FieldKey
  label: string
  /** Vazio = não disponível nas fontes consultadas. Mais de um = fontes diferentes. */
  values: ReportValue[]
  /** As fontes informam valores diferentes (nada é escolhido automaticamente). */
  conflict?: boolean
}

export interface ReportParty {
  name: string
  /** Polo como a fonte informou ("Ativo", "Passivo"…); sem polo, `undefined`. */
  pole?: string
  role?: string
  source: SourceId
  /** `YYYY-MM-DD` da publicação de onde veio, quando houver. */
  date?: string
  url?: string
}

export interface ReportLawyer {
  name: string
  /** "SC 12.345" — inscrição como publicada. */
  oab?: string
  source: SourceId
  date?: string
  url?: string
}

export type MagistrateRole = "relator" | "juiz" | "desembargador" | "ministro"

/**
 * Magistrado CITADO numa comunicação oficial, com o papel escrito no próprio texto.
 * Não é "o juiz responsável atual": é uma menção datada, com o trecho e o link.
 */
export interface MagistrateMention {
  name: string
  role: MagistrateRole
  /** Rótulo do papel como o texto traz ("Relator(a)", "Juiz(a) de Direito"…). */
  roleLabel: string
  /** `YYYY-MM-DD` da comunicação. */
  date?: string
  source: SourceId
  url?: string
  /** Trecho curto do texto publicado onde o nome aparece. */
  excerpt: string
}

export interface MagistrateReport {
  unit?: ReportValue
  unitCode?: string
  tribunal?: ReportValue
  mentions: MagistrateMention[]
  /** Explica sempre o limite da identificação. */
  note: string
  /** Onde verificar (site oficial do tribunal). */
  verifyUrl?: string
}

export interface ReportMovement {
  /** ISO local. */
  at: string
  title: string
  description?: string
  code?: number
  unit?: string
}

export interface ReportCommunication {
  /** `YYYY-MM-DD` */
  date?: string
  type?: string
  documentType?: string
  unit?: string
  className?: string
  url?: string
  excerpt?: string
}

export interface ReportJurisprudence {
  id: string
  label: string
  date?: string
  excerpt: string
  /** Página da decisão na Íntegra. */
  href: string
  /** Página oficial do tribunal, quando a base tem. */
  sourceUrl?: string
}

export interface ReportLink {
  label: string
  url: string
  source: SourceId
  note?: string
}

export interface ReportConflict {
  label: string
  values: ReportValue[]
  note: string
}

/** O que o cadastro do escritório tem — sempre preservado pela consulta. */
export interface OfficeComparison {
  processId: string
  label: string
  secret: boolean
  /** Cadastro feito à mão (origin "manual"). */
  manual: boolean
  fields: { label: string; office: string; source?: string; differs: boolean }[]
  /** "Atualizar processo" faz sentido (CNJ válido, fonte principal respondeu, sem segredo). */
  canApply: boolean
  applyNote: string
}

export interface EnrichmentReport {
  cnj: string
  number: string
  /** ISO (UTC). */
  generatedAt: string
  summary: {
    title: string
    tribunal?: string
    unit?: string
    situation?: string
    lastMovement?: { title: string; at: string }
    movementsTotal: number
    /** A fonte principal não tem este número. */
    notFound: boolean
  }
  fields: ReportField[]
  parties: { items: ReportParty[]; lawyers: ReportLawyer[]; note: string }
  magistrate: MagistrateReport
  movements: { items: ReportMovement[]; total: number; truncated: boolean }
  communications: { items: ReportCommunication[]; total: number; truncated: boolean }
  jurisprudence: { items: ReportJurisprudence[]; total: number; basis: string[]; message?: string }
  links: ReportLink[]
  conflicts: ReportConflict[]
  office?: OfficeComparison
  unavailable: { label: string; reason: string }[]
  /** Avisos importantes (sigilo, segredo de justiça, não encontrado). */
  notices: string[]
}

/** Execução como a tela recebe (sem erros internos). */
export interface EnrichmentRun {
  id: string
  cnj: string
  processId?: string
  status: RunStatus
  forced: boolean
  startedAt: string
  finishedAt?: string
  durationMs?: number
  steps: StepState[]
  sources: SourceRecord[]
  report?: EnrichmentReport
  foundFields: string[]
  missingFields: string[]
  dataVersion?: string
}

/** Texto padrão do que nenhuma fonte trouxe. */
export const NOT_AVAILABLE = "Não disponível na fonte consultada"

export const SOURCE_NAMES: Record<SourceId, string> = {
  datajud: "DataJud (CNJ)",
  djen: "Comunicações processuais (DJEN/CNJ)",
  jurisprudencia: "Base de jurisprudência da Íntegra (STJ)",
  cadastro: "Cadastro do escritório",
  tribunal: "Site oficial do tribunal",
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  ok: "Consultada",
  not_found: "Sem resultado",
  unsupported: "Não suportada",
  unavailable: "Indisponível",
  timeout: "Sem resposta a tempo",
  rate_limited: "Limite de consultas",
  skipped: "Não consultada",
  not_configured: "Não habilitada",
  error: "Falhou",
}

export const STEP_LABELS: Record<StepId, string> = {
  validar: "Validar o número do processo",
  fonte_principal: "Consultar a fonte processual principal",
  normalizar: "Normalizar os dados encontrados",
  complementares: "Consultar fontes complementares",
  magistrado: "Identificar magistrado e órgão julgador",
  consolidar: "Consolidar movimentações e informações",
  registrar: "Registrar fontes, horários e resultados",
  relatorio: "Montar o relatório final",
}
