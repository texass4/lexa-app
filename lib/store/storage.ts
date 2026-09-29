/**
 * Persistência dos dados do escritório no Supabase.
 *
 * Cada coleção do store é uma tabela (`organization_id`, `id`, `data jsonb`, `updated_at`).
 * A RLS do banco garante que só se lê e grava no escritório de quem está logado, e só nos
 * módulos em que a pessoa tem permissão — este arquivo não precisa (nem deve) filtrar
 * por escritório na leitura.
 *
 * O store é imutável: um registro que mudou é um objeto novo. Por isso a sincronização
 * compara por identidade e grava só o que mudou (`diffState`).
 *
 * Concorrência: `updated_at` é a versão do registro (o banco a troca a cada gravação,
 * `0006_team_sync.sql`). Alteração e exclusão só acontecem se o registro ainda está na
 * versão que este navegador conhece — `update … where id = … and updated_at = …` é um
 * único comando no banco, então a conferência e a gravação são atômicas. Se ninguém foi
 * alterado, outra pessoa mexeu antes: a gravação é recusada (`stale`), nunca sobrescrita.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Activity,
  Appointment,
  AppointmentCategory,
  Client,
  Invoice,
  LegalDocument,
  Notification,
  Prazo,
  Process,
  Task,
  TaskColumn,
} from "@/types"

export interface PersistedState {
  clients: Client[]
  processes: Process[]
  tasks: Task[]
  taskColumns: TaskColumn[]
  /** Prazos (tabela `deadlines`). Depois de tarefas: um prazo pode apontar para a tarefa criada junto. */
  deadlines: Prazo[]
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
  deadlines: "deadlines",
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
  deadlines: "prazos",
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

export const COLLECTIONS = Object.keys(TABLES) as Collection[]
/** Coleção de cada tabela (eventos do Realtime chegam pelo nome da tabela). */
export const COLLECTION_OF_TABLE = Object.fromEntries(COLLECTIONS.map((key) => [TABLES[key], key])) as Record<string, Collection>

/** Atividades por último: se outra gravação do mesmo lote for recusada, o registro dela não entra. */
const WRITE_ORDER: Collection[] = [...COLLECTIONS.filter((key) => key !== "activities"), "activities"]

const PAGE = 1000
/** Ids por requisição em `.in("id", …)` (fica bem abaixo do limite de tamanho da URL). */
const ID_CHUNK = 100

type Entity = { id: string }

/** Linha como está no banco: a entidade e a versão dela. */
export interface ServerRow<T extends Entity = Entity> {
  id: string
  data: T
  updated_at: string
}

/** Versão (`updated_at`) de cada registro que este navegador sabe estar no banco, por coleção. */
export type Versions = Record<Collection, Map<string, string>>

export const emptyVersions = (): Versions => Object.fromEntries(COLLECTIONS.map((key) => [key, new Map()])) as unknown as Versions

export interface Snapshot {
  state: PersistedState
  versions: Versions
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

/**
 * Versão em microssegundos. O Postgres guarda microssegundos e o `Date` do JS só
 * milissegundos; a API e o Realtime também formatam a data de jeitos diferentes
 * (`T`/espaço, `+00:00`/`+00`). Comparar o número evita os dois problemas.
 */
export function versionValue(version: string): number {
  const m = TIMESTAMP.exec(version.trim())
  if (!m) return Number.NaN
  const [, y, mo, d, h, mi, s, frac = "", zone = "Z"] = m
  let offsetMinutes = 0
  if (zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1
    const digits = zone.slice(1).replace(":", "")
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0))
  }
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetMinutes * 60_000
  return ms * 1000 + Number(frac.padEnd(6, "0"))
}

/** < 0: `a` é mais antiga; 0: mesma versão; > 0: `a` é mais nova. */
export function compareVersions(a: string, b: string): number {
  return versionValue(a) - versionValue(b)
}

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

/**
 * Coloca (ou troca) um registro na lista, sem duplicar: se o id já existe, substitui
 * no lugar; se é novo, entra onde as ações do store colocariam (topo ou fim).
 */
export function upsertById<T extends Entity>(key: Collection, list: readonly T[], item: T): T[] {
  const index = list.findIndex((current) => current.id === item.id)
  if (index >= 0) {
    if (list[index] === item) return list as T[]
    const next = [...list]
    next[index] = item
    return next
  }
  return NEWEST_FIRST.has(key) ? [item, ...list] : [...list, item]
}

export function removeById<T extends Entity>(list: readonly T[], id: string): T[] {
  return list.some((item) => item.id === id) ? list.filter((item) => item.id !== id) : (list as T[])
}

