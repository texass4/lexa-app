/**
 * Tribunal de um número CNJ, pelos segmentos `J.TR` (justiça + tribunal).
 *
 * O índice consultado na fonte é `api_publica_<sigla minúscula>`.
 */

const STATE_COURTS: Record<string, string> = {
  "01": "TJAC",
  "02": "TJAL",
  "03": "TJAP",
  "04": "TJAM",
  "05": "TJBA",
  "06": "TJCE",
  "07": "TJDFT",
  "08": "TJES",
  "09": "TJGO",
  "10": "TJMA",
  "11": "TJMT",
  "12": "TJMS",
  "13": "TJMG",
  "14": "TJPA",
  "15": "TJPB",
  "16": "TJPR",
  "17": "TJPE",
  "18": "TJPI",
  "19": "TJRJ",
  "20": "TJRN",
  "21": "TJRS",
  "22": "TJRO",
  "23": "TJRR",
  "24": "TJSC",
  "25": "TJSE",
  "26": "TJSP",
  "27": "TJTO",
}

const pad = (n: number) => String(n).padStart(2, "0")

const TRIBUNALS: Record<string, string> = (() => {
  const map: Record<string, string> = { "3.00": "STJ", "5.00": "TST", "6.00": "TSE", "7.00": "STM" }
  for (let n = 1; n <= 6; n += 1) map[`4.${pad(n)}`] = `TRF${n}`
  for (let n = 1; n <= 24; n += 1) map[`5.${pad(n)}`] = `TRT${n}`
  for (const [code, acronym] of Object.entries(STATE_COURTS)) map[`8.${code}`] = acronym
  return map
})()

/** Sigla do tribunal (ex.: "TRF1") para 20 dígitos de CNJ; `undefined` se não houver índice. */
export function tribunalFor(digits: string): string | undefined {
  return TRIBUNALS[`${digits[13]}.${digits.slice(14, 16)}`]
}

export const datasetFor = (tribunal: string) => `api_publica_${tribunal.toLowerCase()}`
