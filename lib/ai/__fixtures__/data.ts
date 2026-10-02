/**
 * Dados de teste da Íntegra IA: dois escritórios no mesmo "banco", um Supabase
 * falso que aplica os filtros de verdade (sem RLS — para provar que o
 * repositório isola sozinho) e um provedor de IA falso que registra o que recebeu.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseRepository } from "../context/repository"
import { MemoryAICache } from "../guard"
import { reservationError, type AICallContext, type AICallOutcome, type AIMeter } from "../metering"
import type { AIProvider, AIRequest } from "../provider"
import type { JsonSchema } from "../schema"
import type { AIServiceDeps } from "../services/run"
import { ROLE_DEFAULTS, type Permission } from "@/lib/auth/permissions"
import type { Activity, Appointment, Client, Invoice, LegalDocument, Process, Task } from "@/types"

export const ORG_A = "org-a"
const ORG_B = "org-b"
export const NOW = new Date("2026-09-26T10:00:00")

const base = (organizationId: string, id: string) => ({ id, organizationId, createdAt: "2026-01-10T09:00:00" })

const clientA: Client = {
  ...base(ORG_A, "c_a1"),
  name: "Maria Aparecida Souza",
  kind: "PF",
  document: "123.456.789-09",
  email: "maria@example.com",
  phone: "(98) 99999-0000",
  address: "Rua das Flores, 10",
  area: "Previdenciário",
  ownerId: "u_a1",
  status: "ativo",
  clientSince: "2025-03-01",
  lastActivityAt: "2026-09-20T10:00:00",
}

export const processA: Process = {
  ...base(ORG_A, "p_a1"),
  number: "0801234-56.2024.8.10.0001",
  code: "PA-1",
  clientId: clientA.id,
  area: "Previdenciário",
  type: "Procedimento Comum Cível",
  court: "1ª Vara Cível",
  district: "São Luís",
  opposingParty: "INSS",
  status: "em_andamento",
  ownerId: "u_a1",
  claimValue: 45000,
  distributedAt: "2024-02-15",
  lastMovementAt: "2026-09-24T14:03:00",
  tribunal: "TJMA",
  className: "Procedimento Comum Cível",
  subject: "Aposentadoria por idade",
  judicialUnit: "1ª Vara Cível de São Luís",
  source: { provider: "datajud", sourceStatus: "Em tramitação" },
  movements: [
    {
      id: "m_a3",
      at: "2026-09-24T14:03:00",
      title: "Remessa",
      code: 123,
      complements: [{ code: 18, key: "motivo_da_remessa", value: 40, name: "outros motivos" }],
      judicialUnit: { name: "1ª Vara Cível de São Luís" },
      origin: "datajud",
      hash: "hash-secreto",
      raw: { token: "nao-deve-sair", codigo: 123 },
    },
    {
      id: "m_a2",
      at: "2026-09-10T09:00:00",
      title: "Juntada de Petição",
      complements: [{ key: "tipo_de_peticao", name: "Contestação" }],
      origin: "datajud",
    },
    { id: "m_a1", at: "2024-02-15T08:00:00", title: "Distribuição", origin: "datajud" },
  ],
}

const taskA: Task = {
  ...base(ORG_A, "t_a1"),
  title: "Conferir documentos do cliente",
  dueAt: "2026-09-20T18:00:00",
  priority: "alta",
  assigneeId: "u_a1",
  status: "pendente",
  related: { type: "process", id: processA.id },
}

const appointmentA: Appointment = {
  ...base(ORG_A, "a_a1"),
  title: "Reunião com a cliente",
  start: "2026-09-29T10:00:00",
  end: "2026-09-29T11:00:00",
  ownerId: "u_a1",
  clientId: clientA.id,
  processId: processA.id,
}

const documentA: LegalDocument = {
  ...base(ORG_A, "d_a1"),
  name: "Procuração.pdf",
  kind: "Procuração",
  extension: "pdf",
  sizeBytes: 1000,
  clientId: clientA.id,
  processId: processA.id,
  uploadedById: "u_a1",
  uploadedAt: "2026-08-01T10:00:00",
  storagePath: "org-a/d_a1",
}

const invoiceA: Invoice = {
  ...base(ORG_A, "i_a1"),
  clientId: clientA.id,
  processId: processA.id,
  description: "Honorários iniciais",
  amount: 3000,
  dueDate: "2026-09-01",
  status: "atrasado",
}

/* ----------------------------- escritório B ------------------------------ */

