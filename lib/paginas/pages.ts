"use client"

/**
 * Páginas no banco (`pages`, `page_favorites` — migração 0027). Toda leitura e gravação
 * passa pela RLS: o navegador só recebe o que a pessoa pode ver.
 *
 * - A lista (metadados, sem o conteúdo) fica num cache do módulo, recarregado ao voltar
 *   para a aba; o conteúdo é lido ao abrir a página.
 * - A gravação do conteúdo é condicionada à versão (`version`): se outra pessoa gravou
 *   antes, volta "conflito" — nada é sobrescrito sem a pessoa decidir.
 * - Nada fica só no navegador: sem a migração, o recurso aparece como indisponível.
 */
import * as React from "react"
import { getSupabase } from "@/lib/supabase/client"
import { currentOrgId, currentUserId } from "@/lib/auth/account"
import { normalize, uid } from "@/lib/core/format"
import { PageSaver, type PagePatch, type SaveOutcome } from "./autosave"
import {
  descendants,
  fromRow,
  likeLiteral,
  PAGE_META_COLUMNS,
  type DocNode,
  type PageMeta,
  type PageRecord,
  type PageRow,
  type PageVisibility,
} from "./model"

export type PagesStatus = "loading" | "ready" | "unavailable" | "error"

interface State {
  owner: string
  status: PagesStatus
  pages: ReadonlyMap<string, PageMeta>
  favorites: ReadonlySet<string>
  loadedAt: number
}

let state: State = { owner: "", status: "loading", pages: new Map(), favorites: new Set(), loadedAt: 0 }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function set(next: Partial<State>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

/** Tabela inexistente (migração não aplicada) ou fora do cache do PostgREST. */
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST202"

/** Limite da lista na memória (metadados leves). Acima disso, a busca no banco encontra o resto. */
const LIST_LIMIT = 2000

async function load(owner: string) {
  const supabase = getSupabase()
  const [list, favs] = await Promise.all([
    supabase.from("pages").select(PAGE_META_COLUMNS).order("updated_at", { ascending: false }).limit(LIST_LIMIT),
    supabase.from("page_favorites").select("page_id"),
  ])
  if (state.owner !== owner) return
  if (list.error) {
    set({ status: missingTable(list.error.code) ? "unavailable" : "error" })
    return
  }
  set({
    status: "ready",
    pages: new Map((list.data as unknown as PageRow[]).map((r) => [r.id, fromRow(r)])),
    favorites: new Set(favs.error ? [] : favs.data.map((r) => r.page_id as string)),
    loadedAt: Date.now(),
  })
}

function ensure(force = false) {
  const owner = `${currentOrgId()}:${currentUserId()}`
  if (state.owner !== owner) {
    state = { owner, status: "loading", pages: new Map(), favorites: new Set(), loadedAt: 0 }
    inflight = null
  }
  if ((force || state.status === "loading" || state.status === "error") && !inflight) {
    inflight = load(owner).finally(() => (inflight = null))
  }
  return inflight ?? Promise.resolve()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Recarrega a lista ao voltar para a aba (outra pessoa pode ter criado/alterado páginas). */
function useRefreshOnFocus() {
  React.useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - state.loadedAt > 20_000) void ensure(true)
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [])
}

export function usePages() {
  React.useEffect(() => void ensure(), [])
  useRefreshOnFocus()
  const snap = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  const list = React.useMemo(() => [...snap.pages.values()], [snap.pages])
  return {
    status: snap.status,
    pages: snap.pages,
    list,
    favorites: snap.favorites,
    reload: () => ensure(true),
  }
}

/** Atualiza (ou inclui) uma página no cache sem recarregar a lista. */
export function rememberPage(meta: PageMeta) {
  const pages = new Map(state.pages)
  pages.set(meta.id, meta)
  set({ pages })
}

function forget(ids: string[]) {
  const pages = new Map(state.pages)
  const favorites = new Set(state.favorites)
  for (const id of ids) {
    pages.delete(id)
    favorites.delete(id)
  }
  set({ pages, favorites })
}

/* ------------------------------------------------------------------ leitura */

export type FetchResult = { status: "ok"; page: PageRecord } | { status: "missing" } | { status: "error" }

/** Conteúdo completo. "missing" = não existe ou a pessoa não tem acesso (a RLS não diferencia). */
export async function fetchPage(id: string): Promise<FetchResult> {
  const { data, error } = await getSupabase().from("pages").select(`${PAGE_META_COLUMNS},content`).eq("id", id).maybeSingle()
  if (error) return missingTable(error.code) ? { status: "missing" } : { status: "error" }
  if (!data) {
    if (state.pages.has(id)) forget([id])
    return { status: "missing" }
  }
  const row = data as unknown as PageRow
  const meta = fromRow(row)
  rememberPage(meta)
  return { status: "ok", page: { ...meta, content: row.content ?? { type: "doc", content: [] } } }
}

/** Só a versão atual (detectar alteração feita por outra pessoa). */
export async function fetchPageVersion(id: string): Promise<{ version: number; updatedBy: string | null; updatedAt: string } | null> {
  const { data, error } = await getSupabase().from("pages").select("version,updated_by,updated_at").eq("id", id).maybeSingle()
  if (error || !data) return null
  return { version: data.version as number, updatedBy: data.updated_by as string | null, updatedAt: data.updated_at as string }
}

/** Busca no título e no texto (sem acento), no banco — inclui o que não está na lista. */
export async function searchPages(query: string, limit = 30): Promise<PageMeta[] | null> {
  const q = normalize(query.trim())
  if (!q) return []
  const { data, error } = await getSupabase()
    .from("pages")
    .select(PAGE_META_COLUMNS)
    .ilike("search", `%${likeLiteral(q)}%`)
    .order("updated_at", { ascending: false })
    .limit(limit)
  if (error) return null
  return (data as unknown as PageRow[]).map(fromRow)
}

