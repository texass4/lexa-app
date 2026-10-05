/**
 * Leituras do painel Admin, com a service role. Só chame depois de `requireAdmin()`.
 *
 * O Super Admin vê a operação (contagens, tamanhos, datas, quem acessou) — nunca o
 * conteúdo jurídico dos escritórios. Por isso as consultas aqui usam agregações
 * (`admin_org_usage`, `admin_activity_series`) e, na atividade do CRM, só o tipo,
 * a data e quem fez.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { BRAND } from "@/lib/core/brand"
import { SYSTEM_ACTOR_ID } from "@/lib/auth/system-actor"
import { toOrganization, type OrganizationRow, type ProfileRow } from "@/lib/auth/profile"
import {
  AUDIT_ACTIONS,
  EMPTY_USAGE,
  effectiveLimits,
  monthlyCents,
  sanitizeFeatures,
  sanitizeLimits,
  usageAlerts,
  type AdminOrganization,
  type AdminPlan,
  type AdminSubscription,
  type AdminUser,
  type AuditEntry,
  type AuditGroup,
  type AuditSeverity,
  type PlanLimits,
  type SeriesPoint,
  type UsageSnapshot,
} from "./catalog"
import { loadSettings } from "./platform"

/* --------------------------------- Planos --------------------------------- */

export interface PlanRow {
  id: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  billing_interval: "month" | "year"
  max_users: number | null
  max_processes: number | null
  max_clients: number | null
  max_storage_mb: number | null
  max_whatsapp_messages: number | null
  max_ai_requests: number | null
  features: string[]
  status: "active" | "inactive"
  sort_order: number
  gateway_product_id: string | null
  gateway_price_id: string | null
  created_at: string
  updated_at: string
}

const planLimits = (row: PlanRow): PlanLimits => ({
  users: row.max_users,
  processes: row.max_processes,
  clients: row.max_clients,
  storage: row.max_storage_mb,
  whatsapp: row.max_whatsapp_messages,
  ai: row.max_ai_requests,
})

export function toPlan(row: PlanRow, organizations = 0): AdminPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    priceCents: row.price_cents,
    currency: row.currency,
    interval: row.billing_interval,
    limits: planLimits(row),
    features: sanitizeFeatures(row.features),
    status: row.status,
    sortOrder: row.sort_order,
    gatewayProductId: row.gateway_product_id ?? undefined,
    gatewayPriceId: row.gateway_price_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    organizations,
  }
}

async function planRows(): Promise<PlanRow[]> {
  const { data, error } = await getSupabaseAdmin().from("plans").select("*").order("sort_order").order("name")
  if (error) throw error
  return data as PlanRow[]
}

export async function loadPlans(): Promise<AdminPlan[]> {
  const admin = getSupabaseAdmin()
  const [rows, { data: orgs }] = await Promise.all([planRows(), admin.from("organizations").select("plan, status")])
  const counts = new Map<string, number>()
  for (const o of (orgs ?? []) as { plan: string; status: string }[]) {
    if (o.status !== "inactive") counts.set(o.plan, (counts.get(o.plan) ?? 0) + 1)
  }
  return rows.map((row) => toPlan(row, counts.get(row.name) ?? 0))
}

/* ------------------------------- Assinaturas ------------------------------ */

export interface SubscriptionRow {
  organization_id: string
  status: AdminSubscription["status"]
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  canceled_at: string | null
  cancel_reason: string | null
  gateway: AdminSubscription["gateway"]
  created_at: string
}

const toSubscription = (row: SubscriptionRow): AdminSubscription => ({
  status: row.status,
  trialEndsAt: row.trial_ends_at ?? undefined,
  currentPeriodStart: row.current_period_start ?? undefined,
  currentPeriodEnd: row.current_period_end ?? undefined,
  canceledAt: row.canceled_at ?? undefined,
  cancelReason: row.cancel_reason ?? undefined,
  gateway: row.gateway,
  createdAt: row.created_at,
})

/* ------------------------------- Escritórios ------------------------------ */

interface UsageRow {
  organization_id: string
  users: number
  active_users: number
  clients: number
  processes: number
  tasks: number
  appointments: number
  documents: number
  invoices: number
  storage_bytes: number
  whatsapp_month: number
  ai_month: number
  last_sign_in_at: string | null
  last_data_at: string | null
}

