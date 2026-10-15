/**
 * Modelo da Central de Documentos: onde a pessoa está, o que filtrou e em que ordem.
 *
 * Não há pastas no banco. A organização é a que cada documento já guarda: categoria
 * (tipo), cliente e processo. "Clientes" e os processos dentro de cada cliente são
 * coleções derivadas desses vínculos — navegáveis como pastas, mas sem estrutura
 * paralela de armazenamento. As categorias são filtros.
 */

import type { DocumentQuery } from "@/lib/store/history-lists"
import { matches } from "@/lib/core/format"
import type { DocumentKind, LegalDocument } from "@/types"

export type Section = "todos" | "recentes" | "favoritos" | "clientes"

export const SECTIONS: { value: Section; label: string }[] = [
  { value: "todos", label: "Todos os documentos" },
  { value: "recentes", label: "Recentes" },
  { value: "favoritos", label: "Favoritos" },
  { value: "clientes", label: "Clientes" },
]

/** Categorias (os tipos de documento cadastrados), no plural para a navegação. */
export const CATEGORIES: { value: DocumentKind; label: string }[] = [
  { value: "Contrato", label: "Contratos" },
  { value: "Procuração", label: "Procurações" },
  { value: "Petição", label: "Petições" },
  { value: "Decisão", label: "Decisões" },
  { value: "Documento pessoal", label: "Documentos pessoais" },
  { value: "Laudo", label: "Laudos" },
  { value: "Comprovante", label: "Comprovantes" },
]

export type Extension = LegalDocument["extension"]

/** Formatos aceitos pelo armazenamento (bucket `documents`), agrupados como a pessoa pensa neles. */
export const FORMATS: { value: string; label: string; extensions: Extension[] }[] = [
  { value: "pdf", label: "PDF", extensions: ["pdf"] },
  { value: "word", label: "Word (DOC, DOCX)", extensions: ["doc", "docx"] },
  { value: "imagem", label: "Imagem (JPG, PNG)", extensions: ["jpg", "png"] },
  { value: "texto", label: "Texto (TXT)", extensions: ["txt"] },
]

export const formatOf = (extension: string) => FORMATS.find((f) => f.extensions.includes(extension as Extension))

export type Period = "7d" | "30d" | "90d" | "ano" | "anterior"

