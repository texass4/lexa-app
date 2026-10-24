import { hrefFor, isRefType, UUID_RE, type Ref, type RefType } from "./refs"

/*
 * Documento do editor em blocos (formato JSON do Tiptap/ProseMirror). O mesmo formato serve
 * para páginas e diário. Aqui ficam as operações puras: validar, extrair texto, extrair
 * referências internas e exportar Markdown.
 */

export type DocMark = { type: string; attrs?: Record<string, unknown> }
export type DocNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: DocMark[]
}

export const EMPTY_DOC: DocNode = { type: "doc", content: [] }

export const BLOCK_TYPES = [
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "horizontalRule",
  "codeBlock",
  "hardBreak",
  "text",
  "reference",
] as const
export const MARK_TYPES = ["bold", "italic", "strike", "code", "underline", "link"] as const

const NODE_SET = new Set<string>(BLOCK_TYPES)
const MARK_SET = new Set<string>(MARK_TYPES)
const MAX_DEPTH = 40
const MAX_NODES = 50_000

/** Confere a estrutura antes de gravar: só tipos conhecidos, profundidade e tamanho limitados. */
export function validateDoc(value: unknown): { ok: true; doc: DocNode } | { ok: false; error: string } {
  let count = 0
  const visit = (node: unknown, depth: number): string | null => {
    if (++count > MAX_NODES) return "Documento grande demais."
    if (depth > MAX_DEPTH) return "Documento aninhado demais."
    if (!node || typeof node !== "object" || Array.isArray(node)) return "Bloco inválido."
    const n = node as DocNode
    if (typeof n.type !== "string" || !NODE_SET.has(n.type)) return `Tipo de bloco desconhecido: ${String(n.type)}`
    if (n.type === "text" && typeof n.text !== "string") return "Texto inválido."
    if (n.attrs !== undefined && (typeof n.attrs !== "object" || n.attrs === null || Array.isArray(n.attrs))) return "Atributos inválidos."
    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks)) return "Marcas inválidas."
      for (const mark of n.marks) {
        if (!mark || typeof mark.type !== "string" || !MARK_SET.has(mark.type)) return `Marca desconhecida: ${String(mark?.type)}`
        if (mark.type === "link" && !isSafeHref(mark.attrs?.href)) return "Link inválido."
      }
    }
    if (n.type === "reference" && !refFromAttrs(n.attrs)) return "Referência inválida."
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) return "Conteúdo inválido."
      for (const child of n.content) {
        const error = visit(child, depth + 1)
        if (error) return error
      }
    }
    return null
  }
  const error = visit(value, 0)
  if (error) return { ok: false, error }
  if ((value as DocNode).type !== "doc") return { ok: false, error: "O documento precisa começar pelo nó raiz." }
  return { ok: true, doc: value as DocNode }
}

/** Links aceitos: http(s), mailto, tel e caminhos internos. Nada de `javascript:`. */
export function isSafeHref(href: unknown): boolean {
  if (typeof href !== "string" || href.length > 2048) return false
  if (href.startsWith("/") && !href.startsWith("//")) return true
  return /^(https?:|mailto:|tel:)/i.test(href)
}

export function refFromAttrs(attrs: Record<string, unknown> | undefined): (Ref & { label: string }) | null {
  if (!attrs) return null
  const { refType, refId, label } = attrs
  if (!isRefType(refType) || typeof refId !== "string" || !UUID_RE.test(refId)) return null
  return { type: refType, id: refId, label: typeof label === "string" ? label : "" }
}

const INTERNAL_LINK = /^\/(tasks|projects|areas|pages|canvas)\/([0-9a-f-]{36})$/i
const PATH_TYPE: Record<string, RefType> = { tasks: "task", projects: "project", areas: "area", pages: "page", canvas: "board" }

/** Referência a partir de um link interno colado no texto (ex.: /tasks/<id>). */
export function refFromHref(href: string): Ref | null {
  const match = INTERNAL_LINK.exec(href)
  if (!match || !UUID_RE.test(match[2]!)) return null
  return { type: PATH_TYPE[match[1]!.toLowerCase()]!, id: match[2]!.toLowerCase() }
}

/** Todas as referências internas do documento, sem repetição. */
export function extractRefs(doc: DocNode): Ref[] {
  const found = new Map<string, Ref>()
  const add = (ref: Ref | null) => {
    if (ref) found.set(`${ref.type}:${ref.id}`, { type: ref.type, id: ref.id })
  }
  walk(doc, (node) => {
    if (node.type === "reference") add(refFromAttrs(node.attrs))
    for (const mark of node.marks ?? []) if (mark.type === "link" && typeof mark.attrs?.href === "string") add(refFromHref(mark.attrs.href))
  })
  return [...found.values()]
}

