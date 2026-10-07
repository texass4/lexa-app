/**
 * Jurisprudência — tipos comuns a fontes, base, busca e interface.
 *
 * Duas camadas, de propósito:
 * - `JurisprudenceSource`: uma FONTE OFICIAL (hoje o STJ) — só sabe listar e baixar o
 *   que publica. Usada pela sincronização, no servidor.
 * - `JurisprudenceProvider`: a busca e a leitura de decisões. Implementada sobre a base
 *   indexada (Supabase), que as fontes alimentam — a fonte do STJ não tem API de busca.
 *
 * Tudo o que chega à tela é dado da base. Nenhum campo é preenchido por suposição.
 */

/** Fontes implementadas. Novas (STF, TJs, TRFs, TST…) entram aqui e em `config.ts`. */
export type JurisprudenceProviderId = "stj"

export type JurisprudenceSort = "relevance" | "recent"

export interface JurisprudenceFilters {
  tribunal?: string
  /** Grau/instância ("Superior"). */
  degree?: string
  /** Órgão julgador (ex.: "TERCEIRA TURMA"). */
  court?: string
  /** Sigla da classe (ex.: "REsp"). */
  class?: string
  /** Trecho do assunto (verbetação da ementa). */
  subject?: string
  area?: string
  /** `AAAA-MM-DD` */
  from?: string
  /** `AAAA-MM-DD` */
  to?: string
}

export interface JurisprudenceQuery {
  text: string
  filters?: JurisprudenceFilters
  sort?: JurisprudenceSort
  /** 1 em diante. */
  page?: number
  pageSize?: number
}

/** Uma decisão na lista de resultados. */
export interface JurisprudenceResult {
  id: string
  provider: JurisprudenceProviderId | string
  tribunal: string
  processNumber?: string
  classCode?: string
  className?: string
  court?: string
  rapporteur?: string
  /** `AAAA-MM-DD` */
  judgmentDate?: string
  subject?: string
  area?: string
  degree?: string
  sourceUrl?: string
  /** Trecho da ementa; os termos encontrados vêm entre ⟦ ⟧. */
  snippet: string
  /** Relevância calculada pelo banco (0 quando a ordem é por data). */
  score: number
}

export interface JurisprudencePage {
  results: JurisprudenceResult[]
  total: number
  page: number
  pageSize: number
  pages: number
}

/** A decisão completa, como está na base. Campos ausentes na fonte ficam ausentes. */
export interface JurisprudenceDecision {
  id: string
  provider: string
  tribunal: string
  externalId: string
  processNumber?: string
  registryNumber?: string
  classCode?: string
  className?: string
  court?: string
  rapporteur?: string
  judgmentDate?: string
  publicationDate?: string
  publication?: string
  decisionType?: string
  subject?: string
  ementa: string
  decisionText?: string
  thesis?: string
  keywords?: string
  legislation: string[]
  citedPrecedents?: string
  notes?: string
  area?: string
  degree?: string
  sourceUrl?: string
  /** Arquivo oficial de onde a decisão veio. */
  fileUrl?: string
  sourceLabel: string
  updatedAt: string
}

export interface JurisprudenceProvider {
  search(query: JurisprudenceQuery): Promise<JurisprudencePage>
  getDecision(id: string): Promise<JurisprudenceDecision>
}

/* ------------------------------ sincronização ------------------------------ */

/** Decisão pronta para gravar (sem `id`: a base decide pela chave da fonte). */
export interface NormalizedDecision {
  provider: string
  tribunal: string
  external_id: string
  process_number: string | null
  registry_number: string | null
  class_code: string | null
  class_name: string | null
  court: string | null
  rapporteur: string | null
  judgment_date: string | null
  publication_date: string | null
  publication: string | null
  decision_type: string | null
  subject: string | null
  ementa: string
  decision_text: string | null
  thesis: string | null
  keywords: string | null
  legislation: string[]
  cited_precedents: string | null
  notes: string | null
  area: string | null
  degree: string | null
  source_url: string | null
  raw_reference: Record<string, unknown>
  content_hash: string
}

/** Arquivo publicado pela fonte (ex.: um JSON mensal de espelhos de acórdãos). */
export interface SourceFile {
  dataset: string
  resourceId: string
  name: string
  url: string
  format: string
  /** ISO, quando a fonte informa. */
  modifiedAt?: string
  /** ZIP com o histórico (só lido quando habilitado). */
  historical: boolean
}

export interface JurisprudenceSource {
  id: JurisprudenceProviderId
  tribunal: string
  label: string
  /** Conjuntos de dados acompanhados. */
  datasets: string[]
  listFiles(dataset: string): Promise<SourceFile[]>
  /** Registros crus do arquivo (validados depois, em `normalization.ts`). */
  fetchFile(file: SourceFile): Promise<unknown[]>
  normalize(record: unknown, file: SourceFile): NormalizedDecision | { skipped: string }
}
