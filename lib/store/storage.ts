/**
 * Persistência dos dados do escritório no Supabase.
 *
 * Cada coleção do store é uma tabela (`organization_id`, `id`, `data jsonb`). A RLS
 * do banco garante que só se lê e grava no escritório de quem está logado, e só nos
 * módulos em que a pessoa tem permissão — este arquivo não precisa (nem deve) filtrar
 * por escritório na leitura.
 *
 * O store é imutável: um registro que mudou é um objeto novo. Por isso a sincronização
 * compara por identidade e grava só o que mudou (`diffState`).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Activity, Appointment, AppointmentCategory, Client, Invoice, LegalDocument, Notification, Process, Task, TaskColumn } from "@/types"

export interface PersistedState {
  clients: Client[]
  processes: Process[]
  tasks: Task[]
  taskColumns: TaskColumn[]
  appointments: Appointment[]
  appointmentCategories: AppointmentCategory[]
  documents: LegalDocument[]
  invoices: Invoice[]
  activities: Activity[]
  notifications: Notification[]
}

export type Collection = keyof PersistedState

export const TABLES: Record<Collection, string> = {
  clients: "clients",
  processes: "processes",
  tasks: "tasks",
  taskColumns: "task_columns",
  appointments: "appointments",
  appointmentCategories: "appointment_categories",
  documents: "documents",
  invoices: "invoices",
  activities: "activities",
  notifications: "notifications",
}

export const COLLECTION_LABELS: Record<Collection, string> = {
  clients: "clientes",
  processes: "processos",
  tasks: "tarefas",
  taskColumns: "colunas do quadro",
  appointments: "compromissos",
  appointmentCategories: "categorias da agenda",
  documents: "documentos",
  invoices: "faturas",
  activities: "atividades",
  notifications: "notificações",
}

/** Coleções em que o item novo entra no topo da lista (ações usam `[novo, ...lista]`). */
const NEWEST_FIRST = new Set<Collection>(["clients", "processes", "tasks", "documents", "invoices", "activities", "notifications"])

/** Só recebem inserções — não há política de UPDATE no banco. */
const APPEND_ONLY = new Set<Collection>(["activities"])

const COLLECTIONS = Object.keys(TABLES) as Collection[]
const PAGE = 1000

type Entity = { id: string }

export interface CollectionDiff<T extends Entity = Entity> {
  upserts: T[]
  deletes: T[]
}

export type StateDiff = Partial<Record<Collection, CollectionDiff>>

export function diffCollection<T extends Entity>(prev: readonly T[], next: readonly T[]): CollectionDiff<T> {
  const before = new Map(prev.map((item) => [item.id, item]))
  const after = new Set(next.map((item) => item.id))
  return {
    upserts: next.filter((item) => before.get(item.id) !== item),
    deletes: prev.filter((item) => !after.has(item.id)),
  }
}

/** O que mudou entre dois estados — só as coleções com alteração. */
export function diffState(prev: PersistedState, next: PersistedState): StateDiff {
  const diff: StateDiff = {}
  for (const key of COLLECTIONS) {
    if (prev[key] === next[key]) continue
    const changes = diffCollection<Entity>(prev[key], next[key])
    if (changes.upserts.length || changes.deletes.length) diff[key] = changes
  }
  return diff
}

const sortKey = (item: Entity) => {
  const record = item as { createdAt?: string; at?: string }
  return record.createdAt ?? record.at ?? ""
}

/** Ordena como o store mantém em memória (mais novo no topo, ou cronológico). */
export function orderCollection<T extends Entity>(key: Collection, items: T[]): T[] {
  const dir = NEWEST_FIRST.has(key) ? -1 : 1
  return [...items].sort((a, b) => dir * sortKey(a).localeCompare(sortKey(b)))
}

async function loadCollection(supabase: SupabaseClient, key: Collection) {
  const items: Entity[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLES[key])
      .select("data")
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) throw error
    items.push(...(data as { data: Entity }[]).map((row) => row.data))
    if (data.length < PAGE) return orderCollection(key, items)
  }
}

/** Carrega tudo o que a RLS deixa esta pessoa ver. */
export async function loadState(supabase: SupabaseClient): Promise<PersistedState> {
  const lists = await Promise.all(COLLECTIONS.map((key) => loadCollection(supabase, key)))
  return Object.fromEntries(COLLECTIONS.map((key, i) => [key, lists[i]])) as unknown as PersistedState
}

export interface SyncResult {
  /** Coleções que o banco recusou por falta de permissão. */
  denied: Collection[]
  /** Falhou por outro motivo (rede, servidor). */
  failed: boolean
}

const isRlsDenial = (error: { code?: string; message?: string }) => error.code === "42501" || /row-level security/i.test(error.message ?? "")

/** Grava as mudanças no escritório. Arquivos de documentos excluídos saem do Storage. */
export async function syncState(supabase: SupabaseClient, organizationId: string, diff: StateDiff): Promise<SyncResult> {
  const result: SyncResult = { denied: [], failed: false }

  for (const key of Object.keys(diff) as Collection[]) {
    const { upserts, deletes } = diff[key]!
    const table = TABLES[key]

    if (upserts.length) {
      const rows = upserts.map((item) => ({ organization_id: organizationId, id: item.id, data: item }))
      const { error } = await supabase.from(table).upsert(rows, { onConflict: "organization_id,id", ignoreDuplicates: APPEND_ONLY.has(key) })
      if (error) {
        if (isRlsDenial(error)) result.denied.push(key)
        else result.failed = true
        continue
      }
    }

    if (deletes.length) {
      const ids = deletes.map((item) => item.id)
      // Exclusão barrada pela RLS não dá erro: só não apaga. Conferimos o que saiu.
      const { data, error } = await supabase.from(table).delete().eq("organization_id", organizationId).in("id", ids).select("id")
      if (error) {
        result.failed = true
        continue
      }
      if ((data?.length ?? 0) < ids.length) result.denied.push(key)

      if (key === "documents") {
        const removed = new Set((data ?? []).map((row) => row.id as string))
        const paths = (deletes as LegalDocument[]).filter((d) => removed.has(d.id) && d.storagePath).map((d) => d.storagePath!)
        if (paths.length) await supabase.storage.from("documents").remove(paths)
      }
    }
  }

  return result
}