export const SECRET_B = "Cliente Secreto do Escritório B"

const clientB: Client = { ...clientA, ...base(ORG_B, "c_b1"), name: SECRET_B, email: "segredo@b.com" }
export const processB: Process = {
  ...processA,
  ...base(ORG_B, "p_b1"),
  number: "9999999-99.2024.8.10.0001",
  clientId: clientB.id,
  opposingParty: "Parte sigilosa B",
  movements: [{ id: "m_b1", at: "2026-09-25T10:00:00", title: "Sentença sigilosa B" }],
}
const taskB: Task = { ...taskA, ...base(ORG_B, "t_b1"), title: "Tarefa sigilosa B", related: { type: "process", id: processB.id } }

/* ---------------------------- Supabase falso ----------------------------- */

/** Atividades do cliente A: uma financeira (com valor) e uma de cadastro. */
export const paymentActivityA: Activity = {
  ...base(ORG_A, "act_pay_a1"),
  type: "payment",
  at: "2026-09-20T10:00:00",
  actor: "Ana Advogada",
  message: "registrou um pagamento recebido.",
  detail: "Honorários iniciais · R$ 3.000,00 · pago em 20/09/2026",
  clientId: clientA.id,
}
const clientActivityA: Activity = {
  ...base(ORG_A, "act_cli_a1"),
  type: "client",
  at: "2026-09-19T10:00:00",
  actor: "Ana Advogada",
  message: "atualizou o cadastro do cliente.",
  clientId: clientA.id,
}

type Row = { organization_id: string; id: string; data: Record<string, unknown> }

const row = (entity: { id: string; organizationId: string }): Row => ({ organization_id: entity.organizationId, id: entity.id, data: entity })

export function seedTables(): Record<string, Row[]> {
  return {
    clients: [row(clientA), row(clientB)],
    processes: [row(processA), row(processB)],
    tasks: [row(taskA), row(taskB)],
    appointments: [row(appointmentA)],
    documents: [row(documentA)],
    invoices: [row(invoiceA)],
    activities: [row(paymentActivityA), row(clientActivityA)],
    profiles: [
      { organization_id: ORG_A, id: "u_a1", data: {}, name: "Ana Advogada" } as Row & { name: string },
      { organization_id: ORG_B, id: "u_b1", data: {}, name: "Bruno do Escritório B" } as Row & { name: string },
    ],
  }
}

function resolvePath(target: Row, path: string): unknown {
  const [column, ...rest] = path.split(/->>?/)
  let value: unknown = (target as Record<string, unknown>)[column]
  for (const key of rest) value = value == null ? undefined : (value as Record<string, unknown>)[key]
  return value
}

function project(target: Row, select: string) {
  const result: Record<string, unknown> = {}
  for (const part of select.split(",")) {
    const [alias, path] = part.includes(":") ? part.split(":") : [part.split(/->>?/).pop()!, part]
    result[alias] = resolvePath(target, path) ?? null
  }
  return result
}

type Condition = (row: Row) => boolean

const unquote = (value: string) => (value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\(.)/g, "$1") : value)

/** Divide por vírgulas fora de parênteses e aspas. */
function splitTop(text: string) {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let current = ""
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === "(") depth++
    if (!quoted && ch === ")") depth--
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(current)
      current = ""
    } else current += ch
  }
  if (current) parts.push(current)
  return parts
}

function compare(row: Row, column: string, op: string, raw: string | string[]) {
  const value = resolvePath(row, column)
  const text = value === undefined || value === null ? undefined : String(value)
  switch (op) {
    case "eq":
      return text === raw
    case "neq":
      return text !== raw
    case "gte":
      return text !== undefined && text >= (raw as string)
    case "gt":
      return text !== undefined && text > (raw as string)
    case "lt":
      return text !== undefined && text < (raw as string)
    case "lte":
      return text !== undefined && text <= (raw as string)
    case "in":
      return text !== undefined && (raw as string[]).includes(text)
    default:
      throw new Error(`operador não suportado no teste: ${op}`)
  }
}

