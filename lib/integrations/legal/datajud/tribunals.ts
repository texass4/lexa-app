/**
 * Cobertura do DataJud: quais tribunais têm índice consultável (`api_publica_<sigla
 * minúscula>`). A identificação do tribunal pelo número fica em
 * `lib/processos/tribunals.ts` — um número pode ser válido e ter tribunal conhecido sem
 * que haja índice para ele aqui.
 *
 * Só entram índices conferidos na documentação oficial da API pública do DataJud
 * (https://datajud-wiki.cnj.jus.br/api-publica/endpoints). Tribunais Regionais
 * Eleitorais, Justiça Militar Estadual e as Auditorias da Justiça Militar da União
 * ficam de fora até a grafia dos índices ser confirmada lá: o número deles continua
 * identificado (origem), mas a consulta responde "fonte não cobre este tribunal".
 */

import { originAcronym } from "@/lib/processos/tribunals"

const pad = (n: number) => String(n).padStart(2, "0")

const COVERED: ReadonlySet<string> = new Set([
  "STJ",
  "TST",
  "TSE",
  "STM",
  ...Array.from({ length: 6 }, (_, i) => `TRF${i + 1}`),
  ...Array.from({ length: 24 }, (_, i) => `TRT${i + 1}`),
  ...["AC", "AL", "AP", "AM", "BA", "CE", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"].map((uf) => `TJ${uf}`),
  "TJDFT",
])

/** A sigla tem índice no DataJud? */
export const isCovered = (acronym: string | undefined) => !!acronym && COVERED.has(acronym.toUpperCase())

/** Sigla do tribunal de ORIGEM (ex.: "TRF1") quando há índice para ele; `undefined` caso contrário. */
export function tribunalFor(digits: string): string | undefined {
  const acronym = originAcronym(digits)
  return isCovered(acronym) ? acronym : undefined
}

export const datasetFor = (tribunal: string) => `api_publica_${tribunal.toLowerCase()}`

/** Sigla pelo índice (`api_publica_tjsp` → "TJSP"); `undefined` para índice fora da cobertura. */
export function tribunalOfDataset(dataset: string | undefined): string | undefined {
  const match = /^api_publica_([a-z0-9-]+)$/.exec(dataset?.trim().toLowerCase() ?? "")
  const acronym = match?.[1].toUpperCase()
  return isCovered(acronym) ? acronym : undefined
}

/** Tribunal superior que recebe os recursos de cada segmento (`J`). */
const SUPERIOR_BY_SEGMENT: Record<string, string> = { "4": "STJ", "8": "STJ", "9": "STJ", "5": "TST", "6": "TSE", "7": "STM" }

/**
 * Tribunal superior a consultar de forma complementar para um número (20 dígitos).
 * `undefined` quando o próprio número já é de tribunal superior (`TR` = 00) ou o
 * segmento não tem superior com índice.
 */
export function superiorFor(digits: string): string | undefined {
  if (digits.slice(14, 16) === pad(0)) return undefined
  const superior = SUPERIOR_BY_SEGMENT[digits[13]]
  return isCovered(superior) ? superior : undefined
}