export const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
  { value: "anterior", label: "Antes deste ano" },
]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Intervalo de envio do período (`from` inclusive, `to` exclusive, `YYYY-MM-DD`). */
export function periodRange(period: Period, now: Date): { from?: string; to?: string } {
  const days = (n: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
  if (period === "7d") return { from: days(6) }
  if (period === "30d") return { from: days(29) }
  if (period === "90d") return { from: days(89) }
  if (period === "ano") return { from: `${now.getFullYear()}-01-01` }
  return { to: `${now.getFullYear()}-01-01` }
}

export type SortKey = "enviado" | "nome" | "categoria" | "formato" | "tamanho"
export type SortDir = "asc" | "desc"

export const SORTS: { value: SortKey; label: string; defaultDir: SortDir }[] = [
  { value: "enviado", label: "Data de envio", defaultDir: "desc" },
  { value: "nome", label: "Nome", defaultDir: "asc" },
  { value: "categoria", label: "Categoria", defaultDir: "asc" },
  { value: "formato", label: "Formato", defaultDir: "asc" },
  { value: "tamanho", label: "Tamanho", defaultDir: "desc" },
]

/** O que a pessoa vê: a seção, o cliente/processo aberto e os filtros. */
export interface LibraryState {
  section: Section
  /** Categoria (tipo do documento). */
  kind?: DocumentKind
  clientId?: string
  processId?: string
  /** Grupos de `FORMATS`. */
  formats: string[]
  uploadedById?: string
  period?: Period
}

export const EMPTY_STATE: LibraryState = { section: "todos", formats: [] }

const SECTION_VALUES = new Set<string>(SECTIONS.map((s) => s.value))
const KIND_VALUES = new Set<string>(CATEGORIES.map((c) => c.value))
const FORMAT_VALUES = new Set(FORMATS.map((f) => f.value))
const PERIOD_VALUES = new Set<string>(PERIODS.map((p) => p.value))

/** Lê o estado da URL (`?pasta=recentes` continua valendo para os atalhos já existentes). */
export function readState(params: URLSearchParams): LibraryState {
  const pasta = params.get("pasta") ?? ""
  const kind = params.get("categoria") ?? ""
  const period = params.get("periodo") ?? ""
  const state: LibraryState = {
    section: SECTION_VALUES.has(pasta) ? (pasta as Section) : "todos",
    formats: (params.get("formato") ?? "").split(",").filter((f) => FORMAT_VALUES.has(f)),
  }
  if (KIND_VALUES.has(kind)) state.kind = kind as DocumentKind
  if (params.get("cliente")) state.clientId = params.get("cliente")!
  if (params.get("processo")) state.processId = params.get("processo")!
  if (params.get("responsavel")) state.uploadedById = params.get("responsavel")!
  if (PERIOD_VALUES.has(period)) state.period = period as Period
  return state
}

/** O estado como parâmetros da URL (só o que difere do padrão). */
export function stateParams(s: LibraryState): URLSearchParams {
  const p = new URLSearchParams()
  if (s.section !== "todos") p.set("pasta", s.section)
  if (s.kind) p.set("categoria", s.kind)
  if (s.clientId) p.set("cliente", s.clientId)
  if (s.processId) p.set("processo", s.processId)
  if (s.formats.length) p.set("formato", s.formats.join(","))
  if (s.uploadedById) p.set("responsavel", s.uploadedById)
  if (s.period) p.set("periodo", s.period)
  return p
}

/** Filtros removíveis um a um (a seção e o cliente aberto em "Clientes" são o lugar, não filtro). */
export function activeFilters(s: LibraryState) {
  const out: { key: "kind" | "formats" | "clientId" | "processId" | "uploadedById" | "period"; value?: string }[] = []
  if (s.kind) out.push({ key: "kind" })
  for (const f of s.formats) out.push({ key: "formats", value: f })
  if (s.section !== "clientes" && s.clientId) out.push({ key: "clientId" })
  if (s.section !== "clientes" && s.processId) out.push({ key: "processId" })
  if (s.uploadedById) out.push({ key: "uploadedById" })
  if (s.period) out.push({ key: "period" })
  return out
}

export const hasFilters = (s: LibraryState) => activeFilters(s).length > 0

/** Extensões dos formatos escolhidos (vazio: todos). */
export const extensionsOf = (formats: string[]) => FORMATS.filter((f) => formats.includes(f.value)).flatMap((f) => f.extensions)

/** O recorte para o banco (histórico em páginas e busca). */
export function toQuery(s: LibraryState, now: Date): DocumentQuery {
  const range = s.period ? periodRange(s.period, now) : {}
  const extensions = extensionsOf(s.formats)
  return {
    kind: s.kind,
    clientId: s.clientId,
    processId: s.processId,
    extensions: extensions.length ? extensions : undefined,
    uploadedById: s.uploadedById,
    ...range,
  }
}

/** Nomes que a busca também considera: cliente e processo ligados ao documento. */
export interface Related {
  clientName?: string
  processNumber?: string
  processCode?: string
  processTitle?: string
}

/** O documento passa nos filtros e na busca? (a mesma regra do banco, aplicada na memória). */
export function matchesState(d: LegalDocument, s: LibraryState, now: Date, search = "", related: Related = {}) {
  if (s.kind && d.kind !== s.kind) return false
  if (s.clientId && d.clientId !== s.clientId) return false
  if (s.processId && d.processId !== s.processId) return false
  if (s.uploadedById && d.uploadedById !== s.uploadedById) return false
  const extensions = extensionsOf(s.formats)
  if (extensions.length && !extensions.includes(d.extension)) return false
  if (s.period) {
    const { from, to } = periodRange(s.period, now)
    const day = (d.uploadedAt ?? "").slice(0, 10)
    if (from && day < from) return false
    if (to && day >= to) return false
  }
  return matches(search, d.name, d.kind, related.clientName, related.processNumber, related.processCode, related.processTitle)
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })

