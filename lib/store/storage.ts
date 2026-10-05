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
import { normalize } from "@/lib/core/format"
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

// ---------------------------------------------------------------------------
// Escopos de carga: o que vem na abertura e o que vem sob demanda
// ---------------------------------------------------------------------------

/**
 * Condições de uma leitura, na sintaxe do PostgREST. São as mesmas na carga e na
 * revalidação (que confere só o que foi carregado). Colunas aceitam caminho JSON
 * (`data->>status`, `data->related->>id`).
 */
export interface ScopeFilter {
  /** Condições em OU (`or` do PostgREST), ex.: `data->>status.eq.pendente,data->>completedAt.gte.2026-01-01`. */
  or?: string
  eq?: [column: string, value: string][]
  neq?: [column: string, value: string][]
  gte?: [column: string, value: string][]
  lt?: [column: string, value: string][]
  in?: [column: string, values: string[]][]
  notIn?: [column: string, values: string[]][]
}

/** Um recorte de uma coleção: tudo, uma janela de datas, um processo, um cliente. */
export interface Scope {
  key: Collection
  /** Identidade do recorte: a mesma leitura não é feita duas vezes. */
  id: string
  filter?: ScopeFilter
  /** Só os N registros mais recentes (por `order`, ou `created_at`). */
  latest?: number
  /** Coluna da ordem decrescente de `latest` (ex.: `data->>completedAt`); vazios por último. */
  order?: string
  /** Com `latest`: quantos pular (página seguinte do histórico). */
  offset?: number
  /** Visão de onde vêm os dados (ex.: `processes_summary`, sem o histórico de movimentações). */
  view?: string
  /**
   * Recorte de um registro (o que um processo ou cliente mostra). A revalidação não lê
   * o recorte de novo: confere pelo id o que ele trouxe; o que surgir depois é recente
   * e entra pelas janelas da abertura ou pelo tempo real.
   */
  entity?: boolean
}

/** Lê id + versão (manifesto) ou a linha inteira de um recorte, já com filtro e ordem. */
function scopedQuery(supabase: SupabaseClient, scope: Scope, columns: string, source: string, count?: "exact") {
  let query = supabase.from(source).select(columns, count ? { count } : undefined)
  const { filter } = scope
  if (filter?.or) query = query.or(filter.or)
  for (const [column, value] of filter?.eq ?? []) query = query.eq(column, value)
  for (const [column, value] of filter?.neq ?? []) query = query.neq(column, value)
  for (const [column, value] of filter?.gte ?? []) query = query.gte(column, value)
  for (const [column, value] of filter?.lt ?? []) query = query.lt(column, value)
  for (const [column, values] of filter?.in ?? []) query = query.in(column, values)
  for (const [column, values] of filter?.notIn ?? []) query = query.not(column, "in", `(${values.map(pgValue).join(",")})`)
  return scope.latest
    ? query.order(scope.order ?? "created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false })
    : query.order("created_at").order("id")
}

type Read<T> = { rows: T[]; total?: number }

async function readScope<T>(supabase: SupabaseClient, scope: Scope, columns: string, source: string, withTotal = false): Promise<Read<T>> {
  const count = withTotal ? ("exact" as const) : undefined
  if (scope.latest) {
    const from = scope.offset ?? 0
    const { data, error, count: total } = await scopedQuery(supabase, scope, columns, source, count).range(from, from + scope.latest - 1)
    if (error) throw error
    return { rows: data as T[], total: total ?? undefined }
  }
  // Primeira página com o total; as demais em paralelo (não uma depois da outra).
  const first = await scopedQuery(supabase, scope, columns, source, "exact").range(0, PAGE - 1)
  if (first.error) throw first.error
  const rows = [...(first.data as T[])]
  const total = first.count ?? rows.length
  if (rows.length < PAGE || total <= PAGE) return { rows, total }
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => scopedQuery(supabase, scope, columns, source).range((i + 1) * PAGE, (i + 2) * PAGE - 1)),
  )
  for (const page of rest) {
    if (page.error) throw page.error
    rows.push(...(page.data as T[]))
  }
  // O que entrar enquanto lê chega pelo tempo real (e pela revalidação ao conectar).
  return { rows: dedupe(rows), total }
}

