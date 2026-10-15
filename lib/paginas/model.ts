/**
 * Páginas (Tarefas › Páginas): modelo puro, sem React nem banco.
 *
 * Uma página tem título, conteúdo (documento do editor, JSON no formato ProseMirror),
 * visibilidade (pessoal ou do escritório), vínculo opcional com cliente/processo e pode
 * ficar dentro de outra (subpágina). As tarefas mostradas numa página são REFERÊNCIAS
 * (`taskRef` com o id da tarefa real): nada é copiado.
 */

export type PageVisibility = "private" | "office"

/** Nó do documento do editor (ProseMirror/Tiptap). */
export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface PageMeta {
  id: string
  parentId: string | null
  title: string
  visibility: PageVisibility
  clientId: string | null
  processId: string | null
  /** Modelo de origem — só procedência; a página não depende dele. */
  template: string | null
  createdBy: string
  updatedBy: string | null
  /** Sobe a cada gravação (banco). Base da detecção de conflito. */
  version: number
  createdAt: string
  updatedAt: string
  /** Tarefas referenciadas no conteúdo (calculado pelo banco). */
  taskIds: string[]
}

export interface PageRecord extends PageMeta {
  content: DocNode
}

export const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph" }] }
export const UNTITLED = "Sem título"

export const pageTitle = (p: Pick<PageMeta, "title"> | undefined) => p?.title.trim() || UNTITLED
export const pageHref = (id: string) => `/tarefas/paginas/${id}`

/* ---------------------------------------------------------------- árvore */

export interface PageTreeNode {
  page: PageMeta
  children: PageTreeNode[]
}

/**
 * Árvore das páginas visíveis. Página cuja página de cima não está visível (excluída ou
 * sem acesso) aparece na raiz — nunca some. Irmãs em ordem alfabética.
 */
export function buildTree(pages: PageMeta[]): PageTreeNode[] {
  const ids = new Set(pages.map((p) => p.id))
  const byParent = new Map<string | null, PageMeta[]>()
  for (const p of pages) {
    const parent = p.parentId && ids.has(p.parentId) && p.parentId !== p.id ? p.parentId : null
    const list = byParent.get(parent) ?? []
    list.push(p)
    byParent.set(parent, list)
  }
  const seen = new Set<string>()
  const build = (parent: string | null): PageTreeNode[] =>
    (byParent.get(parent) ?? [])
      .slice()
      .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), "pt-BR", { sensitivity: "base" }))
      .filter((p) => !seen.has(p.id) && seen.add(p.id))
      .map((page) => ({ page, children: build(page.id) }))
  return build(null)
}

/** Caminho da raiz até a página (inclusive), só com páginas visíveis. */
export function breadcrumb(pages: ReadonlyMap<string, PageMeta>, id: string): PageMeta[] {
  const path: PageMeta[] = []
  const seen = new Set<string>()
  let current = pages.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? pages.get(current.parentId) : undefined
  }
  return path
}

/** Ids de todas as subpáginas (qualquer nível). */
export function descendants(pages: PageMeta[], id: string): string[] {
  const byParent = new Map<string, string[]>()
  for (const p of pages) if (p.parentId) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p.id])
  const out: string[] = []
  const stack = [...(byParent.get(id) ?? [])]
  while (stack.length) {
    const next = stack.pop()!
    if (out.includes(next)) continue
    out.push(next)
    stack.push(...(byParent.get(next) ?? []))
  }
  return out
}

/** Para onde a página pode ir: nunca para dentro dela mesma nem de uma subpágina dela. */
export function moveTargets(pages: PageMeta[], id: string): PageMeta[] {
  const blocked = new Set([id, ...descendants(pages, id)])
  return pages.filter((p) => !blocked.has(p.id))
}

/* -------------------------------------------------------------- conteúdo */

export function walk(node: DocNode, visit: (n: DocNode) => void) {
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}

/** Texto corrido do documento (prévia, contagem de palavras). */
export function plainText(doc: DocNode): string {
  const parts: string[] = []
  walk(doc, (n) => {
    if (n.text) parts.push(n.text)
  })
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

/** Ids das tarefas referenciadas — o mesmo que o banco calcula em `task_ids`. */
export function referencedTaskIds(doc: DocNode): string[] {
  const ids = new Set<string>()
  walk(doc, (n) => {
    const id = n.attrs?.taskId
    if (typeof id === "string" && id) ids.add(id)
  })
  return [...ids]
}

/** Quem pode alterar a página (espelha `page_writable` da migração 0027). */
export function canWritePage(page: Pick<PageMeta, "visibility" | "createdBy">, userId: string, canEditTasks: boolean) {
  return page.visibility === "private" ? page.createdBy === userId : canEditTasks
}

/* ------------------------------------------------------------ banco ↔ app */

export const PAGE_META_COLUMNS =
  "id,parent_id,title,visibility,client_id,process_id,template,created_by,updated_by,version,created_at,updated_at,task_ids"

export interface PageRow {
  id: string
  parent_id: string | null
  title: string
  visibility: PageVisibility
  client_id: string | null
  process_id: string | null
  template: string | null
  created_by: string
  updated_by: string | null
  version: number
  created_at: string
  updated_at: string
  task_ids: string[] | null
  content?: DocNode
}

export function fromRow(row: PageRow): PageMeta {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title ?? "",
    visibility: row.visibility,
    clientId: row.client_id,
    processId: row.process_id,
    template: row.template,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskIds: row.task_ids ?? [],
  }
}

/** Escapa `%`, `_` e `\` para um `ilike` literal. */
export const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)