/* ------------------------------------------------------------------ escrita */

export interface NewPageInput {
  title: string
  content: DocNode
  visibility: PageVisibility
  parentId?: string | null
  clientId?: string | null
  processId?: string | null
  template?: string | null
}

export type WriteError = "denied" | "network" | "unavailable"

const writeError = (code?: string): WriteError =>
  missingTable(code) ? "unavailable" : code === "42501" || code === "23503" || code === "23514" ? "denied" : "network"

/** Cria e espera o banco confirmar (id gerado aqui: repetir o clique não duplica). */
export async function createPage(input: NewPageInput): Promise<{ page: PageMeta } | { error: WriteError; message?: string }> {
  const id = uid("pg")
  const { data, error } = await getSupabase()
    .from("pages")
    .insert({
      organization_id: currentOrgId(),
      id,
      parent_id: input.parentId ?? null,
      title: input.title,
      content: input.content,
      visibility: input.visibility,
      client_id: input.clientId ?? null,
      process_id: input.processId ?? null,
      template: input.template ?? null,
    })
    .select(PAGE_META_COLUMNS)
    .single()
  if (error) return { error: writeError(error.code), message: error.code === "42501" ? error.message : undefined }
  const page = fromRow(data as unknown as PageRow)
  rememberPage(page)
  return { page }
}

export type MetaPatch = Partial<{ parentId: string | null; visibility: PageVisibility; clientId: string | null; processId: string | null }>

/** Propriedades da página (local, acesso, vínculo). Não mexe no conteúdo. */
export async function updatePageMeta(id: string, patch: MetaPatch): Promise<{ page: PageMeta } | { error: WriteError; message?: string }> {
  const row: Record<string, unknown> = {}
  if ("parentId" in patch) row.parent_id = patch.parentId
  if ("visibility" in patch) row.visibility = patch.visibility
  if ("clientId" in patch) row.client_id = patch.clientId
  if ("processId" in patch) row.process_id = patch.processId
  const { data, error } = await getSupabase().from("pages").update(row).eq("id", id).select(PAGE_META_COLUMNS).maybeSingle()
  if (error) return { error: writeError(error.code), message: error.message }
  if (!data) return { error: "denied" }
  const page = fromRow(data as unknown as PageRow)
  rememberPage(page)
  // A visibilidade desce para as subpáginas no banco: a lista é relida.
  if ("visibility" in patch || "parentId" in patch) void ensure(true)
  saverFor(id)?.rebase(page.version)
  return { page }
}

/** Exclui a página e as subpáginas (o banco remove em cascata). */
export async function deletePage(id: string): Promise<boolean> {
  const removed = [id, ...descendants([...state.pages.values()], id)]
  const { data, error } = await getSupabase().from("pages").delete().eq("id", id).select("id")
  if (error || !data?.length) return false
  for (const pid of removed) {
    savers.get(pid)?.dispose()
    savers.delete(pid)
  }
  forget(removed)
  return true
}

export async function setPageFavorite(id: string, favorite: boolean): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = favorite
    ? await supabase
        .from("page_favorites")
        .upsert(
          { organization_id: currentOrgId(), user_id: currentUserId(), page_id: id },
          { onConflict: "organization_id,user_id,page_id", ignoreDuplicates: true },
        )
    : await supabase.from("page_favorites").delete().eq("user_id", currentUserId()).eq("page_id", id)
  if (error) return false
  const favorites = new Set(state.favorites)
  if (favorite) favorites.add(id)
  else favorites.delete(id)
  set({ favorites })
  return true
}

/* ------------------------------------------------------------- salvamento */

/** Grava título/conteúdo só se a versão no banco ainda for `baseVersion`. */
async function saveContent(id: string, patch: PagePatch, baseVersion: number): Promise<SaveOutcome> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.slice(0, 300)
  if (patch.content !== undefined) row.content = patch.content
  const { data, error } = await getSupabase()
    .from("pages")
    .update(row)
    .eq("id", id)
    .eq("version", baseVersion)
    .select(PAGE_META_COLUMNS)
    .maybeSingle()
  if (error) return { status: "error" }
  if (data) {
    const meta = fromRow(data as unknown as PageRow)
    rememberPage(meta)
    return { status: "saved", version: meta.version, updatedAt: meta.updatedAt }
  }
  // Nada gravado: ou outra versão já está no banco, ou a página sumiu / ficou sem acesso.
  const current = await fetchPageVersion(id)
  if (!current) return { status: "missing" }
  return { status: "conflict", version: current.version, updatedBy: current.updatedBy, updatedAt: current.updatedAt }
}

/**
 * Um salvador por página, no módulo: sair da página não interrompe a gravação, e voltar a
 * ela antes do banco confirmar mostra o que ainda não foi salvo (em vez de perder).
 */
const savers = new Map<string, PageSaver>()

export function saverFor(id: string) {
  return savers.get(id)
}

export function getSaver(id: string, version: number) {
  let saver = savers.get(id)
  if (!saver) {
    saver = new PageSaver({ version, save: (patch, base) => saveContent(id, patch, base) })
    savers.set(id, saver)
  } else if (version > saver.version) saver.rebase(version)
  return saver
}

/** Há conteúdo ainda não confirmado pelo banco (aviso ao fechar a aba). */
export function hasUnsavedPages() {
  for (const s of savers.values()) if (s.hasUnsaved()) return true
  return false
}
