/**
 * Interpretador de movimentações: `ProcessMovement` → `LexaMovement`.
 *
 * Recebe os fatos que a fonte informou (nome, código, complementos, órgão) e
 * produz o que a timeline mostra: categoria, título, descrição e complementos
 * com rótulo legível. Não depende de provider — movimentações da demo, do
 * cadastro manual e do DataJud passam pelo mesmo caminho.
 *
 * Regras de ouro:
 * - Nada é inventado. O título é o nome que a fonte deu; a descrição vem só
 *   dos complementos (ou do texto digitado no cadastro).
 * - Identificadores técnicos ("tipo_de_documento") nunca viram texto de tela,
 *   mas continuam em `complements[].source` e em `raw`.
 * - A classificação é simples e determinística: código conhecido → nome →
 *   complementos → classificação legada → "outros".
 *
 * Roda no servidor e no browser. Não importa React.
 */

import { fold } from "@/lib/format"
import type { DataOrigin, MovementComplement, MovementDocument, MovementJudicialUnit, ProcessMovement } from "@/types"

/* --------------------------------- modelo --------------------------------- */

export type MovementCategory =
  "documento" | "prazo" | "comunicacao" | "tramitacao" | "audiencia" | "julgamento" | "baixa" | "peticao" | "ato" | "outros"

export const MOVEMENT_CATEGORY_LABEL: Record<MovementCategory, string> = {
  documento: "Documento",
  prazo: "Prazo",
  comunicacao: "Comunicação",
  tramitacao: "Tramitação",
  audiencia: "Audiência",
  julgamento: "Julgamento",
  baixa: "Baixa",
  peticao: "Petição",
  ato: "Ato",
  outros: "Outros",
}

export interface InterpretedComplement {
  /** Rótulo legível do tipo de complemento (ex.: "Tipo do documento"). */
  label: string
  /** Valor legível (ex.: "Certidão"). */
  text: string
  /** Complemento exatamente como a fonte informou. */
  source: MovementComplement
}

/** Movimentação pronta para a interface. */
export interface LexaMovement {
  id: string
  processId?: string
  /** Código da TPU/CNJ, quando a fonte informa. */
  code?: number
  /** Nome do movimento como a fonte escreveu. */
  originalName: string
  category: MovementCategory
  title: string
  /** Complementos legíveis (ex.: "Certidão"), sem identificadores técnicos. */
  description?: string
  /** ISO local original — nenhuma conversão de fuso. */
  at: string
  /** Nome exatamente como a fonte escreveu (ex.: "06ª - São Luís"). */
  judicialUnit?: MovementJudicialUnit
  complements: InterpretedComplement[]
  /** Presente apenas quando existe arquivo acessível de verdade. */
  document?: MovementDocument
  origin?: DataOrigin
  /** Objeto original da fonte, para a seção "Dados da fonte". */
  raw?: unknown
}

/* -------------------------------- helpers --------------------------------- */

/** "tipo_de_documento", "motivo_da_remessa": identificador, não texto. */
const TECHNICAL = /^[a-z0-9]+(?:_[a-z0-9]+)+$/

export const isTechnical = (value: string) => TECHNICAL.test(value.trim())

/* ------------------------------ complementos ------------------------------ */

/** Rótulos com acentuação correta para os complementos mais comuns da TPU. */
const COMPLEMENT_LABEL: Record<string, string> = {
  tipo_de_documento: "Tipo do documento",
  tipo_de_peticao: "Tipo de petição",
  tipo_de_conclusao: "Tipo de conclusão",
  tipo_de_audiencia: "Tipo de audiência",
  situacao_da_audiencia: "Situação da audiência",
  motivo_da_remessa: "Motivo da remessa",
  motivo_da_redistribuicao: "Motivo da redistribuição",
  tipo_de_distribuicao_redistribuicao: "Tipo de distribuição",
  tipo_de_ato: "Tipo de ato",
  classe_anterior: "Classe anterior",
}

/**
 * Texto legível do complemento. Normalmente é `name`; se a fonte trouxer os
 * campos trocados, aceita `key` — desde que não seja um identificador técnico.
 */
export function complementText(complement: MovementComplement): string | undefined {
  for (const candidate of [complement.name, complement.key]) {
    const value = candidate?.trim()
    if (value && !isTechnical(value)) return value
  }
  return undefined
}

