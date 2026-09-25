/**
 * Número único de processo (CNJ): `NNNNNNN-DD.AAAA.J.TR.OOOO`.
 *
 * Implementação única de máscara, formatação e validação — formulários e
 * integrações devem usar este módulo em vez de reimplementar regex.
 *
 * O dígito verificador segue ISO 7064 MOD 97-10: montando `sequencial + ano +
 * segmento + tribunal + origem` e concatenando o DV, o resto da divisão por 97
 * precisa ser 1.
 */

const DIGITS_LENGTH = 20

export const onlyDigits = (value: string) => value.replace(/\D/g, "")

function mod97(digits: string) {
  let remainder = 0
  for (let i = 0; i < digits.length; i += 1) {
    remainder = (remainder * 10 + (digits.charCodeAt(i) - 48)) % 97
  }
  return remainder
}

/**
 * `true` quando o número tem 20 dígitos e o dígito verificador confere.
 * Aceita o número com ou sem pontuação.
 */
export function hasValidCheckDigits(value: string) {
  const d = onlyDigits(value ?? "")
  if (d.length !== DIGITS_LENGTH) return false
  // Sequencial + ano + segmento + tribunal + origem, seguidos do DV.
  return mod97(`${d.slice(0, 7)}${d.slice(9)}${d.slice(7, 9)}`) === 1
}

/** `00008323520184013202` → `0000832-35.2018.4.01.3202` */
export function formatCNJ(value: string) {
  const d = onlyDigits(value ?? "")
  if (d.length !== DIGITS_LENGTH) return value
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`
}

/** Máscara progressiva para digitação em input. */
export function maskCNJ(value: string) {
  const d = onlyDigits(value ?? "").slice(0, DIGITS_LENGTH)
  const parts = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)]
  const separators = ["", "-", ".", ".", ".", "."]
  return parts.reduce((out, part, i) => (part ? out + separators[i] + part : out), "")
}