function walk(node: DocNode, fn: (node: DocNode) => void) {
  fn(node)
  for (const child of node.content ?? []) walk(child, fn)
}

const BLOCK_LEVEL = new Set(["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock", "horizontalRule"])

/** Texto corrido do documento (busca, prévias e exportação). Blocos viram linhas. */
export function docToText(doc: DocNode): string {
  const out: string[] = []
  let line = ""
  const flush = () => {
    if (line.trim()) out.push(line.trim())
    line = ""
  }
  const visit = (node: DocNode) => {
    if (node.type === "text") line += node.text ?? ""
    else if (node.type === "reference") line += refFromAttrs(node.attrs)?.label ?? ""
    else if (node.type === "hardBreak") line += " "
    const isBlock = BLOCK_LEVEL.has(node.type)
    if (isBlock && node.type !== "listItem" && node.type !== "taskItem") flush()
    for (const child of node.content ?? []) visit(child)
    if (isBlock) flush()
  }
  visit(doc)
  flush()
  return out.join("\n")
}

export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** Documento simples a partir de texto puro (uma linha, um parágrafo). */
export function textToDoc(text: string): DocNode {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .map((line): DocNode => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }))
  // Sem parágrafos vazios nas pontas.
  while (paragraphs.length && !paragraphs[0]!.content) paragraphs.shift()
  while (paragraphs.length && !paragraphs[paragraphs.length - 1]!.content) paragraphs.pop()
  return { type: "doc", content: paragraphs }
}

/** Acrescenta blocos ao fim de um documento (sem alterar o original). */
export function appendToDoc(doc: DocNode, extra: DocNode[]): DocNode {
  return { ...doc, type: "doc", content: [...(doc.content ?? []), ...extra] }
}

export function isDocEmpty(doc: DocNode): boolean {
  return docToText(doc).trim() === "" && !(doc.content ?? []).some((n) => n.type === "horizontalRule")
}

// ——— Markdown ————————————————————————————————————————————————————————————————

const escapeMd = (text: string) => text.replace(/([\\`*_[\]#<>])/g, "\\$1")

function inlineToMd(nodes: DocNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "  \n"
      if (node.type === "reference") {
        const ref = refFromAttrs(node.attrs)
        return ref ? `[${escapeMd(ref.label || "referência")}](${hrefFor(ref.type, ref.id)})` : ""
      }
      if (node.type !== "text") return ""
      const marks = node.marks ?? []
      const has = (t: string) => marks.some((m) => m.type === t)
      let text = has("code") ? `\`${node.text ?? ""}\`` : escapeMd(node.text ?? "")
      if (has("bold")) text = `**${text}**`
      if (has("italic")) text = `*${text}*`
      if (has("strike")) text = `~~${text}~~`
      const link = marks.find((m) => m.type === "link")
      if (link && typeof link.attrs?.href === "string") text = `[${text}](${link.attrs.href})`
      return text
    })
    .join("")
}

function blockToMd(node: DocNode, indent: string): string[] {
  switch (node.type) {
    case "paragraph":
      return [indent + inlineToMd(node.content)]
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return [`${"#".repeat(level)} ${inlineToMd(node.content)}`]
    }
    case "blockquote":
      return (node.content ?? []).flatMap((child) => blockToMd(child, "")).map((line) => `> ${line}`)
    case "horizontalRule":
      return ["---"]
    case "codeBlock":
      return ["```" + String(node.attrs?.language ?? ""), ...(node.content ?? []).map((t) => t.text ?? ""), "```"]
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? []).flatMap((item, i) => {
        const bullet =
          node.type === "orderedList" ? `${start + i}.` : node.type === "taskList" ? (item.attrs?.checked ? "- [x]" : "- [ ]") : "-"
        const [first, ...rest] = item.content ?? []
        const head = first ? blockToMd(first, "").join(" ") : ""
        const nested = rest.flatMap((child) => blockToMd(child, indent + "  "))
        return [`${indent}${bullet} ${head.trim()}`, ...nested]
      })
    }
    default:
      return []
  }
}

export function docToMarkdown(doc: DocNode): string {
  const blocks = (doc.content ?? []).map((node) => blockToMd(node, "").join("\n"))
  return blocks.filter((b, i) => b !== "" || blocks[i - 1] !== "").join("\n\n").trim() + "\n"
}