const toUsage = (row: UsageRow | undefined): UsageSnapshot =>
  row
    ? {
        users: row.users,
        activeUsers: row.active_users,
        clients: row.clients,
        processes: row.processes,
        tasks: row.tasks,
        appointments: row.appointments,
        documents: row.documents,
        invoices: row.invoices,
        storageBytes: Number(row.storage_bytes),
        whatsappMonth: row.whatsapp_month,
        aiMonth: row.ai_month,
        lastSignInAt: row.last_sign_in_at ?? undefined,
        lastDataAt: row.last_data_at ?? undefined,
      }
    : EMPTY_USAGE

const latest = (...dates: (string | undefined)[]) => dates.filter(Boolean).sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0]

type PersonRow = Pick<ProfileRow, "id" | "organization_id" | "role" | "name" | "email" | "active">

/** Todos os escritórios com equipe, uso, limites, alertas e assinatura. */
export async function loadOrganizations(): Promise<AdminOrganization[]> {
  const admin = getSupabaseAdmin()
  const [orgsRes, peopleRes, plans, usageRes, subsRes, settings] = await Promise.all([
    admin.from("organizations").select("*").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, organization_id, role, name, email, active").not("organization_id", "is", null),
    planRows(),
    admin.rpc("admin_org_usage"),
    admin.from("subscriptions").select("*"),
    loadSettings(),
  ])
  if (orgsRes.error) throw orgsRes.error
  if (usageRes.error) console.error("[admin_org_usage]", usageRes.error.message)

  const people = (peopleRes.data ?? []) as PersonRow[]
  const planByName = new Map(plans.map((p) => [p.name, p]))
  const usageByOrg = new Map(((usageRes.data ?? []) as UsageRow[]).map((u) => [u.organization_id, u]))
  const subByOrg = new Map(((subsRes.data ?? []) as SubscriptionRow[]).map((s) => [s.organization_id, s]))
  const warnAt = settings.general.usageWarningPercent / 100

  return (orgsRes.data as OrganizationRow[]).map((row) => {
    const members = people.filter((p) => p.organization_id === row.id)
    const plan = planByName.get(row.plan)
    const customLimits = row.custom_limits ? sanitizeLimits(row.custom_limits) : null
    const limits = effectiveLimits(plan ? planLimits(plan) : undefined, customLimits)
    const usage = toUsage(usageByOrg.get(row.id))
    const sub = subByOrg.get(row.id)
    return {
      ...toOrganization(row),
      statusReason: row.status_reason ?? undefined,
      adminNotes: row.admin_notes ?? undefined,
      customLimits,
      memberCount: members.length,
      activeCount: members.filter((m) => m.active).length,
      owners: members.filter((m) => m.role === "owner").map((m) => ({ id: m.id, name: m.name, email: m.email })),
      usage,
      limits,
      alerts: row.status === "inactive" ? [] : usageAlerts(usage, limits, warnAt),
      subscription: sub ? toSubscription(sub) : null,
      planMonthlyCents: plan ? monthlyCents({ priceCents: plan.price_cents, interval: plan.billing_interval }) : 0,
      lastActivityAt: latest(usage.lastSignInAt, usage.lastDataAt),
    }
  })
}

export async function loadOrganization(id: string) {
  return (await loadOrganizations()).find((o) => o.id === id) ?? null
}

/* --------------------------------- Séries --------------------------------- */

interface SeriesRow extends Omit<SeriesPoint, "day"> {
  day: string
}

export async function loadSeries(from: Date, to: Date, organizationId?: string): Promise<SeriesPoint[]> {
  const { data, error } = await getSupabaseAdmin().rpc("admin_activity_series", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_org: organizationId ?? null,
  })
  if (error) {
    console.error("[admin_activity_series]", error.message)
    return []
  }
  return (data as SeriesRow[]).map((r) => ({ ...r, day: String(r.day).slice(0, 10) }))
}

/* -------------------------------- Auditoria ------------------------------- */

interface AuditRow {
  id: number
  created_at: string
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  actor_role: string | null
  organization_id: string | null
  action: string
  severity: AuditSeverity
  target_type: string | null
  target_id: string | null
  target_label: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
}

export interface AuditQuery {
  from?: Date
  to?: Date
  organizationId?: string
  actorId?: string
  group?: AuditGroup
  severity?: AuditSeverity
  search?: string
  limit?: number
  offset?: number
}

