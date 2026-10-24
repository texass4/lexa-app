/*
 * Referências internas: toda ligação entre módulos é feita por tipo + id, nunca por título.
 * O título exibido é sempre buscado no registro atual (ver `lib/services/refs.ts`).
 */

export const REF_TYPES = ["task", "project", "area", "page", "journal", "board"] as const
export type RefType = (typeof REF_TYPES)[number]
export type Ref = { type: RefType; id: string }

export const REF_LABEL: Record<RefType, string> = {
  task: "Tarefa",
  project: "Projeto",
  area: "Área",
  page: "Página",
  journal: "Diário",
  board: "Quadro",
}

/** Tipos que podem virar um elemento vinculado no canvas. */
export const BOARD_LINKABLE: RefType[] = ["task", "project", "page", "journal"]

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRefType(value: unknown): value is RefType {
  return typeof value === "string" && (REF_TYPES as readonly string[]).includes(value)
}

export const refKey = (ref: Ref) => `${ref.type}:${ref.id}`

export function parseRefKey(key: string): Ref | null {
  const [type, id] = key.split(":")
  return isRefType(type) && id && UUID_RE.test(id) ? { type, id } : null
}

/** Resumo atual de um registro referenciado, para exibir em qualquer módulo. */
export type RefSummary = {
  type: RefType
  id: string
  title: string
  href: string
  /** Status já traduzido, prioridade, prazo etc. — depende do tipo. */
  status?: string
  statusTone?: "neutral" | "active" | "done" | "danger" | "muted"
  priority?: "low" | "medium" | "high"
  dueDate?: string | null
  overdue?: boolean
  meta?: string
  excerpt?: string
  progress?: { done: number; total: number; percent: number } | null
  archived?: boolean
}

/** Endereço do registro original. O diário é endereçado pela data, as demais entidades pelo id. */
export function hrefFor(type: RefType, id: string, extra?: { entryDate?: string }): string {
  switch (type) {
    case "task":
      return `/tasks/${id}`
    case "project":
      return `/projects/${id}`
    case "area":
      return `/areas/${id}`
    case "page":
      return `/pages/${id}`
    case "journal":
      return extra?.entryDate ? `/journal/${extra.entryDate}` : `/journal`
    case "board":
      return `/canvas/${id}`
  }
}
