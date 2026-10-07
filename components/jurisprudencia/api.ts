/**
 * Chamadas da tela às rotas de jurisprudência. O navegador nunca fala com a fonte
 * nem com o banco direto: tudo passa pelas rotas do servidor (sessão + RLS).
 */

import type { LinkedEntry, SavedEntry, Facet } from "@/lib/services/jurisprudence/store"
import type { RelatedQuery } from "@/lib/services/jurisprudence/service"
import type { JurisprudenceDecision, JurisprudenceFilters, JurisprudencePage, JurisprudenceSort } from "@/lib/services/jurisprudence/types"

export type { LinkedEntry, SavedEntry, Facet }

export class JurisApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const FALLBACK = "A pesquisa de jurisprudência está indisponível no momento. Tente novamente em instantes."

async function call<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      cache: "no-store",
    })
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error
    throw new JurisApiError("Sem conexão. Verifique a internet e tente de novo.", "OFFLINE", 0)
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null
  if (!response.ok || !data) {
    const error = data?.error
    throw new JurisApiError(error?.message || FALLBACK, error?.code || "UNAVAILABLE", response.status)
  }
  return data
}

export interface StatusResponse {
  configured: boolean
  total: number
  sources: { id: string; label: string; tribunal: string; url: string; license: string; decisions: number; lastSuccess: string | null }[]
}

export type SearchResponse = JurisprudencePage & { savedIds: string[] }

export interface DecisionResponse {
  decision: JurisprudenceDecision
  saved: { id: string; notes?: string } | null
  linkedProcessIds: string[]
}

export interface RelatedResponse extends SearchResponse {
  query: RelatedQuery
  sentence: string
}

export const jurisApi = {
  status: () => call<StatusResponse>("/api/jurisprudence/status"),
  facets: () => call<{ facets: Record<string, Facet[]> }>("/api/jurisprudence/facets"),
  search: (input: { text: string; filters: JurisprudenceFilters; sort: JurisprudenceSort; page: number }, signal?: AbortSignal) =>
    call<SearchResponse>("/api/jurisprudence/search", { method: "POST", body: input, signal }),
  decision: (id: string) => call<DecisionResponse>(`/api/jurisprudence/${encodeURIComponent(id)}`),
  saved: (page: number) => call<{ entries: SavedEntry[]; total: number; page: number; pages: number }>(`/api/jurisprudence/saved?page=${page}`),
  save: (id: string, notes?: string) => call<{ saved: { notes: string | null } }>(`/api/jurisprudence/${id}/save`, { method: "POST", body: { notes } }),
  updateNotes: (id: string, notes: string) => call<{ saved: { notes: string | null } }>(`/api/jurisprudence/${id}/save`, { method: "PATCH", body: { notes } }),
  unsave: (id: string) => call<{ saved: null }>(`/api/jurisprudence/${id}/save`, { method: "DELETE" }),
  link: (id: string, processId: string) => call<{ linked: true; created: boolean }>(`/api/jurisprudence/${id}/link`, { method: "POST", body: { processId } }),
  unlink: (id: string, processId: string) => call<{ linked: false }>(`/api/jurisprudence/${id}/link`, { method: "DELETE", body: { processId } }),
  linked: (processId: string) => call<{ entries: LinkedEntry[] }>(`/api/processes/${encodeURIComponent(processId)}/jurisprudence`),
  related: (processId: string, page = 1) =>
    call<RelatedResponse>(`/api/processes/${encodeURIComponent(processId)}/jurisprudence/related`, { method: "POST", body: { page } }),
}
