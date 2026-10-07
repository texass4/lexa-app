/**
 * Acesso aos dados do escritório para a Íntegra IA — somente leitura.
 *
 * Duas travas de isolamento, independentes:
 * 1. o cliente Supabase é o da sessão de quem chamou (`createSupabaseServer`),
 *    então a RLS do banco vale para cada consulta;
 * 2. toda consulta filtra `organization_id` pelo escritório validado na rota.
 *
 * Além disso, cada módulo só é lido com a permissão de visualização
 * correspondente — a IA nunca vê o que a pessoa não veria na tela.
 * O modelo nunca executa consultas: só recebe o que estas funções devolvem.
 *
 * Cada consulta já vem recortada do banco (processo, cliente, período, situação,
 * quantidade) — nada de ler uma tabela inteira e filtrar depois. Números do
 * panorama saem de contagens (`count`), não dos registros.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Permission } from "@/lib/auth/permissions"
import { FINANCIAL_ACTIVITY_TYPES, visibleActivities } from "@/lib/financeiro/access"
import type { Activity, Appointment, Client, Invoice, LegalDocument, Prazo, Process, ProcessMovement, Task } from "@/types"
import { DECISION_COLUMNS, isUuid, jurisprudenceRepository, toDecision, type DecisionRow } from "@/lib/services/jurisprudence/store"
import type { JurisprudenceDecision, JurisprudenceFilters } from "@/lib/services/jurisprudence/types"

/** Processo sem a lista de movimentações (só a mais recente) — para visões de vários processos. */
export type ProcessOverview = Omit<Process, "movements"> & { lastMovement?: ProcessMovement }

export interface Member {
  id: string
  name: string
}

/** Recortes pedidos ao banco — cada contexto busca só o que usa. */
export interface TaskFilter {
  /** Tarefas ligadas a este processo. */
  processId?: string
  /** Tarefas ligadas a este cliente ou a um dos processos dele (`processIds`). */
  clientId?: string
  processIds?: string[]
  /** Só pendentes (o panorama não usa as concluídas). */
  pendingOnly?: boolean
}

export interface PrazoFilter {
  processId?: string
  processIds?: string[]
  openOnly?: boolean
}

export interface RelatedFilter {
  processId?: string
  /** Do cliente ou de um dos processos dele (`processIds`). */
  clientId?: string
  processIds?: string[]
}

export interface AIRepository {
  readonly organizationId: string
  can(permission: Permission): boolean
  getProcess(id: string): Promise<Process | null>
  getClient(id: string): Promise<Client | null>
  /** Processos sem o histórico de movimentações (só a mais recente). */
  listProcessOverviews(filter?: { clientId?: string }): Promise<ProcessOverview[]>
  /** Números de clientes para o panorama (contagens no banco, sem ler os cadastros). */
  countClients(): Promise<{ total: number; active: number; delinquent: number } | null>
  /** Só o nome dos clientes pedidos. */
  clientNames(ids: string[]): Promise<Map<string, string>>
  listTasks(filter?: TaskFilter): Promise<Task[]>
  /** Prazos (módulo de processos): de um processo, de vários, ou só os abertos. */
  listPrazos(filter?: PrazoFilter): Promise<Prazo[]>
  /** Compromissos ligados ao recorte, só os que terminam depois de `endsAfter` e começam antes de `startsBefore`. */
  listAppointments(filter?: RelatedFilter & { endsAfter?: string; startsBefore?: string }): Promise<Appointment[]>
  /** Os documentos mais recentes do recorte. */
  listDocuments(filter: RelatedFilter & { limit: number }): Promise<LegalDocument[]>
  /** Contagem de documentos (todos e os enviados desde `since`), sem ler os registros. */
  countDocuments(since: string): Promise<{ total: number; addedSince: number } | null>
  /** Faturas do cliente, ou (sem cliente) as em aberto e as com vencimento/pagamento desde `relevantSince`. */
  listInvoices(filter: { clientId?: string; relevantSince?: string }): Promise<Invoice[]>
  /** As atividades mais recentes do cliente. */
  listActivities(filter: { clientId: string; limit: number }): Promise<Activity[]>
  listMembers(): Promise<Member[]>
  /** Decisões da base de jurisprudência (pública), pelo id. Exige `processes.view`. */
  getJurisprudence(ids: string[]): Promise<JurisprudenceDecision[]>
  /** Pesquisa na base indexada (a mesma da tela); devolve as decisões completas e o total. */
  searchJurisprudence(text: string, filters: JurisprudenceFilters, limit: number): Promise<{ decisions: JurisprudenceDecision[]; total: number }>
  /** Decisões vinculadas a um processo do escritório (RLS). */
  linkedJurisprudence(processId: string): Promise<JurisprudenceDecision[]>
  /** As decisões salvas pelo escritório mais recentemente (RLS). */
  savedJurisprudence(limit: number): Promise<JurisprudenceDecision[]>
}

const PAGE = 1000
/** Listas de ids enviadas numa consulta (acima disso, em partes). */
const IN_CHUNK = 150