/** Páginas lidas em paralelo podem repetir um registro se a lista mudou no meio. */
function dedupe<T>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const id = (row as { id?: string }).id
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Linhas de um recorte (com a versão de cada uma). */
export async function loadScope(supabase: SupabaseClient, scope: Scope): Promise<ServerRow[]> {
  return (await readScope<ServerRow>(supabase, scope, "id, data, updated_at", scope.view ?? TABLES[scope.key])).rows
}

/** Uma página de um recorte (`latest` + `offset`), com o total do recorte quando pedido. */
export function loadPage(supabase: SupabaseClient, scope: Scope, withTotal: boolean): Promise<Read<ServerRow>> {
  return readScope<ServerRow>(supabase, scope, "id, data, updated_at", scope.view ?? TABLES[scope.key], withTotal)
}

/** A coleção inteira, direto do banco e sem passar pelo store (ex.: exportar um relatório). */
export async function fetchAll<T extends Entity>(supabase: SupabaseClient, key: Collection): Promise<T[]> {
  return (await readScope<ServerRow<T>>(supabase, { key, id: `${key}:exportar` }, "id, data", TABLES[key])).rows.map((row) => row.data)
}

/** Contagens do histórico (funções `*_history_*` da migração 0017; RLS de quem chama). */
export async function fetchStats<T>(supabase: SupabaseClient, fn: string, args: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Valor seguro dentro de `or`/`in` do PostgREST (vírgula, ponto, parênteses e espaço pedem aspas). */
export function pgValue(value: string): string {
  return /[,.:()"\\\s]/.test(value) ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value
}

/** Ids no máximo por vínculo na busca no banco (acima disso o termo é genérico demais). */
const SEARCH_RELATED_MAX = 50

/**
 * Busca no banco, com a regra da busca da tela (`matches`: sem acento, minúsculas,
 * trecho): a coluna `search` do registro ou o vínculo com clientes/processos cujo
 * nome ou número bate com o termo (esses já estão na memória). `null` se o termo é
 * curto demais para ir ao banco.
 */
export function searchFilter(query: string, related: { column: string; ids: string[] }[] = []): ScopeFilter | null {
  const q = normalize(query.trim()).replace(/[*%]/g, " ").replace(/\s+/g, " ").trim()
  if (q.length < 2) return null
  const parts = [`search.ilike.${pgValue(`*${q}*`)}`]
  for (const { column, ids } of related) {
    if (ids.length) parts.push(`${column}.in.(${ids.slice(0, SEARCH_RELATED_MAX).map(pgValue).join(",")})`)
  }
  return { or: parts.join(",") }
}

/** `YYYY-MM-DD` de `days` dias antes de `now` (horário local, como as datas guardadas). */
export function daysBefore(now: Date, days: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Atividades e notificações mais recentes que a abertura traz (Painel, sino, sinais da semana). */
export const RECENT_ACTIVITIES = 300
export const RECENT_NOTIFICATIONS = 500
/** Compromissos que a abertura traz: a partir desta quantidade de dias atrás (e todos os futuros). */
export const RECENT_APPOINTMENT_DAYS = 45

/**
 * Início das janelas da abertura (`YYYY-MM-DD`). O que é anterior a elas é o
 * histórico, lido em páginas pelas telas (e contado pelas funções `*_history_*`).
 */
export interface WindowBounds {
  /** Tarefas e prazos encerrados, notificações lidas: 30 dias. */
  month: string
  appointments: string
  documents: string
  /** Receita do Painel e do Financeiro: os últimos 6 meses e o ano corrente. */
  finance: string
}

export function windowBounds(now: Date): WindowBounds {
  const sixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  return {
    month: daysBefore(now, 30),
    appointments: daysBefore(now, RECENT_APPOINTMENT_DAYS),
    documents: daysBefore(now, 14),
    finance: daysBefore(sixMonths.getFullYear() < now.getFullYear() ? sixMonths : new Date(now.getFullYear(), 0, 1), 0),
  }
}

/**
 * O que a abertura do Íntegra carrega: só o que a primeira tela e a navegação usam.
 * O histórico (tarefas e prazos encerrados há mais de 30 dias, compromissos antigos,
 * documentos, lançamentos antigos, atividades além das recentes, movimentações dos
 * processos) vem sob demanda, quando a pessoa abre a tela ou o registro.
 */
export function initialScopes(now: Date): Scope[] {
  const { month, documents, appointments, finance: financeFrom } = windowBounds(now)
  return [
    { key: "clients", id: "clients" },
    { key: "processes", id: "processes:resumo", view: "processes_summary" },
    { key: "taskColumns", id: "taskColumns" },
    { key: "appointmentCategories", id: "appointmentCategories" },
    { key: "tasks", id: "tasks:abertas", filter: { or: `data->>status.eq.pendente,data->>completedAt.gte.${month}` } },
    { key: "deadlines", id: "deadlines:abertos", filter: { or: `data->>status.eq.aberto,data->>closedAt.gte.${month}` } },
    { key: "appointments", id: "appointments:recentes", filter: { gte: [["data->>start", appointments]] } },
    { key: "documents", id: "documents:recentes", filter: { gte: [["data->>uploadedAt", documents]] } },
    {
      key: "invoices",
      id: "invoices:abertos",
      filter: { or: `data->>status.in.(pendente,atrasado),data->>dueDate.gte.${financeFrom},data->>paidAt.gte.${financeFrom}` },
    },
    { key: "activities", id: "activities:recentes", latest: RECENT_ACTIVITIES },
    { key: "notifications", id: "notifications:recentes", latest: RECENT_NOTIFICATIONS, filter: { or: `data->>read.eq.false,created_at.gte.${month}` } },
  ]
}

/**
 * O que um processo mostra além do resumo: tarefas, prazos, documentos e compromissos
 * dele. As atividades (que crescem sem limite) vêm em páginas (`activitiesOf`).
 */
export function processScopes(processId: string): Scope[] {
  const byData = (key: Collection): Scope => ({ key, id: `${key}:processo:${processId}`, entity: true, filter: { eq: [["data->>processId", processId]] } })
  return [
    { key: "tasks", id: `tasks:processo:${processId}`, entity: true, filter: { eq: [["data->related->>id", processId]] } },
    { key: "deadlines", id: `deadlines:processo:${processId}`, entity: true, filter: { eq: [["process_id", processId]] } },
    byData("documents"),
    byData("appointments"),
  ]
}

/**
 * O que o perfil do cliente mostra: tarefas (dele e dos processos dele), prazos,
 * documentos, compromissos e lançamentos. As atividades vêm em páginas na timeline
 * (`activitiesOf`); `withActivities` traz todas (exportar a ficha do cliente).
 */
export function clientScopes(clientId: string, processIds: string[], options: { withActivities?: boolean } = {}): Scope[] {
  const byData = (key: Collection): Scope => ({ key, id: `${key}:cliente:${clientId}`, entity: true, filter: { eq: [["data->>clientId", clientId]] } })
  const related = [`data->related->>id.eq.${clientId}`, ...(processIds.length ? [`data->related->>id.in.(${processIds.join(",")})`] : [])]
  return [
    // A chave inclui os processos: um processo novo do cliente pede uma leitura nova.
    { key: "tasks", id: `tasks:cliente:${clientId}:${processIds.join(",")}`, entity: true, filter: { or: related.join(",") } },
    { key: "deadlines", id: `deadlines:cliente:${clientId}`, entity: true, filter: { eq: [["client_id", clientId]] } },
    byData("documents"),
    byData("appointments"),
    byData("invoices"),
    ...(options.withActivities ? [byData("activities")] : []),
  ]
}

/** Compromissos de um intervalo (`[from, to)`, datas `YYYY-MM-DD`) — a Agenda pede o período que mostra. */
export const appointmentsBetween = (from: string, to: string): Scope => ({
  key: "appointments",
  id: `appointments:${from}:${to}`,
  filter: { gte: [["data->>start", from]], lt: [["data->>start", to]] },
})

/** Carrega os recortes e monta o estado (com a versão de cada registro). */
export async function loadScopes(supabase: SupabaseClient, scopes: Scope[]): Promise<Snapshot> {
  const lists = await Promise.all(scopes.map((scope) => loadScope(supabase, scope)))
  const versions = emptyVersions()
  const byKey = new Map<Collection, Map<string, Entity>>(COLLECTIONS.map((key) => [key, new Map()]))
  scopes.forEach((scope, i) => {
    for (const row of lists[i]) {
      versions[scope.key].set(row.id, row.updated_at)
      byKey.get(scope.key)!.set(row.id, row.data)
    }
  })
  const state = {} as Record<Collection, Entity[]>
  for (const key of COLLECTIONS) state[key] = orderCollection(key, [...byKey.get(key)!.values()])
  return { state: state as unknown as PersistedState, versions }
}

/**
 * Só id e versão de um recorte: base da revalidação (volta à aba, reconexão). Lê da
 * tabela (não da visão) com o mesmo filtro — mostra o que mudou sem baixar os dados.
 */
export async function fetchManifest(supabase: SupabaseClient, scope: Scope): Promise<Map<string, string>> {
  const { rows } = await readScope<{ id: string; updated_at: string }>(supabase, scope, "id, updated_at", TABLES[scope.key])
  return new Map(rows.map((row) => [row.id, row.updated_at]))
}

/** Registros específicos, como estão agora no banco (os que não voltam foram excluídos ou não são visíveis). */
export async function fetchRecords(supabase: SupabaseClient, key: Collection, ids: string[], source: string = TABLES[key]): Promise<ServerRow[]> {
  const rows: ServerRow[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from(source)
      .select("id, data, updated_at")
      .in("id", ids.slice(i, i + ID_CHUNK))
    if (error) throw error
    rows.push(...(data as ServerRow[]))
  }
  return rows
}

/** Versão atual de registros específicos (os que não voltam foram excluídos ou deixaram de ser visíveis). */
export async function fetchVersions(supabase: SupabaseClient, key: Collection, ids: string[]): Promise<Map<string, string>> {
  const versions = new Map<string, string>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from(TABLES[key])
      .select("id, updated_at")
      .in("id", ids.slice(i, i + ID_CHUNK))
    if (error) throw error
    for (const row of data as { id: string; updated_at: string }[]) versions.set(row.id, row.updated_at)
  }
  return versions
}

async function fetchRecord(supabase: SupabaseClient, key: Collection, id: string): Promise<ServerRow | null> {
  const { data, error } = await supabase.from(TABLES[key]).select("id, data, updated_at").eq("id", id).maybeSingle()
  if (error) throw error
  return (data as ServerRow | null) ?? null
}

export type WriteError = "denied" | "conflict" | "failed"

const isRlsDenial = (error: { code?: string; message?: string }) => error.code === "42501" || /row-level security/i.test(error.message ?? "")
/** Índice único ou restrição de validação do banco (`0004_clients_hub.sql`). */
const isConstraint = (error: { code?: string }) => error.code === "23505" || error.code === "23514"
export const classify = (error: { code?: string; message?: string }): WriteError =>
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
