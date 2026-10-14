/**
 * Tribunal de origem a partir do número CNJ (Resolução CNJ 65/2008:
 * NNNNNNN-DD.AAAA.J.TR.OOOO). Nada consultado na rede: é a própria estrutura do número.
 *
 * Origem ≠ tribunal atual. O número é gerado onde o processo foi distribuído e, em
 * regra, acompanha os autos em recurso: `J.TR` diz onde ele começou, não onde tramita
 * hoje. O tribunal atual só vem de fonte consultada (`tribunal-identification.ts`).
 *
 * Identificar o tribunal não é o mesmo que ter fonte para consultá-lo: a cobertura do
 * DataJud fica em `lib/integrations/legal/datajud/tribunals.ts`.
 *
 * O site oficial segue o domínio institucional `<sigla>.jus.br`. A Íntegra só aponta
 * para ele — a consulta processual pública é feita pela pessoa, no site do tribunal
 * (que pode pedir CAPTCHA; a Íntegra não contorna).
 */

import { parseCNJ } from "./cnj"

const SEGMENTS: Record<string, string> = {
  "1": "Supremo Tribunal Federal",
  "2": "Conselho Nacional de Justiça",
  "3": "Superior Tribunal de Justiça",
  "4": "Justiça Federal",
  "5": "Justiça do Trabalho",
  "6": "Justiça Eleitoral",
  "7": "Justiça Militar da União",
  "8": "Justiça dos Estados e do Distrito Federal",
  "9": "Justiça Militar Estadual",
}

/** Código `TR` dos estados (mesma ordem na Justiça Estadual, Eleitoral e Militar Estadual). */
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"]

/** "do Estado de Santa Catarina", com a preposição de cada estado. */
const STATE_NAME: Record<string, string> = {
  AC: "do Acre",
  AL: "de Alagoas",
  AP: "do Amapá",
  AM: "do Amazonas",
  BA: "da Bahia",
  CE: "do Ceará",
  DF: "do Distrito Federal",
  ES: "do Espírito Santo",
  GO: "de Goiás",
  MA: "do Maranhão",
  MT: "de Mato Grosso",
  MS: "de Mato Grosso do Sul",
  MG: "de Minas Gerais",
  PA: "do Pará",
  PB: "da Paraíba",
  PR: "do Paraná",
  PE: "de Pernambuco",
  PI: "do Piauí",
  RJ: "do Rio de Janeiro",
  RN: "do Rio Grande do Norte",
  RS: "do Rio Grande do Sul",
  RO: "de Rondônia",
  RR: "de Roraima",
  SC: "de Santa Catarina",
  SE: "de Sergipe",
  SP: "de São Paulo",
  TO: "do Tocantins",
}

const pad = (n: number) => String(n).padStart(2, "0")

/** `J.TR` → sigla. Só códigos definidos pela numeração única. */
const ORIGINS: Record<string, string> = (() => {
  const map: Record<string, string> = { "1.00": "STF", "2.00": "CNJ", "3.00": "STJ", "5.00": "TST", "6.00": "TSE", "7.00": "STM" }
  for (let n = 1; n <= 6; n += 1) map[`4.${pad(n)}`] = `TRF${n}`
  for (let n = 1; n <= 24; n += 1) map[`5.${pad(n)}`] = `TRT${n}`
  UFS.forEach((uf, i) => {
    map[`8.${pad(i + 1)}`] = uf === "DF" ? "TJDFT" : `TJ${uf}`
    map[`6.${pad(i + 1)}`] = `TRE-${uf}`
  })
  // Justiça Militar da União: `TR` 01–12 são as Circunscrições Judiciárias Militares
  // (primeira instância, Auditorias), abaixo do STM — não são tribunais com sigla própria.
  for (let n = 1; n <= 12; n += 1) map[`7.${pad(n)}`] = `CJM${n}`
  // Só três estados têm Tribunal de Justiça Militar.
  map["9.13"] = "TJMMG"
  map["9.21"] = "TJMRS"
  map["9.26"] = "TJMSP"
  return map
})()

export interface TribunalInfo {
  /** Sigla, ex.: "TJSC". */
  acronym: string
  name: string
  segment?: string
  /** Site oficial (domínio institucional .jus.br). */
  site: string
}

/** Sigla do tribunal de origem pelo número (20 dígitos); `undefined` se o código não existe na numeração. */
export function originAcronym(digits: string): string | undefined {
  const parts = parseCNJ(digits)
  return parts ? ORIGINS[`${parts.segment}.${parts.tribunalCode}`] : undefined
}

export function tribunalName(acronym: string): string {
  const a = acronym.toUpperCase()
  if (a === "STF") return "Supremo Tribunal Federal"
  if (a === "CNJ") return "Conselho Nacional de Justiça"
  if (a === "STJ") return "Superior Tribunal de Justiça"
  if (a === "TST") return "Tribunal Superior do Trabalho"
  if (a === "TSE") return "Tribunal Superior Eleitoral"
  if (a === "STM") return "Superior Tribunal Militar"
  if (a === "TJDFT") return "Tribunal de Justiça do Distrito Federal e dos Territórios"
  const trf = /^TRF(\d)$/.exec(a)
  if (trf) return `Tribunal Regional Federal da ${trf[1]}ª Região`
  const trt = /^TRT(\d{1,2})$/.exec(a)
  if (trt) return `Tribunal Regional do Trabalho da ${trt[1]}ª Região`
  const tre = /^TRE-([A-Z]{2})$/.exec(a)
  if (tre && STATE_NAME[tre[1]]) return `Tribunal Regional Eleitoral ${STATE_NAME[tre[1]]}`
  const tjm = /^TJM([A-Z]{2})$/.exec(a)
  if (tjm && STATE_NAME[tjm[1]]) return `Tribunal de Justiça Militar do Estado ${STATE_NAME[tjm[1]]}`
  const tj = /^TJ([A-Z]{2})$/.exec(a)
  if (tj && STATE_NAME[tj[1]]) return `Tribunal de Justiça do Estado ${STATE_NAME[tj[1]]}`
  const cjm = /^CJM(\d{1,2})$/.exec(a)
  if (cjm) return `${cjm[1]}ª Circunscrição Judiciária Militar (Justiça Militar da União)`
  return a
}

/** Site institucional quando não segue `<sigla>.jus.br` (as CJMs ficam no portal da Justiça Militar da União). */
const siteOf = (acronym: string) => (/^CJM\d{1,2}$/.test(acronym) ? "https://www.stm.jus.br" : `https://www.${acronym.toLowerCase()}.jus.br`)

/** Segmento da Justiça (`J`) por extenso. */
export const segmentName = (segment: string): string | undefined => SEGMENTS[segment]

/** Dados públicos de um tribunal pela sigla (de origem ou informada por fonte). */
export function tribunalByAcronym(acronym: string | undefined, segment?: string): TribunalInfo | undefined {
  const a = acronym?.trim().toUpperCase()
  if (!a || !/^[A-Z0-9]{2,6}(-[A-Z]{2})?$/.test(a)) return undefined
  return { acronym: a, name: tribunalName(a), segment: segment ? SEGMENTS[segment] : undefined, site: siteOf(a) }
}

/** Tribunal de ORIGEM do número CNJ (20 dígitos), ou `undefined` se o código não é conhecido. */
export function originTribunal(digits: string): TribunalInfo | undefined {
  return tribunalByAcronym(originAcronym(digits), parseCNJ(digits)?.segment)
}
