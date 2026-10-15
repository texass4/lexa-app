"use client"

import * as React from "react"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useClientDetail, useDebounced, useEnsureScopes, useHistoryStats, usePagedHistory } from "@/lib/store/on-demand"
import { documentSearchWhere, olderDocumentsWhere, uploadedKey } from "@/lib/store/history-lists"
import { byId } from "@/lib/store/indexes"
import { searchFilter, type Scope } from "@/lib/store/storage"
import { LIST_PAGE } from "@/components/ui/show-more"
import { diffInDays, getNow, parse } from "@/lib/core/dates"
import { matches } from "@/lib/core/format"
import { RECENT_DAYS } from "@/lib/dashboard/attention"
import { processSubject } from "@/lib/processos/label"
import { useDocumentFavorites } from "@/lib/documentos/favorites"
import {
  hasFilters,
  matchesState,
  sortDocuments,
  toQuery,
  type LibraryState,
  type Related,
  type SortDir,
  type SortKey,
} from "@/lib/documentos/library"
import type { LegalDocument } from "@/types"

interface DocumentStats {
  total: number
  bytes: number
  kinds: Record<string, number>
  clients: string[]
}

/** Item navegável que não é arquivo: um cliente (em "Clientes") ou um processo (dentro do cliente). */
export interface FolderItem {
  id: string
  type: "client" | "process"
  label: string
  sublabel: string
  /** Quantos documentos tem (só quando a conta é exata). */
  count?: number
  target: LibraryState
}

export const isNewDocument = (d: LegalDocument, now = getNow()) => diffInDays(now, parse(d.uploadedAt)) <= RECENT_DAYS

/**
 * Os documentos que a tela mostra para o lugar, os filtros, a busca e a ordem atuais.
 *
 * - Todos: os recentes estão na memória; os anteriores vêm do banco em páginas, já
 *   filtrados lá (os mesmos filtros), e a busca procura em tudo.
 * - Recentes: os enviados nos últimos dias (todos na memória).
 * - Favoritos: os marcados pela pessoa (os antigos são lidos pelo id).
 * - Clientes: cada cliente com documentos; dentro dele, tudo dele é lido (perfil do
 *   cliente), então os processos e as contagens são exatos.
 */