/** Filtro `or(...)`/`and(...)` do PostgREST (o subconjunto que o repositório usa). */
function parseLogic(expression: string, all: boolean): Condition {
  const conditions = splitTop(expression).map((part): Condition => {
    const nested = part.match(/^(and|or)\((.*)\)$/)
    if (nested) return parseLogic(nested[2], nested[1] === "and")
    const match = part.match(/^(.+?)\.(eq|neq|gte|gt|lte|lt|in)\.(.*)$/)
    if (!match) throw new Error(`filtro não suportado no teste: ${part}`)
    const [, column, op, raw] = match
    const value = op === "in" ? splitTop(raw.slice(1, -1)).map(unquote) : unquote(raw)
    return (row) => compare(row, column, op, value)
  })
  return (row) => (all ? conditions.every((c) => c(row)) : conditions.some((c) => c(row)))
}

/** Aplica filtros, ordem, limite, contagem e `select` com caminhos JSON — o bastante para o repositório da IA. */
export function fakeSupabase(tables: Record<string, Row[]> = seedTables()) {
  const writes: string[] = []
  const queries: { table: string; filters: [string, string][]; head: boolean; limit?: number }[] = []

  const client = {
    from(table: string) {
      const filters: [string, string][] = []
      const conditions: Condition[] = []
      let select = "*"
      let head = false
      let range: [number, number] | undefined
      let order: { column: string; ascending: boolean } | undefined
      const query = { table, filters, head, limit: undefined as number | undefined }
      queries.push(query)
      const run = () => {
        let rows = (tables[table] ?? []).filter((r) => conditions.every((c) => c(r)))
        if (order) {
          const { column, ascending } = order
          rows = [...rows].sort(
            (a, b) => String(resolvePath(a, column) ?? "").localeCompare(String(resolvePath(b, column) ?? "")) * (ascending ? 1 : -1),
          )
        }
        if (range) rows = rows.slice(range[0], range[1] + 1)
        if (query.limit !== undefined) rows = rows.slice(0, query.limit)
        return rows
      }
      const result = () => {
        const rows = run()
        return head ? { data: null, count: rows.length, error: null } : { data: rows.map((r) => project(r, select)), count: null, error: null }
      }
      const add = (column: string, op: string, value: string | string[]) => {
        filters.push([column, Array.isArray(value) ? value.join(",") : value])
        conditions.push((row) => compare(row, column, op, value))
        return builder
      }
      const builder = {
        select(value: string, options?: { head?: boolean }) {
          select = value
          head = !!options?.head
          query.head = head
          return builder
        },
        eq: (column: string, value: string) => add(column, "eq", value),
        neq: (column: string, value: string) => add(column, "neq", value),
        gte: (column: string, value: string) => add(column, "gte", value),
        gt: (column: string, value: string) => add(column, "gt", value),
        lt: (column: string, value: string) => add(column, "lt", value),
        in: (column: string, values: string[]) => add(column, "in", values),
        or(expression: string) {
          filters.push(["or", expression])
          conditions.push(parseLogic(expression, false))
          return builder
        },
        order(column: string, options?: { ascending?: boolean }) {
          order = { column, ascending: options?.ascending ?? true }
          return builder
        },
        limit(n: number) {
          query.limit = n
          return builder
        },
        range(from: number, to: number) {
          range = [from, to]
          return Promise.resolve(result())
        },
        maybeSingle() {
          return Promise.resolve({ data: result().data?.[0] ?? null, error: null })
        },
        then(resolve: (value: ReturnType<typeof result>) => unknown) {
          return Promise.resolve(result()).then(resolve)
        },
        insert: () => writes.push(`insert:${table}`),
        upsert: () => writes.push(`upsert:${table}`),
        update: () => writes.push(`update:${table}`),
        delete: () => writes.push(`delete:${table}`),
      }
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, writes, queries }
}

/* ------------------------------ provedor falso ---------------------------- */

export type Respond = (request: AIRequest & { schema?: JsonSchema }) => unknown

export function fakeProvider(respond: Respond) {
  const calls: (AIRequest & { schema?: JsonSchema })[] = []
  const provider: AIProvider = {
    name: "fake",
    model: "fake-flash",
    modelFor: (tier) => (tier === "light" ? "fake-flash-lite" : "fake-flash"),
    async generateJSON(request) {
      calls.push(request)
      return {
        value: await respond(request),
        usage: { inputTokens: 10, outputTokens: 5, model: request.tier === "light" ? "fake-flash-lite" : "fake-flash" },
      }
    },
    async generateText(request) {
      calls.push(request)
      return { value: String(await respond(request)) }
    },
  }
  return { provider, calls }
}

/**
 * Medição em memória com as mesmas regras do banco (`ai_reserve`): limite do mês e
 * ritmo por pessoa. Só para testes — em produção quem conta é o banco.
 */
export function memoryMeter({ monthlyLimit = null as number | null, perUserMinute = 8 } = {}) {
  const events: { context: AICallContext; status: "pendente" | "ok" | "erro" | "cache"; model: string; outcome?: AICallOutcome }[] = []
  const meter: AIMeter = {
    async reserve(context, _provider, model) {
      const counted = events.filter(
        (e) => e.context.organizationId === context.organizationId && (e.status === "ok" || e.status === "pendente"),
      ).length
      if (monthlyLimit !== null && counted >= monthlyLimit) throw reservationError({ reason: "plano", retryAfterSeconds: 3600, monthlyLimit })
      const mine = events.filter((e) => e.context.userId && e.context.userId === context.userId && e.status !== "cache").length
      if (context.userId && mine >= perUserMinute) throw reservationError({ reason: "pessoa", retryAfterSeconds: 30, monthlyLimit })
      events.push({ context, status: "pendente", model })
      return { eventId: events.length - 1 }
    },
    async finish({ eventId }, _context, _provider, outcome) {
      if (eventId === null) return
      Object.assign(events[eventId], { status: outcome.ok ? "ok" : "erro", outcome })
    },
    async cacheHit(context, _provider, model) {
      events.push({ context, status: "cache", model })
    },
  }
  return { meter, events }
}

export function makeDeps(
  respond: Respond,
  {
    organizationId = ORG_A,
    permissions = ROLE_DEFAULTS.owner as readonly Permission[],
    meter = memoryMeter(),
  }: { organizationId?: string; permissions?: readonly Permission[]; meter?: ReturnType<typeof memoryMeter> } = {},
) {
  const db = fakeSupabase()
  const repo = createSupabaseRepository(db.supabase, organizationId, (p) => permissions.includes(p))
  const { provider, calls } = fakeProvider(respond)
  const deps: AIServiceDeps = {
    repo,
    provider,
    userId: "u_a1",
    now: NOW,
    meter: meter.meter,
    cache: new MemoryAICache(),
    cacheKey: (parts) => parts.join("|"),
    log: () => {},
  }
  return { deps, calls, db, usage: meter.events }
}

/** Todo o texto enviado ao modelo numa chamada. */
export const promptText = (request: AIRequest) => [request.system, ...request.messages.map((m) => m.content)].join("\n")

export const validSummary = {
  resumo: "Trata-se de ação previdenciária de aposentadoria por idade contra o INSS.",
  situacao: "A movimentação mais recente registrada foi uma remessa em 24/09/2026.",
  fatos_relevantes: ["Contestação juntada em 10/09/2026."],
  movimentacoes_relevantes: [
    { ref: "M1", comentario: "Remessa por outros motivos." },
    { ref: "M99", comentario: "Movimentação que não existe." },
  ],
  pontos_atencao: [{ texto: "Tarefa atrasada.", natureza: "fato", refs: ["T1", "X7"] }],
  proximas_acoes: ["Pode ser relevante verificar o destino da remessa."],
  informacoes_ausentes: ["Destino da remessa."],
  nivel_confianca: "Médio",
}
