"use client"

import * as React from "react"
import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import { currentOrgId, currentUserId } from "@/lib/auth/account"

/**
 * Favoritos da Central de Documentos: de cada pessoa, gravados no banco
 * (`document_favorites`, migração 0026, RLS por pessoa e escritório). A tela só
 * mostra o estado depois que o banco confirma — nada fica só no navegador.
 *
 * Sem a migração aplicada, o recurso aparece como indisponível (nada finge funcionar).
 */
export type FavoritesStatus = "loading" | "ready" | "unavailable" | "error"

interface State {
  owner: string
  status: FavoritesStatus
  ids: ReadonlySet<string>
}

let state: State = { owner: "", status: "loading", ids: new Set() }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function set(next: Partial<State>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

/** Tabela inexistente (migração não aplicada) ou fora do cache do PostgREST. */
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST202"

async function load(owner: string) {
  const { data, error } = await getSupabase().from("document_favorites").select("document_id")
  if (state.owner !== owner) return
  if (error) set({ status: missingTable(error.code) ? "unavailable" : "error" })
  else set({ status: "ready", ids: new Set(data.map((r) => r.document_id as string)) })
}

function ensure() {
  const owner = `${currentOrgId()}:${currentUserId()}`
  if (state.owner !== owner) {
    state = { owner, status: "loading", ids: new Set() }
    inflight = null
  }
  if (state.status === "loading" && !inflight) inflight = load(owner).finally(() => (inflight = null))
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useDocumentFavorites() {
  React.useEffect(ensure, [])
  const snapshot = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  return {
    status: snapshot.status,
    ids: snapshot.ids,
    isFavorite: (id: string) => snapshot.ids.has(id),
    retry: () => {
      set({ status: "loading" })
      ensure()
    },
  }
}

/**
 * Marca (ou desmarca) vários documentos de uma vez. Devolve `true` quando o banco
 * gravou; a lista da tela só muda nesse caso.
 */
export async function setFavorites(documentIds: string[], favorite: boolean): Promise<boolean> {
  if (!documentIds.length) return true
  const supabase = getSupabase()
  const organizationId = currentOrgId()
  const userId = currentUserId()
  const { error } = favorite
    ? await supabase.from("document_favorites").upsert(
        documentIds.map((document_id) => ({ organization_id: organizationId, user_id: userId, document_id })),
        { onConflict: "organization_id,user_id,document_id", ignoreDuplicates: true },
      )
    : await supabase.from("document_favorites").delete().eq("user_id", userId).in("document_id", documentIds)
  if (error) {
    if (missingTable(error.code)) set({ status: "unavailable" })
    toast.error(favorite ? "Não foi possível adicionar aos favoritos." : "Não foi possível remover dos favoritos.", {
      description: missingTable(error.code) ? "Favoritos ainda não estão ativos neste escritório." : "Verifique a conexão e tente de novo.",
    })
    return false
  }
  const ids = new Set(state.ids)
  for (const id of documentIds) {
    if (favorite) ids.add(id)
    else ids.delete(id)
  }
  set({ ids })
  return true
}

/** Um documento excluído sai dos favoritos (o banco já remove em cascata). */
export function forgetFavorites(documentIds: string[]) {
  if (!documentIds.some((id) => state.ids.has(id))) return
  const ids = new Set(state.ids)
  for (const id of documentIds) ids.delete(id)
  set({ ids })
}