export function useDocumentLibrary(state: LibraryState, search: string, sort: { key: SortKey; dir: SortDir }) {
  const data = useOfficeData()
  const { windowBounds } = useOfficeActions()
  const now = getNow()
  const bounds = windowBounds()
  const stats = useHistoryStats<DocumentStats>("document_history_stats", { p_before: bounds.documents })
  const favorites = useDocumentFavorites()

  // Favoritos anteriores à janela: lidos pelo id.
  const favoriteKey = favorites.status === "ready" ? [...favorites.ids].sort().join(",") : ""
  const favoriteScopes = React.useMemo<Scope[] | null>(
    () =>
      state.section === "favoritos" && favoriteKey
        ? [{ key: "documents", id: `documents:favoritos:${favoriteKey}`, filter: { in: [["id", favoriteKey.split(",")]] } }]
        : null,
    [state.section, favoriteKey],
  )
  const favoritesLoaded = useEnsureScopes(favoriteScopes)
  const clientLoaded = useClientDetail(state.section === "clientes" ? state.clientId : undefined)

  const trimmed = search.trim()
  const term = useDebounced(trimmed)
  const isAll = state.section === "todos"
  const queryKey = JSON.stringify(state)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = React.useMemo(() => toQuery(state, getNow()), [queryKey])

  const related = React.useCallback(
    (d: LegalDocument): Related => {
      const client = byId(data.clients, d.clientId)
      const process = byId(data.processes, d.processId)
      return {
        clientName: client?.name,
        processNumber: process?.number,
        processCode: process?.code,
        processTitle: process ? processSubject(process) : undefined,
      }
    },
    [data.clients, data.processes],
  )

  const serverSearch = React.useMemo(() => {
    if (!isAll) return null
    const clients = data.clients.filter((c) => matches(term, c.name)).map((c) => c.id)
    const processes = data.processes.filter((p) => matches(term, p.number, p.code)).map((p) => p.id)
    return searchFilter(term, [
      { column: "data->>clientId", ids: clients },
      { column: "data->>processId", ids: processes },
    ])
  }, [isAll, term, data.clients, data.processes])

  const historyList = React.useMemo(
    () => (!isAll ? null : serverSearch ? documentSearchWhere(term, serverSearch, query) : olderDocumentsWhere(bounds, query)),
    [isAll, serverSearch, term, query, bounds],
  )
  const inWindow = (d: LegalDocument) => (d.uploadedAt ?? "") >= bounds.documents
  const recentMatches = isAll ? data.documents.filter((d) => inWindow(d) && matchesState(d, state, now)).length : 0
  const history = usePagedHistory(historyList, bounds.documents, { auto: !!serverSearch || recentMatches < LIST_PAGE })
  // Só até onde a lista está completa (mais recentes primeiro, sem buracos).
  const contiguous = (d: LegalDocument) => !isAll || history.cursor === null || uploadedKey(d) >= history.cursor

  const filtered = hasFilters(state) || !!trimmed
  const visible = (d: LegalDocument) => contiguous(d) && matchesState(d, state, now, trimmed, related(d))

  // Clientes com documentos: os da janela mais os do histórico (contados no banco).
  const clientsWithDocs = React.useMemo(() => {
    const ids = new Set([...data.documents.map((d) => d.clientId), ...(stats?.clients ?? [])])
    return data.clients.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [data.documents, data.clients, stats])

  let rows: LegalDocument[] = []
  let folders: FolderItem[] = []
  if (state.section === "todos") rows = data.documents.filter(visible)
  else if (state.section === "recentes") rows = data.documents.filter((d) => isNewDocument(d, now) && visible(d))
  else if (state.section === "favoritos")
    rows = favorites.status === "ready" ? data.documents.filter((d) => favorites.ids.has(d.id) && visible(d)) : []
  else if (!state.clientId) {
    folders = clientsWithDocs
      .filter((c) => matches(trimmed, c.name))
      .map((c) => {
        const processes = data.processes.filter((p) => p.clientId === c.id).length
        return {
          id: c.id,
          type: "client",
          label: c.name,
          sublabel: processes ? `${processes} processo${processes === 1 ? "" : "s"}` : "Cliente",
          target: { ...state, section: "clientes", clientId: c.id, processId: undefined },
        }
      })
  } else {
    const ofClient = data.documents.filter((d) => d.clientId === state.clientId)
    if (state.processId || filtered) rows = ofClient.filter(visible)
    else {
      rows = ofClient.filter((d) => !d.processId && visible(d))
      const counts = new Map<string, number>()
      for (const d of ofClient) if (d.processId) counts.set(d.processId, (counts.get(d.processId) ?? 0) + 1)
      folders = data.processes
        .filter((p) => counts.has(p.id))
        .map((p) => ({
          id: p.id,
          type: "process" as const,
          label: processSubject(p),
          sublabel: p.code,
          count: counts.get(p.id),
          target: { ...state, processId: p.id },
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
    }
  }
  rows = sortDocuments(rows, sort.key, sort.dir)

  // Contagens da navegação: janela (memória) + histórico (banco).
  const windowDocs = data.documents.filter(inWindow)
  const kindCount = (kind: string) => (stats ? windowDocs.filter((d) => d.kind === kind).length + Number(stats.kinds[kind] ?? 0) : undefined)
  const counts = {
    all: stats ? windowDocs.length + Number(stats.total) : undefined,
    bytes: stats ? windowDocs.reduce((n, d) => n + d.sizeBytes, 0) + Number(stats.bytes) : undefined,
    recent: data.hydrated ? data.documents.filter((d) => isNewDocument(d, now)).length : undefined,
    favorites: favorites.status === "ready" ? favorites.ids.size : undefined,
    kind: kindCount,
  }

  // Total real da lista, quando se sabe (o "Mostrar mais" usa).
  const total = isAll
    ? serverSearch
      ? history.total
      : trimmed
        ? undefined
        : history.total !== undefined
          ? recentMatches + history.total
          : undefined
    : rows.length

  const loading =
    !data.hydrated ||
    (isAll && rows.length === 0 && history.loading) ||
    (state.section === "favoritos" && (favorites.status === "loading" || !favoritesLoaded)) ||
    (state.section === "clientes" && !!state.clientId && !clientLoaded)

  return {
    ready: data.hydrated,
    error: !data.hydrated && !!data.loadError,
    loading,
    /** A busca ainda vai ao banco (o termo mudou há pouco ou a página está chegando). */
    searching: isAll && !!trimmed && (term !== trimmed || (!!serverSearch && history.loading)),
    rows,
    folders,
    history: isAll ? history : undefined,
    total,
    counts,
    clientsWithDocs,
    favorites,
    filtered,
  }
}
