/**
 * Importação de clientes por planilha (CSV): identificar colunas, validar cada linha
 * com as MESMAS regras do cadastro (`lib/clients.ts`) e separar o que será importado
 * do que é duplicado ou inválido. Lógica pura — a tela mostra, o store grava.
 *
 * Duplicado = mesmo CPF/CNPJ de alguém já cadastrado (ou de uma linha anterior do
 * arquivo); sem documento dos dois lados, mesmo e-mail ou mesmo telefone. Nada
 * duplicado é importado. Sem CPF/CNPJ, a pessoa entra como Contato.
 */

import { PRACTICE_AREAS } from "@/lib/config"
import { fold } from "@/lib/format"
import { isEmail, maskDocument, maskPhone } from "@/lib/masks"
import { UFS, documentLabel, formatAddress, isValidPhone, normalizeTags, onlyDigits, resolveClientStatus, validateDocument } from "./clients"
import type { Client, ClientAddress, PracticeArea, User } from "@/types"

export type ImportField =
  | "name"
  | "document"
  | "kind"
  | "email"
  | "phone"
  | "whatsapp"
  | "birthDate"
  | "address"
  | "zipCode"
  | "city"
  | "state"
  | "area"
  | "owner"
  | "tags"
  | "notes"

export const IMPORT_FIELDS: { field: ImportField; label: string; required?: boolean }[] = [
  { field: "name", label: "Nome / razão social", required: true },
  { field: "document", label: "CPF/CNPJ" },
  { field: "kind", label: "Tipo (PF/PJ)" },
  { field: "email", label: "E-mail" },
  { field: "phone", label: "Telefone" },
  { field: "whatsapp", label: "WhatsApp" },
  { field: "birthDate", label: "Nascimento / fundação" },
  { field: "address", label: "Endereço" },
  { field: "zipCode", label: "CEP" },
  { field: "city", label: "Cidade" },
  { field: "state", label: "UF" },
  { field: "area", label: "Área" },
  { field: "owner", label: "Responsável" },
  { field: "tags", label: "Tags" },
  { field: "notes", label: "Observações" },
]

/** Nomes de coluna reconhecidos (sem acento, minúsculas). Inclui os da exportação da Íntegra. */
const ALIASES: Record<ImportField, string[]> = {
  name: ["nome", "nome completo", "razao social", "cliente", "name", "nome do cliente"],
  document: ["cpf/cnpj", "cpf / cnpj", "cpf", "cnpj", "documento", "cpf_cnpj", "cpf ou cnpj", "doc"],
  kind: ["tipo", "tipo de cliente", "pessoa", "tipo de pessoa"],
  email: ["e-mail", "email", "e mail", "correio eletronico"],
  phone: ["telefone", "fone", "celular", "tel", "phone", "telefone principal"],
  whatsapp: ["whatsapp", "whats", "zap", "whatsapp/celular"],
  birthDate: ["nascimento", "data de nascimento", "data nascimento", "fundacao", "data de fundacao"],
  address: ["endereco", "logradouro", "endereco completo", "rua"],
  zipCode: ["cep"],
  city: ["cidade", "municipio"],
  state: ["uf", "estado"],
  area: ["area", "area principal", "area de atuacao"],
  owner: ["responsavel", "advogado", "advogado responsavel"],
  tags: ["tags", "etiquetas", "marcadores"],
  notes: ["observacoes", "observacao", "obs", "notas", "anotacoes"],
}

export type ColumnMapping = Partial<Record<ImportField, number>>

/** Coluna de cada campo, pelo nome do cabeçalho. Cada coluna serve a um campo só. */
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  const normalized = headers.map((h) => fold(h).replace(/[*:]/g, "").trim())
  for (const { field } of IMPORT_FIELDS) {
    const index = normalized.findIndex((h, i) => !used.has(i) && ALIASES[field].includes(h))
    if (index >= 0) {
      mapping[field] = index
      used.add(index)
    }
  }
  return mapping
}