async function loadCollection(supabase: SupabaseClient, key: Collection) {
  const rows: ServerRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLES[key])
      .select("id, data, updated_at")
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as ServerRow[]))
    if (data.length < PAGE) return rows
  }
}

/** Carrega tudo o que a RLS deixa esta pessoa ver, com a versão de cada registro. */
export async function loadState(supabase: SupabaseClient): Promise<Snapshot> {
  const lists = await Promise.all(COLLECTIONS.map((key) => loadCollection(supabase, key)))
  const versions = emptyVersions()
  const state = {} as Record<Collection, Entity[]>
  COLLECTIONS.forEach((key, i) => {
    for (const row of lists[i]) versions[key].set(row.id, row.updated_at)
    state[key] = orderCollection(
      key,
      lists[i].map((row) => row.data),
    )
  })
  return { state: state as unknown as PersistedState, versions }
}

/**
 * Só id e versão de cada registro: base da revalidação (volta à aba, reconexão). É
 * leve, e mostra o que mudou ou saiu sem baixar os dados de novo.
 */
export async function fetchManifest(supabase: SupabaseClient, key: Collection): Promise<Map<string, string>> {
  const manifest = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLES[key])
      .select("id, updated_at")
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data as { id: string; updated_at: string }[]) manifest.set(row.id, row.updated_at)
    if (data.length < PAGE) return manifest
  }
}

/** Registros específicos, como estão agora no banco (os que não voltam foram excluídos ou não são visíveis). */
export async function fetchRecords(supabase: SupabaseClient, key: Collection, ids: string[]): Promise<ServerRow[]> {
  const rows: ServerRow[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from(TABLES[key])
      .select("id, data, updated_at")
      .in("id", ids.slice(i, i + ID_CHUNK))
    if (error) throw error
    rows.push(...(data as ServerRow[]))
  }
  return rows
}

export async function fetchRecord(supabase: SupabaseClient, key: Collection, id: string): Promise<ServerRow | null> {
  const { data, error } = await supabase.from(TABLES[key]).select("id, data, updated_at").eq("id", id).maybeSingle()
  if (error) throw error
  return (data as ServerRow | null) ?? null
}

type WriteError = "denied" | "conflict" | "failed"

const isRlsDenial = (error: { code?: string; message?: string }) => error.code === "42501" || /row-level security/i.test(error.message ?? "")
/** Índice único ou restrição de validação do banco (`0004_clients_hub.sql`). */
const isConstraint = (error: { code?: string }) => error.code === "23505" || error.code === "23514"
const classify = (error: { code?: string; message?: string }): WriteError =>
  isRlsDenial(error) ? "denied" : isConstraint(error) ? "conflict" : "failed"

/** Cria um registro e devolve a linha como o banco gravou (ex.: com o código do processo). */
export async function insertRecord(
  supabase: SupabaseClient,
  organizationId: string,
  key: Collection,
  item: Entity,
): Promise<{ row: ServerRow } | { error: WriteError }> {
  const { data, error } = await supabase
    .from(TABLES[key])
    .insert({ organization_id: organizationId, id: item.id, data: item })
    .select("id, data, updated_at")
    .single()
  if (error) return { error: classify(error) }
  return { row: data as ServerRow }
}

type RowOutcome =
  | { kind: "saved"; row: ServerRow }
  | { kind: "removed" }
  /** Outra pessoa alterou (`row`) ou excluiu (`row: null`) o registro antes. */
  | { kind: "stale"; row: ServerRow | null }
  | { kind: "error"; error: WriteError }

/**
 * Nenhuma linha afetada: o registro mudou de versão, saiu, ou a RLS não deixou
 * (a RLS não dá erro no UPDATE/DELETE — só não afeta a linha). Lendo o registro de
 * novo dá para saber qual dos três; a decisão de recusar já foi tomada pelo banco.
 */
async function explainMiss(supabase: SupabaseClient, key: Collection, id: string, expected: string): Promise<RowOutcome> {
  const current = await fetchRecord(supabase, key, id)
  if (!current) return { kind: "stale", row: null }
  if (compareVersions(current.updated_at, expected) === 0) return { kind: "error", error: "denied" }
  return { kind: "stale", row: current }
}

async function updateRecord(supabase: SupabaseClient, organizationId: string, key: Collection, item: Entity, expected: string): Promise<RowOutcome> {
  const { data, error } = await supabase
    .from(TABLES[key])
    .update({ data: item })
    .eq("organization_id", organizationId)
    .eq("id", item.id)
    .eq("updated_at", expected)
    .select("id, data, updated_at")
  if (error) return { kind: "error", error: classify(error) }
  if (data.length) return { kind: "saved", row: data[0] as ServerRow }
  return explainMiss(supabase, key, item.id, expected)
}

