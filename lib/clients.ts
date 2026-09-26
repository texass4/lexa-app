/**
 * Regras do cadastro de clientes: validação de CPF/CNPJ, telefone e e-mail,
 * duplicidade, endereço, tags e WhatsApp. Funções puras — usadas pelo formulário,
 * pela lista e pelos testes. A unicidade do documento também é garantida no banco
 * (`supabase/migrations/0002_clients_hub.sql`).
 */

import type { Client, ClientAddress } from "@/types"
import type { PersistedState } from "@/lib/store/storage"
import { onlyDigits as digitsOf } from "@/lib/cnj"
import { relatedClientId } from "@/lib/selectors"
import { normalize } from "@/lib/format"
import { isEmail } from "@/lib/masks"

export const onlyDigits = (value: string | undefined) => digitsOf(value ?? "")

export function isValidCPF(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

export function isValidCNPJ(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return check(12) === Number(d[12]) && check(13) === Number(d[13])
}

export const documentLabel = (kind: Client["kind"]) => (kind === "PJ" ? "CNPJ" : "CPF")

/** Mensagem de erro do CPF/CNPJ, ou `undefined` se válido. */
export function validateDocument(kind: Client["kind"], value: string): string | undefined {
  const d = onlyDigits(value)
  const label = documentLabel(kind)
  if (!d) return `Informe o ${label}.`
  if (d.length !== (kind === "PJ" ? 14 : 11)) return `${label} deve ter ${kind === "PJ" ? 14 : 11} dígitos.`
  if (!(kind === "PJ" ? isValidCNPJ(d) : isValidCPF(d))) return `${label} inválido — confira os dígitos.`
  return undefined
}

/** Telefone brasileiro com DDD: fixo (10 dígitos) ou celular (11, começando por 9). */
export function isValidPhone(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 10 && d.length !== 11) return false
  if (Number(d.slice(0, 2)) < 11) return false
  return d.length === 10 || d[2] === "9"
}

/** Outro cliente do escritório com o mesmo CPF/CNPJ. */
export function findDuplicateClient(clients: readonly Client[], document: string, exceptId?: string) {
  const d = onlyDigits(document)
  if (!d) return undefined
  return clients.find((c) => c.id !== exceptId && onlyDigits(c.document) === d)
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] // prettier-ignore

export function maskZipCode(value: string) {
  const d = onlyDigits(value).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** "Rua X, 120, sala 3 — Centro, Florianópolis/SC, 88000-000" (só as partes preenchidas). */
export function formatAddress(a: ClientAddress | undefined) {
  if (!a) return ""
  const street = [a.street, a.number, a.complement]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ")
  const city = [a.city?.trim(), a.state?.trim()].filter(Boolean).join("/")
  const rest = [a.district?.trim(), city, a.zipCode?.trim()].filter(Boolean).join(", ")
  return [street, rest].filter(Boolean).join(" — ")
}

/** Tags sem espaços sobrando, sem repetição (ignorando maiúsculas/acentos) e com no máx. 32 caracteres. */
export function normalizeTags(tags: readonly string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, 32)
    const key = normalize(tag)
    if (!tag || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

/** Tags já usadas no escritório, da mais usada para a menos usada. */
export function knownTags(clients: readonly Client[]) {
  const count = new Map<string, number>()
  for (const c of clients) for (const t of c.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([t]) => t)
}

/** Número usado no WhatsApp: o próprio, ou o telefone quando for celular. */
export function whatsappNumber(client: Pick<Client, "phone" | "whatsapp">) {
  const own = onlyDigits(client.whatsapp)
  if (own) return own
  const phone = onlyDigits(client.phone)
  return phone.length === 11 ? phone : ""
}

/** Link oficial para abrir a conversa (wa.me). Sem número válido, `undefined`. */
export function whatsappLink(client: Pick<Client, "phone" | "whatsapp">) {
  const d = whatsappNumber(client)
  if (d.length < 10) return undefined
  return `https://wa.me/${d.startsWith("55") && d.length > 11 ? d : `55${d}`}`
}

export interface ClientFormErrors {
  name?: string
  document?: string
  email?: string
  phone?: string
  whatsapp?: string
  birthDate?: string
  state?: string
  contactEmail?: string
  contactPhone?: string
}

export interface ClientFormValues {
  kind: Client["kind"]
  name: string
  document: string
  email: string
  phone: string
  whatsapp: string
  birthDate: string
  state: string
  contactEmail: string
  contactPhone: string
}

/** Valida o formulário do cliente. `today` = `YYYY-MM-DD`. */
export function validateClientForm(values: ClientFormValues, clients: readonly Client[], today: string, exceptId?: string): ClientFormErrors {
  const pj = values.kind === "PJ"
  const errors: ClientFormErrors = {}
  if (values.name.trim().length < 3) errors.name = pj ? "Informe a razão social." : "Informe o nome completo."
  errors.document = validateDocument(values.kind, values.document)
  if (!errors.document) {
    const duplicate = findDuplicateClient(clients, values.document, exceptId)
    if (duplicate) errors.document = `Já existe um cliente com este ${documentLabel(values.kind)}: ${duplicate.name}.`
  }
  if (values.email.trim() && !isEmail(values.email.trim())) errors.email = "E-mail inválido."
  if (values.phone && !isValidPhone(values.phone)) errors.phone = "Telefone inválido — use DDD + número."
  if (values.whatsapp && !isValidPhone(values.whatsapp)) errors.whatsapp = "WhatsApp inválido — use DDD + número."
  if (values.birthDate && values.birthDate > today)
    errors.birthDate = pj ? "A fundação não pode ser no futuro." : "A data de nascimento não pode ser no futuro."
  if (values.state && !UFS.includes(values.state.toUpperCase())) errors.state = "UF inválida."
  if (values.contactEmail.trim() && !isEmail(values.contactEmail.trim())) errors.contactEmail = "E-mail inválido."
  if (values.contactPhone && !isValidPhone(values.contactPhone)) errors.contactPhone = "Telefone inválido."
  for (const key of Object.keys(errors) as (keyof ClientFormErrors)[]) if (!errors[key]) delete errors[key]
  return errors
}

/** "2 processos, 1 documento e 3 lançamentos financeiros" — o que continua salvo, sem o cliente, se ele for excluído. */
export function linkedRecordsSummary(s: PersistedState, clientId: string) {
  const plural = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "")
  const parts = [
    plural(s.processes.filter((p) => p.clientId === clientId).length, "processo", "processos"),
    plural(s.tasks.filter((t) => relatedClientId(s, t.related) === clientId).length, "tarefa", "tarefas"),
    plural(s.documents.filter((d) => d.clientId === clientId).length, "documento", "documentos"),
    plural(s.appointments.filter((a) => a.clientId === clientId).length, "compromisso", "compromissos"),
    plural(s.invoices.filter((i) => i.clientId === clientId).length, "lançamento financeiro", "lançamentos financeiros"),
  ].filter(Boolean)
  if (!parts.length) return ""
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0]
  return text.charAt(0).toUpperCase() + text.slice(1)
}