export type NewClientDraft = Pick<Client, "name" | "kind" | "document" | "email" | "phone" | "address" | "area" | "ownerId" | "status"> &
  Partial<Pick<Client, "whatsapp" | "addressDetails" | "birthDate" | "tags" | "notes">>

export type ImportRowStatus = "ok" | "duplicate" | "invalid"

export interface ImportRow {
  /** Linha no arquivo (a 1 é o cabeçalho). */
  line: number
  status: ImportRowStatus
  /** Por que não será importada (inválida ou duplicada). */
  reasons: string[]
  /** Ajustes feitos sem impedir a importação (ex.: área não reconhecida). */
  warnings: string[]
  draft: NewClientDraft
}

export interface ImportOptions {
  existing: readonly Client[]
  members: readonly Pick<User, "id" | "name" | "email">[]
  defaultOwnerId: string
  defaultArea: PracticeArea
  /** `YYYY-MM-DD`, para barrar data de nascimento no futuro. */
  today: string
}

/** Telefone da planilha: tira +55/0 da frente e aplica a máscara. */
function phoneFrom(raw: string) {
  let d = onlyDigits(raw)
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2)
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
  return d ? maskPhone(d) : ""
}

/** `31/12/1980`, `31-12-1980` ou `1980-12-31` → `1980-12-31`. `null` se não der para ler. */
function dateFrom(raw: string): string | null {
  const text = raw.trim()
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text)
  if (m) {
    const [, d, mo, y] = m
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
    return isRealDate(iso) ? iso : null
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (m) return isRealDate(m[0]) ? m[0] : null
  return null
}

function isRealDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function kindFrom(raw: string, documentDigits: string): Client["kind"] {
  const k = fold(raw)
  if (k === "pj" || k.includes("juridica") || k.includes("empresa")) return "PJ"
  if (k === "pf" || k.includes("fisica")) return "PF"
  return documentDigits.length === 14 ? "PJ" : "PF"
}

const phoneKey = (phone: string) => onlyDigits(phone).slice(-10)