async function deleteRecord(supabase: SupabaseClient, organizationId: string, key: Collection, id: string, expected: string): Promise<RowOutcome> {
  const { data, error } = await supabase
    .from(TABLES[key])
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("updated_at", expected)
    .select("id")
  if (error) return { kind: "error", error: classify(error) }
  if (data.length) return { kind: "removed" }
  const miss = await explainMiss(supabase, key, id, expected)
  // Já tinha sido excluído por outra pessoa: o resultado é o mesmo.
  return miss.kind === "stale" && !miss.row ? { kind: "removed" } : miss
}

export interface SyncResult {
  /** Gravados, com a linha que o banco devolveu (versão nova). */
  saved: { key: Collection; sent: Entity; row: ServerRow }[]
  /** Excluídos no banco. */
  removed: { key: Collection; id: string }[]
  /** Recusados porque outra pessoa alterou (`row`) ou excluiu (`row: null`) o registro antes. */
  stale: { key: Collection; id: string; row: ServerRow | null }[]
  /** Atividades não gravadas porque a alteração que elas descrevem foi recusada. */
  dropped: { key: Collection; id: string }[]
  /** Coleções que o banco recusou por falta de permissão. */
  denied: Collection[]
  /** Coleções recusadas por regra de unicidade (ex.: CPF/CNPJ já cadastrado no escritório). */
  conflicts: Collection[]
  /** Falhou por outro motivo (rede, servidor). */
  failed: boolean
}

export const emptySyncResult = (): SyncResult => ({ saved: [], removed: [], stale: [], dropped: [], denied: [], conflicts: [], failed: false })

/** Ids de cada coleção tocados por um diff. */
export function diffIds(diff: StateDiff): { key: Collection; id: string }[] {
  return (Object.keys(diff) as Collection[]).flatMap((key) => [...diff[key]!.upserts, ...diff[key]!.deletes].map((item) => ({ key, id: item.id })))
}

/**
 * Grava as mudanças no escritório. Registros novos são inseridos; os que já existem
 * só são alterados/excluídos se continuam na versão conhecida (`versions`). Arquivos
 * de documentos excluídos saem do Storage.
 */
export async function syncState(supabase: SupabaseClient, organizationId: string, diff: StateDiff, versions: Versions): Promise<SyncResult> {
  const result = emptySyncResult()
  const fail = (key: Collection, error: WriteError) => {
    const list = error === "denied" ? result.denied : error === "conflict" ? result.conflicts : null
    if (!list) result.failed = true
    else if (!list.includes(key)) list.push(key)
  }

  for (const key of WRITE_ORDER) {
    const changes = diff[key]
    if (!changes) continue
    const table = TABLES[key]
    const known = versions[key]
    const inserts = changes.upserts.filter((item) => !known.has(item.id))
    const updates = APPEND_ONLY.has(key) ? [] : changes.upserts.filter((item) => known.has(item.id))

    if (key === "activities" && result.stale.length) {
      result.dropped.push(...inserts.map((item) => ({ key, id: item.id })))
      continue
    }

    if (inserts.length) {
      const rows = inserts.map((item) => ({ organization_id: organizationId, id: item.id, data: item }))
      const query = APPEND_ONLY.has(key)
        ? supabase.from(table).upsert(rows, { onConflict: "organization_id,id", ignoreDuplicates: true })
        : supabase.from(table).insert(rows)
      const { data, error } = await query.select("id, data, updated_at")
      if (error) fail(key, classify(error))
      else {
        const sent = new Map(inserts.map((item) => [item.id, item]))
        for (const row of data as ServerRow[]) result.saved.push({ key, sent: sent.get(row.id)!, row })
      }
    }

    const outcomes = await Promise.all([
      ...updates.map(async (item) => ({
        id: item.id,
        sent: item,
        outcome: await updateRecord(supabase, organizationId, key, item, known.get(item.id)!),
      })),
      ...changes.deletes
        .filter((item) => known.has(item.id))
        .map(async (item) => ({ id: item.id, sent: item, outcome: await deleteRecord(supabase, organizationId, key, item.id, known.get(item.id)!) })),
    ])

    const removedDocs: LegalDocument[] = []
    for (const { id, sent, outcome } of outcomes) {
      if (outcome.kind === "saved") result.saved.push({ key, sent, row: outcome.row })
      else if (outcome.kind === "removed") {
        result.removed.push({ key, id })
        if (key === "documents") removedDocs.push(sent as LegalDocument)
      } else if (outcome.kind === "stale") result.stale.push({ key, id, row: outcome.row })
      else fail(key, outcome.error)
    }

    const paths = removedDocs.filter((d) => d.storagePath).map((d) => d.storagePath!)
    if (paths.length) await supabase.storage.from("documents").remove(paths)
  }

  return result
}
