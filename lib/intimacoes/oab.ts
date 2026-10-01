/**
 * Inscrições na OAB: validação, formatação e leitura do texto livre antigo do perfil.
 * Um advogado pode ter mais de uma inscrição (ex.: principal em SC e suplementar em
 * SP). A captura de intimações consulta cada inscrição ativa. Lógica pura.
 */

import { UFS } from "@/lib/clients"

export interface OabInput {
  number: string
  uf: string
}

/** Só os dígitos, sem zeros à esquerda ("012.345" → "12345"). */
export const oabDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+/, "")

/** "OAB/SC 12.345" */
export function formatOab({ number, uf }: OabInput) {
  const digits = oabDigits(number)
  return `OAB/${uf.toUpperCase()} ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

/** Mensagem de erro, ou `undefined` se a inscrição é válida. */
export function validateOab({ number, uf }: OabInput): string | undefined {
  const digits = oabDigits(number)
  if (!digits) return "Informe o número da OAB."
  if (digits.length > 7) return "Número da OAB muito longo — confira."
  if (!UFS.includes(uf.toUpperCase())) return "Escolha a UF da inscrição."
  return undefined
}

/**
 * Lê inscrições do campo de texto livre antigo ("OAB/SC 12.345", "123456/SP",
 * "SP 98765; RS 4321"). O que não der para ler com segurança fica de fora — nada é
 * inventado; a pessoa cadastra na tela.
 */
export function parseOabText(text: string | null | undefined): OabInput[] {
  if (!text) return []
  const found: OabInput[] = []
  for (const part of text.toUpperCase().split(/[;,]|\s+E\s+/)) {
    const uf = part.match(new RegExp(`\\b(${UFS.join("|")})\\b`))?.[1]
    const digits = part.match(/\d[\d.\s-]*\d|\d/)?.[0]
    if (!uf || !digits) continue
    const number = oabDigits(digits)
    if (!validateOab({ number, uf }) && !found.some((o) => o.number === number && o.uf === uf)) found.push({ number, uf })
  }
  return found
}