/** Valida e classifica cada linha do arquivo (sem o cabeçalho). */
export function buildImportRows(records: string[][], mapping: ColumnMapping, options: ImportOptions): ImportRow[] {
  const cell = (record: string[], field: ImportField) => {
    const index = mapping[field]
    return index === undefined ? "" : (record[index] ?? "").trim()
  }

  // Chaves de duplicidade: o que já existe no escritório e o que já apareceu no arquivo.
  // E-mail/telefone só identificam a mesma pessoa quando falta documento de um dos lados:
  // dois CPFs diferentes com o mesmo telefone (ex.: família) não são duplicados.
  type Seen = { who: string; hasDocument: boolean }
  const byDocument = new Map<string, string>()
  const byEmail = new Map<string, Seen>()
  const byPhone = new Map<string, Seen>()
  const remember = (who: string, document: string, email: string, phones: string[]) => {
    const seen = { who, hasDocument: !!document }
    if (document) byDocument.set(document, who)
    if (email && !byEmail.has(email)) byEmail.set(email, seen)
    for (const p of phones) if (p.length >= 10 && !byPhone.has(p)) byPhone.set(p, seen)
  }
  for (const c of options.existing) {
    remember(`já cadastrado: ${c.name}`, onlyDigits(c.document), fold(c.email ?? ""), [phoneKey(c.phone ?? ""), phoneKey(c.whatsapp ?? "")])
  }

  return records.map((record, i): ImportRow => {
    const line = i + 2
    const reasons: string[] = []
    const warnings: string[] = []

    const name = cell(record, "name").replace(/\s+/g, " ")
    const rawDocument = cell(record, "document")
    const digits = onlyDigits(rawDocument)
    const kind = kindFrom(cell(record, "kind"), digits)
    const email = cell(record, "email").toLowerCase()
    const phone = phoneFrom(cell(record, "phone"))
    const whatsapp = phoneFrom(cell(record, "whatsapp"))

    if (name.length < 3) reasons.push(kind === "PJ" ? "Razão social ausente ou muito curta." : "Nome ausente ou muito curto.")
    const documentError = validateDocument(kind, rawDocument, { required: false })
    if (documentError) reasons.push(documentError)
    if (email && !isEmail(email)) reasons.push("E-mail inválido.")
    if (phone && !isValidPhone(phone)) reasons.push("Telefone inválido — use DDD + número.")
    if (whatsapp && !isValidPhone(whatsapp)) reasons.push("WhatsApp inválido — use DDD + número.")

    let birthDate: string | undefined
    const rawBirth = cell(record, "birthDate")
    if (rawBirth) {
      const parsed = dateFrom(rawBirth)
      if (!parsed) reasons.push(`Data "${rawBirth}" não reconhecida — use DD/MM/AAAA.`)
      else if (parsed > options.today) reasons.push("Data de nascimento/fundação no futuro.")
      else birthDate = parsed
    }

    const rawState = cell(record, "state").toUpperCase()
    if (rawState && !UFS.includes(rawState)) reasons.push(`UF "${rawState}" inválida.`)

    const rawArea = cell(record, "area")
    const area = PRACTICE_AREAS.find((a) => fold(a) === fold(rawArea)) ?? options.defaultArea
    if (rawArea && fold(area) !== fold(rawArea)) warnings.push(`Área "${rawArea}" não reconhecida — usada ${area}.`)

    const rawOwner = fold(cell(record, "owner"))
    const owner = rawOwner ? options.members.find((m) => fold(m.name) === rawOwner || fold(m.email ?? "") === rawOwner) : undefined
    if (rawOwner && !owner) warnings.push(`Responsável "${cell(record, "owner")}" não encontrado na equipe — ficou com quem importou.`)

    const details: ClientAddress = {
      street: cell(record, "address") || undefined,
      zipCode: cell(record, "zipCode") || undefined,
      city: cell(record, "city") || undefined,
      state: rawState && UFS.includes(rawState) ? rawState : undefined,
    }
    const hasAddress = Object.values(details).some(Boolean)
    const tags = normalizeTags(cell(record, "tags").split(/[,|]/))

    const draft: NewClientDraft = {
      name,
      kind,
      document: digits ? maskDocument(digits) : "",
      email,
      phone,
      whatsapp: whatsapp && whatsapp !== phone ? whatsapp : undefined,
      birthDate,
      address: formatAddress(details),
      addressDetails: hasAddress ? (Object.fromEntries(Object.entries(details).filter(([, v]) => v)) as ClientAddress) : undefined,
      area,
      ownerId: owner?.id ?? options.defaultOwnerId,
      status: resolveClientStatus("novo", digits),
      tags: tags.length ? tags : undefined,
      notes: cell(record, "notes") || undefined,
    }

    if (reasons.length) return { line, status: "invalid", reasons, warnings, draft }

    // Duplicidade (só entre linhas válidas): documento; sem ele, e-mail ou telefone.
    const phones = [phoneKey(phone), phoneKey(whatsapp)].filter((p) => p.length >= 10)
    const emailKey = fold(email)
    const samePerson = (seen: Seen | undefined) => (seen && (!digits || !seen.hasDocument) ? seen.who : undefined)
    const duplicateOf =
      (digits && byDocument.get(digits)) ||
      (emailKey && samePerson(byEmail.get(emailKey))) ||
      phones.map((p) => samePerson(byPhone.get(p))).find(Boolean) ||
      undefined
    if (duplicateOf) return { line, status: "duplicate", reasons: [`Duplicado — ${duplicateOf}.`], warnings, draft }

    remember(`repetido na linha ${line}`, digits, emailKey, phones)
    if (!digits) warnings.push(`Sem ${documentLabel(kind)}: entra como Contato.`)
    return { line, status: "ok", reasons: [], warnings, draft }
  })
}

/** Contagem por situação, para a prévia e o relatório. */
export function summarizeImport(rows: readonly ImportRow[]) {
  return {
    total: rows.length,
    ok: rows.filter((r) => r.status === "ok").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  }
}
