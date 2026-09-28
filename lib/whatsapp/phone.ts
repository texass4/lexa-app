/**
 * Telefones do WhatsApp. No banco e no provedor, só dígitos com DDI
 * (`5511999998888`). Clientes do LEXA guardam o telefone com máscara e sem DDI
 * (`(11) 99999-8888`) — `phoneMatchKeys` produz as formas comparáveis dos dois lados.
 */

export const digitsOnly = (value: string) => value.replace(/\D/g, "")

/**
 * Número pronto para o WhatsApp, ou null se não parece um telefone.
 * Sem DDI (sem "+" na frente) e com 10–11 dígitos, assume Brasil (55).
 */
export function normalizeWhatsAppPhone(input: string): string | null {
  let digits = digitsOnly(input).replace(/^0+/, "")
  const international = input.trim().startsWith("+")
  if (!international && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

const isBrazilian = (digits: string) => digits.startsWith("55") && (digits.length === 12 || digits.length === 13)

/**
 * Formas comparáveis de um número (sem o 55 no Brasil). Celulares brasileiros
 * podem chegar com ou sem o nono dígito — contas antigas do WhatsApp ainda
 * usam 8 dígitos — então as duas formas entram.
 */
export function phoneMatchKeys(phone: string): string[] {
  const digits = digitsOnly(phone)
  if (!isBrazilian(digits)) return digits ? [digits] : []
  const national = digits.slice(2)
  const ddd = national.slice(0, 2)
  const local = national.slice(2)
  const keys = [national]
  if (local.length === 9 && local.startsWith("9")) keys.push(ddd + local.slice(1))
  if (local.length === 8 && /^[6-9]/.test(local)) keys.push(`${ddd}9${local}`)
  return keys
}

/** +55 (11) 99999-8888 */
export function formatPhone(phone: string) {
  const digits = digitsOnly(phone)
  if (!isBrazilian(digits)) return digits ? `+${digits}` : ""
  const ddd = digits.slice(2, 4)
  const local = digits.slice(4)
  const split = local.length === 9 ? 5 : 4
  return `+55 (${ddd}) ${local.slice(0, split)}-${local.slice(split)}`
}
