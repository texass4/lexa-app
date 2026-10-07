/**
 * `JurisprudenceProvider` sobre a base indexada (Supabase). A busca é sempre no
 * servidor, paginada, com consulta validada e cache curto; a decisão vem inteira da
 * base. Nada aqui chama a fonte externa nem a IA.
 */

import { createTtlCache, type TtlCache } from "./cache"
import { JurisprudenceError } from "./errors"
import { parseDate } from "./normalization"
import type { JurisprudenceRepository } from "./store"
import type { JurisprudenceDecision, JurisprudenceFilters, JurisprudencePage, JurisprudenceProvider, JurisprudenceQuery, JurisprudenceSort } from "./types"

export const PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50
/** Até 250 páginas (o banco também limita o deslocamento). */
export const MAX_PAGE = 250
export const MAX_QUERY_LENGTH = 300

const FILTER_KEYS = ["tribunal", "degree", "court", "class", "subject", "area", "from", "to"] as const

export interface NormalizedQuery {
  text: string
  filters: JurisprudenceFilters
  sort: JurisprudenceSort
  page: number
  pageSize: number
}

/** Entrada da tela → consulta segura. Recusa (INVALID_QUERY) o que não faz sentido. */
export function normalizeQuery(input: Partial<JurisprudenceQuery> | null | undefined): NormalizedQuery {
  if (!input || typeof input !== "object") throw new JurisprudenceError("INVALID_QUERY", "consulta ausente")
  const text = typeof input.text === "string" ? input.text.replace(/\s+/g, " ").trim() : ""
  if (text.length > MAX_QUERY_LENGTH) throw new JurisprudenceError("INVALID_QUERY", "termos longos demais")
  const filters: JurisprudenceFilters = {}
  const raw = (input.filters ?? {}) as Record<string, unknown>
  for (const key of FILTER_KEYS) {
    const value = raw[key]
    if (value === undefined || value === null || value === "") continue
    if (typeof value !== "string" || value.length > 120) throw new JurisprudenceError("INVALID_QUERY", `filtro inválido: ${key}`)
    if (key === "from" || key === "to") {
      const date = parseDate(value)
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new JurisprudenceError("INVALID_QUERY", `data inválida: ${key}`)
      filters[key] = date
    } else {
      filters[key] = value.trim()
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new JurisprudenceError("INVALID_QUERY", "período invertido")
  const sort: JurisprudenceSort = input.sort === "recent" ? "recent" : "relevance"
  const page = Number.isInteger(input.page) && input.page! >= 1 ? Math.min(input.page!, MAX_PAGE) : 1
  const pageSize = Number.isInteger(input.pageSize) && input.pageSize! >= 1 ? Math.min(input.pageSize!, MAX_PAGE_SIZE) : PAGE_SIZE
  return { text, filters, sort, page, pageSize }
}

const sharedCache: TtlCache<JurisprudencePage> = createTtlCache()

export function createIndexedProvider(repo: JurisprudenceRepository, options: { cache?: TtlCache<JurisprudencePage> | null } = {}): JurisprudenceProvider {
  const cache = options.cache === undefined ? sharedCache : options.cache
  return {
    async search(query) {
      const q = normalizeQuery(query)
      const key = JSON.stringify(q)
      const hit = cache?.get(key)
      if (hit) return hit
      const { rows, total } = await repo.search({
        text: q.text,
        filters: q.filters,
        sort: q.sort,
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      })
      const page: JurisprudencePage = { results: rows, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) }
      cache?.set(key, page)
      return page
    },
    async getDecision(id): Promise<JurisprudenceDecision> {
      const decision = await repo.getDecision(id)
      if (!decision) throw new JurisprudenceError("NOT_FOUND", `decisão ${id} não existe ou não é visível`)
      return decision
    },
  }
}

/** Limpa o cache depois de uma sincronização (mesma instância). */
export const clearSearchCache = () => sharedCache.clear()