/** Rótulo do tipo de complemento: "tipo_de_documento" → "Tipo do documento". */
export function complementLabel(complement: MovementComplement): string {
  const key = [complement.key, complement.name].map((value) => value?.trim()).find((value) => !!value && isTechnical(value))
  if (!key) return "Complemento"
  if (COMPLEMENT_LABEL[key]) return COMPLEMENT_LABEL[key]
  const words = key.replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Complementos com texto legível, na ordem da fonte. Os sem texto ficam só em `raw`. */
export function interpretComplements(complements: MovementComplement[] | undefined): InterpretedComplement[] {
  const result: InterpretedComplement[] = []
  for (const source of complements ?? []) {
    const text = complementText(source)
    if (text) result.push({ label: complementLabel(source), text, source })
  }
  return result
}

/* ------------------------------- categorias ------------------------------- */

/**
 * Códigos da TPU/CNJ com categoria conhecida — consultados antes do nome.
 *
 * É o ponto de entrada para a tabela oficial de movimentos: hoje só cobre
 * nomes que, sozinhos, não dizem a categoria.
 */
const CATEGORY_BY_CODE: Partial<Record<number, MovementCategory>> = {
  22: "baixa", // "Baixa Definitiva"
  246: "baixa", // "Definitivo" (arquivamento definitivo)
}

/**
 * Trechos do nome (sem acento, minúsculo) → categoria. A ordem importa:
 * "Intimação para audiência" é comunicação; "Juntada de petição" é petição.
 */
const NAME_RULES: [MovementCategory, string[]][] = [
  ["baixa", ["baixa definitiva", "baixa", "arquivamento", "arquivado"]],
  ["comunicacao", ["intimacao", "citacao", "notificacao", "publicacao", "disponibilizacao", "diario da justica", "edital"]],
  ["audiencia", ["audiencia", "sessao", "pauta"]],
  ["prazo", ["decurso de prazo", "prazo"]],
  ["peticao", ["peticao", "protocol", "emenda", "contrarraz", "contra-raz", "interpost"]],
  ["documento", ["documento", "expedicao", "expedida", "certidao", "certificad", "juntada", "anexad", "laudo", "oficio", "mandado"]],
  [
    "julgamento",
    [
      "sentenca",
      "decisao",
      "decisoes",
      "despacho",
      "mero expediente",
      "acordao",
      "julgamento",
      "julgado",
      "procedencia",
      "acolhimento",
      "tutela",
      "liminar",
      "homologa",
      "extincao",
      "deferid",
    ],
  ],
  // "Conclusão" é o envio dos autos ao magistrado — tramitação, não julgamento.
  [
    "tramitacao",
    [
      "remessa",
      "recebimento",
      "redistribu",
      "distribu",
      "conclusao",
      "devolvid",
      "devolucao",
      "carga",
      "vista",
      "em secretaria",
      "competencia",
      "apensamento",
      "reativacao",
      "conversao de autos",
      "mudanca de classe",
    ],
  ],
  ["ato", ["ato ordinatorio"]],
]

/** Tipo de complemento que, sozinho, indica a categoria. */
const CATEGORY_BY_COMPLEMENT: Record<string, MovementCategory> = {
  tipo_de_documento: "documento",
  tipo_de_peticao: "peticao",
  tipo_de_audiencia: "audiencia",
  situacao_da_audiencia: "audiencia",
  tipo_de_conclusao: "tramitacao",
  motivo_da_remessa: "tramitacao",
}

/** Classificação legada dos seeds e do cadastro manual. */
const CATEGORY_BY_KIND: Record<NonNullable<ProcessMovement["kind"]>, MovementCategory> = {
  filing: "peticao",
  summons: "comunicacao",
  document: "documento",
  distribution: "tramitacao",
  hearing: "audiencia",
  decision: "julgamento",
  expert: "outros",
  other: "outros",
}

export interface CategoryInput {
  code?: number
  name: string
  complements?: MovementComplement[]
  kind?: ProcessMovement["kind"]
}

export function categorizeMovement({ code, name, complements, kind }: CategoryInput): MovementCategory {
  const byCode = code === undefined ? undefined : CATEGORY_BY_CODE[code]
  if (byCode) return byCode

  const folded = fold(name)
  for (const [category, fragments] of NAME_RULES) {
    if (fragments.some((fragment) => folded.includes(fragment))) return category
  }

  for (const complement of complements ?? []) {
    const byComplement = complement.key ? CATEGORY_BY_COMPLEMENT[complement.key.trim()] : undefined
    if (byComplement) return byComplement
  }

  return kind ? CATEGORY_BY_KIND[kind] : "outros"
}

/* ------------------------------ interpretação ------------------------------ */

function describe(movement: ProcessMovement, title: string, complements: InterpretedComplement[]): string | undefined {
  const titleKey = fold(title)
  const keep = (value: string) => !!value && !isTechnical(value) && fold(value) !== titleKey

  // Com complementos da fonte, a descrição sai deles — e só deles.
  if (movement.complements?.length) {
    const texts = [...new Set(complements.map((c) => c.text))].filter(keep)
    return texts.length ? texts.join(" · ") : undefined
  }

  // Sem complementos: texto do cadastro manual ou da demo, filtrado de resíduo técnico.
  const parts = (movement.description ?? "")
    .split(" · ")
    .map((part) => part.trim())
    .filter(keep)
  return parts.length ? parts.join(" · ") : undefined
}

export function interpretMovement(movement: ProcessMovement, processId?: string): LexaMovement {
  const title = movement.title?.trim() || "Movimentação"
  const complements = interpretComplements(movement.complements)
  const unit = movement.judicialUnit
  const judicialUnit = unit && (unit.name?.trim() || unit.code?.trim()) ? unit : undefined

  return {
    id: movement.id,
    processId,
    code: movement.code,
    originalName: movement.title,
    category: categorizeMovement({ code: movement.code, name: title, complements: movement.complements, kind: movement.kind }),
    title,
    description: describe(movement, title, complements),
    at: movement.at,
    judicialUnit,
    complements,
    document: movement.document?.available ? movement.document : undefined,
    origin: movement.origin,
    raw: movement.raw,
  }
}

/**
 * Lista interpretada, da mais recente para a mais antiga.
 *
 * Memoizada pela identidade do array: o store troca o array a cada alteração,
 * então re-renderizar a página não repete o trabalho para centenas de itens.
 */
const cache = new WeakMap<readonly ProcessMovement[], LexaMovement[]>()

export function interpretMovements(movements: readonly ProcessMovement[], processId?: string): LexaMovement[] {
  const hit = cache.get(movements)
  if (hit && (processId === undefined || hit[0]?.processId === processId)) return hit
  const result = movements.map((movement) => interpretMovement(movement, processId)).sort((a, b) => b.at.localeCompare(a.at))
  cache.set(movements, result)
  return result
}