/** Campos do processo lidos em listas: tudo menos o histórico completo de movimentações. */
const OVERVIEW_FIELDS = [
  "id",
  "number",
  "code",
  "clientId",
  "area",
  "type",
  "court",
  "district",
  "opposingParty",
  "status",
  "ownerId",
  "claimValue",
  "distributedAt",
  "lastMovementAt",
  "tribunal",
  "degree",
  "className",
  "subject",
  "judicialUnit",
  "createdAt",
] as const

const OVERVIEW_SELECT = [...OVERVIEW_FIELDS.map((key) => `${key}:data->${key}`), "lastMovement:data->movements->0"].join(",")

type Row = Record<string, unknown>
// O construtor de consultas do Supabase é genérico demais para tipar aqui sem ruído.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any
type Refine = (query: Query) => Query

/** Valor seguro dentro de `in.(…)` / `or(…)` do PostgREST. */
const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
const inList = (values: string[]) => `(${values.map(quote).join(",")})`
const chunks = <T>(items: T[], size = IN_CHUNK) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

/** `ligado ao cliente OU a um dos processos` — num filtro só do banco. */
function relatedTo(query: Query, filter: RelatedFilter, paths: { client: string; process: string }): Query {
  if (filter.processId) return query.eq(paths.process, filter.processId)
  if (filter.clientId) {
    const ids = (filter.processIds ?? []).slice(0, IN_CHUNK)
    return query.or([`${paths.client}.eq.${quote(filter.clientId)}`, ...(ids.length ? [`${paths.process}.in.${inList(ids)}`] : [])].join(","))
  }
  return query
}