export function sortDocuments(docs: LegalDocument[], key: SortKey, dir: SortDir): LegalDocument[] {
  const sign = dir === "asc" ? 1 : -1
  const byDate = (a: LegalDocument, b: LegalDocument) => (a.uploadedAt ?? "").localeCompare(b.uploadedAt ?? "")
  const compare: Record<SortKey, (a: LegalDocument, b: LegalDocument) => number> = {
    enviado: byDate,
    nome: (a, b) => collator.compare(a.name, b.name),
    categoria: (a, b) => collator.compare(a.kind, b.kind),
    formato: (a, b) => collator.compare(a.extension, b.extension),
    tamanho: (a, b) => a.sizeBytes - b.sizeBytes,
  }
  // Empate: o mais recente primeiro, sempre (ordem estável entre recargas).
  return [...docs].sort((a, b) => sign * compare[key](a, b) || -byDate(a, b) || a.id.localeCompare(b.id))
}

export interface Crumb {
  label: string
  /** Estado ao clicar (ausente: é o lugar atual). */
  target?: LibraryState
}

/**
 * Trilha da localização: Documentos / seção / cliente / processo / categoria.
 * Cada segmento leva ao lugar correspondente, mantendo os filtros que fazem sentido lá.
 */
export function breadcrumbs(s: LibraryState, names: { client?: string; process?: string }): Crumb[] {
  const base: LibraryState = { ...EMPTY_STATE }
  const crumbs: Crumb[] = [{ label: "Documentos", target: base }]
  const section = SECTIONS.find((x) => x.value === s.section)!
  // Em "Todos", a categoria já diz onde a pessoa está ("Documentos / Contratos").
  if (s.section !== "todos" || !s.kind) crumbs.push({ label: section.label, target: { ...base, section: s.section } })
  if (s.section === "clientes" && s.clientId) {
    crumbs.push({ label: names.client ?? "Cliente", target: { ...base, section: "clientes", clientId: s.clientId } })
    if (s.processId)
      crumbs.push({ label: names.process ?? "Processo", target: { ...base, section: "clientes", clientId: s.clientId, processId: s.processId } })
  }
  if (s.kind) {
    const label = CATEGORIES.find((c) => c.value === s.kind)?.label ?? s.kind
    crumbs.push({
      label,
      target: { ...base, section: s.section, kind: s.kind, ...(s.section === "clientes" ? { clientId: s.clientId, processId: s.processId } : {}) },
    })
  }
  // O último segmento é onde a pessoa está: sem destino.
  crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label }
  return crumbs
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const ACCEPTED_EXTENSIONS: Extension[] = ["pdf", "docx", "doc", "txt", "jpg", "png"]
export const ACCEPT_ATTRIBUTE = ".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"

/** Extensão aceita do nome do arquivo (`.jpeg` vale como `jpg`); null se o formato não é aceito. */
export function extensionOf(name: string): Extension | null {
  const raw = name.split(".").pop()?.toLowerCase() ?? ""
  const ext = raw === "jpeg" ? "jpg" : raw
  return (ACCEPTED_EXTENSIONS as string[]).includes(ext) && name.includes(".") ? (ext as Extension) : null
}

/** Por que o arquivo não pode ser enviado (null: pode). Mesmas regras do armazenamento. */
export function uploadIssue(file: { name: string; size: number }): string | null {
  if (!extensionOf(file.name)) return "Formato não aceito. Envie PDF, DOC, DOCX, TXT, JPG ou PNG."
  if (file.size === 0) return "O arquivo está vazio."
  if (file.size > MAX_UPLOAD_BYTES) return "O arquivo passa de 25 MB."
  return null
}
