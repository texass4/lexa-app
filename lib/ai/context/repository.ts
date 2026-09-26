/**
 * Acesso aos dados do escritório para a LEXA IA — somente leitura.
 *
 * Duas travas de isolamento, independentes:
 * 1. o cliente Supabase é o da sessão de quem chamou (`createSupabaseServer`),
 *    então a RLS do banco vale para cada consulta;
 * 2. toda consulta filtra `organization_id` pelo escritório validado na rota.
 *
 * Além disso, cada módulo só é lido com a permissão de visualização
 * correspondente — a IA nunca vê o que a pessoa não veria na tela.
 * O modelo nunca executa consultas: só recebe o que estas funções devolvem.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Permission } from "@/lib/auth/permissions"
import type { Activity, Appointment, Client, Invoice, LegalDocument, Process, ProcessMovement, Task } from "@/types"

/** Processo sem a lista de movimentações (só a mais recente) — para visões de vários processos. */
export type ProcessOverview = Omit<Process, "movements"> & { lastMovement?: ProcessMovement }

export interface Member {
  id: string
  name: string
}

export interface AIRepository {
  readonly organizationId: string
  can(permission: Permission): boolean
  getProcess(id: string): Promise<Process | null>
  getClient(id: string): Promise<Client | null>
  listProcessOverviews(filter?: { clientId?: string }): Promise<ProcessOverview[]>
  listClients(): Promise<Client[]>
  listTasks(): Promise<Task[]>
  listAppointments(): Promise<Appointment[]>
  listDocuments(): Promise<LegalDocument[]>
  listInvoices(): Promise<Invoice[]>
  listActivities(filter?: { clientId?: string }): Promise<Activity[]>
  listMembers(): Promise<Member[]>
}

const PAGE = 1000

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
  "nextDeadline",
  "tribunal",
  "degree",
  "className",
  "subject",
  "judicialUnit",
  "createdAt",
] as const

const OVERVIEW_SELECT = [...OVERVIEW_FIELDS.map((key) => `${key}:data->${key}`), "lastMovement:data->movements->0"].join(",")

type Row = Record<string, unknown>
type Filters = Record<string, string>

export function createSupabaseRepository(
  supabase: SupabaseClient,
  organizationId: string,
  can: (permission: Permission) => boolean,
): AIRepository {
  if (!organizationId) throw new Error("Escritório obrigatório para consultar dados da IA.")

  async function list(table: string, select: string, filters: Filters = {}): Promise<Row[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from(table).select(select).eq("organization_id", organizationId)
      for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
      const { data, error } = await query.order("id").range(from, from + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as unknown as Row[]
      rows.push(...page)
      if (page.length < PAGE) return rows
    }
  }

  async function listData<T>(table: string, filters?: Filters): Promise<T[]> {
    return (await list(table, "data", filters)).map((row) => row.data as T)
  }

  async function getData<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await supabase.from(table).select("data").eq("organization_id", organizationId).eq("id", id).maybeSingle()
    if (error) throw error
    return ((data as Row | null)?.data as T | undefined) ?? null
  }

  return {
    organizationId,
    can,
    getProcess: async (id) => (can("processes.view") ? getData<Process>("processes", id) : null),
    getClient: async (id) => (can("clients.view") ? getData<Client>("clients", id) : null),
    async listProcessOverviews(filter = {}) {
      if (!can("processes.view")) return []
      const rows = await list("processes", OVERVIEW_SELECT, filter.clientId ? { "data->>clientId": filter.clientId } : {})
      return rows.map((row) => ({ ...(row as unknown as ProcessOverview), lastMovement: (row.lastMovement as ProcessMovement | null) ?? undefined }))
    },
    listClients: async () => (can("clients.view") ? listData<Client>("clients") : []),
    listTasks: async () => (can("tasks.view") ? listData<Task>("tasks") : []),
    listAppointments: async () => (can("agenda.view") ? listData<Appointment>("appointments") : []),
    listDocuments: async () => (can("documents.view") ? listData<LegalDocument>("documents") : []),
    listInvoices: async () => (can("finance.view") ? listData<Invoice>("invoices") : []),
    // Atividades: todo membro lê (mesma regra da RLS); filtradas por cliente quando pedido.
    listActivities: async (filter = {}) => listData<Activity>("activities", filter.clientId ? { "data->>clientId": filter.clientId } : undefined),
    async listMembers() {
      const { data, error } = await supabase.from("profiles").select("id,name").eq("organization_id", organizationId)
      if (error) throw error
      return ((data ?? []) as Member[]).map(({ id, name }) => ({ id, name }))
    },
  }
}
