/**
 * Dados públicos do tribunal a partir do número CNJ (Resolução CNJ 65/2008:
 * NNNNNNN-DD.AAAA.J.TR.OOOO). Nada consultado na rede: é a própria estrutura do número.
 *
 * O site oficial segue o domínio institucional `<sigla>.jus.br`. A Íntegra só aponta
 * para ele — a consulta processual pública é feita pela pessoa, no site do tribunal
 * (que pode pedir CAPTCHA; a Íntegra não contorna).
 */

import { tribunalFor } from "@/lib/integrations/legal/datajud/tribunals"

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

/** "do Estado de Santa Catarina", com a preposição de cada estado. */
const STATES: Record<string, string> = {
  TJAC: "do Acre",
  TJAL: "de Alagoas",
  TJAP: "do Amapá",
  TJAM: "do Amazonas",
  TJBA: "da Bahia",
  TJCE: "do Ceará",
  TJES: "do Espírito Santo",
  TJGO: "de Goiás",
  TJMA: "do Maranhão",
  TJMT: "de Mato Grosso",
  TJMS: "de Mato Grosso do Sul",
  TJMG: "de Minas Gerais",
  TJPA: "do Pará",
  TJPB: "da Paraíba",
  TJPR: "do Paraná",
  TJPE: "de Pernambuco",
  TJPI: "do Piauí",
  TJRJ: "do Rio de Janeiro",
  TJRN: "do Rio Grande do Norte",
  TJRS: "do Rio Grande do Sul",
  TJRO: "de Rondônia",
  TJRR: "de Roraima",
  TJSC: "de Santa Catarina",
  TJSE: "de Sergipe",
  TJSP: "de São Paulo",
  TJTO: "do Tocantins",
}

export interface TribunalInfo {
  /** Sigla, ex.: "TJSC". */
  acronym: string
  name: string
  segment?: string
  /** Site oficial (domínio institucional .jus.br). */
  site: string
}

export function tribunalName(acronym: string): string {
  const a = acronym.toUpperCase()
  if (a === "STJ") return "Superior Tribunal de Justiça"
  if (a === "TST") return "Tribunal Superior do Trabalho"
  if (a === "TSE") return "Tribunal Superior Eleitoral"
  if (a === "STM") return "Superior Tribunal Militar"
  if (a === "TJDFT") return "Tribunal de Justiça do Distrito Federal e dos Territórios"
  const trf = /^TRF(\d)$/.exec(a)
  if (trf) return `Tribunal Regional Federal da ${trf[1]}ª Região`
  const trt = /^TRT(\d{1,2})$/.exec(a)
  if (trt) return `Tribunal Regional do Trabalho da ${trt[1]}ª Região`
  if (STATES[a]) return `Tribunal de Justiça do Estado ${STATES[a]}`
  return a
}

/** Tribunal do número CNJ (20 dígitos), ou `undefined` se o segmento não é conhecido. */
export function tribunalInfo(digits: string, acronymFromSource?: string): TribunalInfo | undefined {
  const acronym = (acronymFromSource?.trim() || tribunalFor(digits))?.toUpperCase()
  if (!acronym || !/^[A-Z0-9]{2,6}$/.test(acronym)) return undefined
  return {
    acronym,
    name: tribunalName(acronym),
    segment: SEGMENTS[digits[13]],
    site: `https://www.${acronym.toLowerCase()}.jus.br`,
  }
}