/** Remove o que tem significado na sintaxe de filtro do PostgREST. */
const safeTerm = (q: string) =>
  q
    .replace(/[,()*%\\:"']/g, " ")
    .trim()
    .slice(0, 80)

export async function loadAudit(query: AuditQuery = {}): Promise<{ entries: AuditEntry[]; total: number }> {
  const admin = getSupabaseAdmin()
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const offset = Math.max(query.offset ?? 0, 0)
  let q = admin
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (query.from) q = q.gte("created_at", query.from.toISOString())
  if (query.to) q = q.lt("created_at", query.to.toISOString())
  if (query.organizationId) q = q.eq("organization_id", query.organizationId)
  if (query.actorId) q = q.eq("actor_id", query.actorId)
  if (query.severity) q = q.eq("severity", query.severity)
  if (query.group) {
    const actions = Object.entries(AUDIT_ACTIONS)
      .filter(([, meta]) => meta.group === query.group)
      .map(([action]) => action)
    q = q.in("action", actions)
  }
  const term = query.search ? safeTerm(query.search) : ""
  if (term) q = q.or(`summary.ilike.*${term}*,actor_email.ilike.*${term}*,actor_name.ilike.*${term}*,target_label.ilike.*${term}*,ip.ilike.*${term}*`)

  const [{ data, error, count }, { data: orgs }] = await Promise.all([q, admin.from("organizations").select("id, name")])
  if (error) {
    console.error("[audit_logs]", error.message)
    return { entries: [], total: 0 }
  }
  const names = new Map(((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]))
  const entries = (data as AuditRow[]).map((r) => ({
    id: String(r.id),
    at: r.created_at,
    actorId: r.actor_id ?? undefined,
    actorName: r.actor_name ?? undefined,
    actorEmail: r.actor_email ?? undefined,
    actorRole: r.actor_role ?? undefined,
    organizationId: r.organization_id ?? undefined,
    organizationName: r.organization_id ? (names.get(r.organization_id) ?? "Escritório removido") : undefined,
    action: r.action,
    severity: r.severity,
    targetType: r.target_type ?? undefined,
    targetId: r.target_id ?? undefined,
    targetLabel: r.target_label ?? undefined,
    summary: r.summary ?? undefined,
    metadata: r.metadata ?? {},
    ip: r.ip ?? undefined,
    userAgent: r.user_agent ?? undefined,
  }))
  return { entries, total: count ?? entries.length }
}

/* --------------------------------- Usuários ------------------------------- */

interface AccessRow {
  id: string
  last_sign_in_at: string | null
}

/** Todos os usuários dos escritórios (o Super Admin fica de fora), com último acesso. */
export async function loadUsers(): Promise<AdminUser[]> {
  const admin = getSupabaseAdmin()
  const [profilesRes, orgsRes, accessRes] = await Promise.all([
    admin.from("profiles").select("*").not("organization_id", "is", null).order("name"),
    admin.from("organizations").select("id, name, status"),
    admin.rpc("admin_user_access"),
  ])
  if (profilesRes.error) throw profilesRes.error
  if (accessRes.error) console.error("[admin_user_access]", accessRes.error.message)
  const orgs = new Map(((orgsRes.data ?? []) as { id: string; name: string; status: AdminUser["organizationStatus"] }[]).map((o) => [o.id, o]))
  const access = new Map(((accessRes.data ?? []) as AccessRow[]).map((a) => [a.id, a.last_sign_in_at]))

  return (profilesRes.data as ProfileRow[]).map((p) => {
    const org = orgs.get(p.organization_id!)
    const lastSignInAt = access.get(p.id) ?? undefined
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      jobTitle: p.job_title ?? undefined,
      avatarUrl: p.avatar_url ?? undefined,
      active: p.active,
      permissions: p.permissions,
      organizationId: p.organization_id!,
      organizationName: org?.name ?? "—",
      organizationStatus: org?.status ?? "inactive",
      createdAt: p.created_at,
      lastSignInAt,
      invitePending: !lastSignInAt,
    }
  })
}

/* ---------------------------- Atividade do CRM ---------------------------- */

/**
 * Últimas ações registradas pelo escritório no CRM — só tipo, data e autor.
 * A mensagem (que cita clientes e processos) não sai do banco.
 */
export async function loadCrmActivity(organizationId: string, limit = 25) {
  const admin = getSupabaseAdmin()
  const [{ data }, { data: people }] = await Promise.all([
    admin
      .from("activities")
      .select("id, created_at, type:data->>type, actor:data->>actorUserId")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin.from("profiles").select("id, name").eq("organization_id", organizationId),
  ])
  const names = new Map(((people ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))
  // Registros do monitoramento automático não têm pessoa por trás.
  names.set(SYSTEM_ACTOR_ID, BRAND.name)
  return ((data ?? []) as unknown as { id: string; created_at: string; type: string | null; actor: string | null }[]).map((a) => ({
    id: a.id,
    at: a.created_at,
    type: a.type ?? "other",
    actorName: a.actor ? names.get(a.actor) : undefined,
  }))
}