export function createSupabaseRepository(supabase: SupabaseClient, organizationId: string, can: (permission: Permission) => boolean): AIRepository {
  if (!organizationId) throw new Error("Escritório obrigatório para consultar dados da IA.")

  const base = (table: string, select: string, options?: { count: "exact"; head: true }) =>
    supabase.from(table).select(select, options).eq("organization_id", organizationId)

  /** Todas as linhas do recorte (em páginas). Só para recortes já filtrados no banco. */
  async function list(table: string, select: string, refine: Refine = (q) => q): Promise<Row[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await refine(base(table, select))
        .order("id")
        .range(from, from + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as Row[]
      rows.push(...page)
      if (page.length < PAGE) return rows
    }
  }

  /** As primeiras `limit` linhas do recorte, na ordem pedida. */
  async function top(table: string, select: string, refine: Refine, order: string, limit: number): Promise<Row[]> {
    const { data, error } = await refine(base(table, select)).order(order, { ascending: false }).limit(limit)
    if (error) throw error
    return (data ?? []) as Row[]
  }

  async function count(table: string, refine: Refine = (q) => q): Promise<number | null> {
    const { count: total, error } = await refine(base(table, "id", { count: "exact", head: true }))
    return error ? null : (total ?? 0)
  }

  const dataOf = <T>(rows: Row[]) => rows.map((row) => row.data as T)

  async function getData<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await base(table, "data").eq("id", id).maybeSingle()
    if (error) throw error
    return ((data as Row | null)?.data as T | undefined) ?? null
  }

  /** Decisões da base pública pelo id, na ordem pedida (a RLS confere que é membro ativo). */
  async function loadDecisions(ids: string[]): Promise<JurisprudenceDecision[]> {
    const valid = [...new Set(ids.filter(isUuid))].slice(0, 20)
    if (!can("processes.view") || !valid.length) return []
    // Base pública: sem filtro de escritório.
    const { data, error } = await supabase.from("jurisprudence").select(DECISION_COLUMNS).in("id", valid)
    if (error) throw error
    const byId = new Map(((data ?? []) as unknown as DecisionRow[]).map((row) => [row.id, toDecision(row)]))
    return valid.map((id) => byId.get(id)).filter((d): d is JurisprudenceDecision => !!d)
  }

  return {
    organizationId,
    can,
    getProcess: async (id) => (can("processes.view") ? getData<Process>("processes", id) : null),
    getClient: async (id) => (can("clients.view") ? getData<Client>("clients", id) : null),

    async listProcessOverviews(filter = {}) {
      if (!can("processes.view")) return []
      const rows = await list("processes", OVERVIEW_SELECT, (q) => (filter.clientId ? q.eq("data->>clientId", filter.clientId) : q))
      return rows.map((row) => ({ ...(row as unknown as ProcessOverview), lastMovement: (row.lastMovement as ProcessMovement | null) ?? undefined }))
    },

    async countClients() {
      if (!can("clients.view")) return null
      const [total, active, delinquent] = await Promise.all([
        count("clients"),
        count("clients", (q) => q.in("data->>status", ["ativo", "novo"])),
        count("clients", (q) => q.eq("data->>status", "inadimplente")),
      ])
      return total === null || active === null || delinquent === null ? null : { total, active, delinquent }
    },

    async clientNames(ids) {
      const names = new Map<string, string>()
      const unique = [...new Set(ids.filter(Boolean))]
      if (!can("clients.view") || !unique.length) return names
      for (const part of chunks(unique)) {
        for (const row of await list("clients", "id,name:data->>name", (q) => q.in("id", part))) names.set(String(row.id), String(row.name ?? ""))
      }
      return names
    },

    async listTasks(filter = {}) {
      if (!can("tasks.view")) return []
      return dataOf<Task>(
        await list("tasks", "data", (q) => {
          let query = q
          if (filter.pendingOnly) query = query.eq("data->>status", "pendente")
          if (filter.processId) return query.eq("data->related->>type", "process").eq("data->related->>id", filter.processId)
          if (filter.clientId) {
            const ids = (filter.processIds ?? []).slice(0, IN_CHUNK)
            return query.or(
              [
                `and(data->related->>type.eq.client,data->related->>id.eq.${quote(filter.clientId)})`,
                ...(ids.length ? [`and(data->related->>type.eq.process,data->related->>id.in.${inList(ids)})`] : []),
              ].join(","),
            )
          }
          return query
        }),
      )
    },

    async listPrazos(filter = {}) {
      if (!can("processes.view")) return []
      if (filter.processIds && !filter.processIds.length) return []
      const refine = (ids?: string[]) => (q: Query) => {
        let query = q
        if (filter.openOnly) query = query.eq("data->>status", "aberto")
        if (filter.processId) query = query.eq("process_id", filter.processId)
        if (ids) query = query.in("process_id", ids)
        return query
      }
      if (!filter.processIds) return dataOf<Prazo>(await list("deadlines", "data", refine()))
      const rows: Row[] = []
      for (const part of chunks(filter.processIds)) rows.push(...(await list("deadlines", "data", refine(part))))
      return dataOf<Prazo>(rows)
    },

    async listAppointments(filter = {}) {
      if (!can("agenda.view")) return []
      return dataOf<Appointment>(
        await list("appointments", "data", (q) => {
          let query = relatedTo(q, filter, { client: "data->>clientId", process: "data->>processId" })
          if (filter.endsAfter) query = query.gte("data->>end", filter.endsAfter)
          if (filter.startsBefore) query = query.lt("data->>start", filter.startsBefore)
          return query
        }),
      )
    },

    async listDocuments(filter) {
      if (!can("documents.view")) return []
      const refine = (q: Query) => relatedTo(q, filter, { client: "data->>clientId", process: "data->>processId" })
      return dataOf<LegalDocument>(await top("documents", "data", refine, "data->>uploadedAt", filter.limit))
    },

    async countDocuments(since) {
      if (!can("documents.view")) return null
      const [total, addedSince] = await Promise.all([count("documents"), count("documents", (q) => q.gte("data->>uploadedAt", since))])
      return total === null || addedSince === null ? null : { total, addedSince }
    },

    async listInvoices(filter) {
      if (!can("finance.view")) return []
      return dataOf<Invoice>(
        await list("invoices", "data", (q) => {
          if (filter.clientId) return q.eq("data->>clientId", filter.clientId)
          if (filter.relevantSince) {
            const since = quote(filter.relevantSince)
            return q.or(`data->>status.neq.pago,data->>dueDate.gte.${since},data->>paidAt.gte.${since}`)
          }
          return q
        }),
      )
    },

    // Atividades: todo membro lê, menos as financeiras sem `finance.view` (mesma regra da RLS, 0014).
    async listActivities(filter) {
      const canViewFinance = can("finance.view")
      const refine = (q: Query) => {
        let query = q.eq("data->>clientId", filter.clientId)
        if (!canViewFinance) for (const type of FINANCIAL_ACTIVITY_TYPES) query = query.neq("data->>type", type)
        return query
      }
      return visibleActivities(dataOf<Activity>(await top("activities", "data", refine, "created_at", filter.limit)), canViewFinance)
    },

    async listMembers() {
      const { data, error } = await supabase.from("profiles").select("id,name").eq("organization_id", organizationId)
      if (error) throw error
      return ((data ?? []) as Member[]).map(({ id, name }) => ({ id, name }))
    },

    getJurisprudence: loadDecisions,

    async searchJurisprudence(text, filters, limit) {
      if (!can("processes.view")) return { decisions: [], total: 0 }
      const { rows, total } = await jurisprudenceRepository(supabase).search({ text, filters, sort: "relevance", limit, offset: 0 })
      const decisions = await loadDecisions(rows.map((row) => row.id))
      return { decisions, total }
    },

    async linkedJurisprudence(processId) {
      if (!can("processes.view")) return []
      const { data, error } = await supabase.from("process_jurisprudence").select("jurisprudence_id").eq("process_id", processId).limit(10)
      if (error) return [] // sem a migração 0019: sem vínculos
      return loadDecisions(((data ?? []) as { jurisprudence_id: string }[]).map((row) => row.jurisprudence_id))
    },

    async savedJurisprudence(limit) {
      if (!can("processes.view")) return []
      const { data, error } = await supabase.from("saved_jurisprudence").select("jurisprudence_id").order("created_at", { ascending: false }).limit(limit)
      if (error) return []
      return loadDecisions(((data ?? []) as { jurisprudence_id: string }[]).map((row) => row.jurisprudence_id))
    },
  }
}
