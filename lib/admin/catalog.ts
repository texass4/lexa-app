/**
 * Painel Admin — contratos e regras puras, compartilhados por servidor e navegador.
 * Nada aqui importa código de servidor; os dados chegam pelas rotas `/api/admin/*`.
 */

import type { Tone } from "@/lib/config"
import type { Organization } from "@/types"
import type { MemberAccess } from "@/lib/auth/profile"

/* --------------------------------- Status --------------------------------- */

export type OrgStatus = Organization["status"]

export const ORG_STATUSES: OrgStatus[] = ["pending", "active", "suspended", "inactive"]

export const ORG_STATUS: Record<OrgStatus, { label: string; tone: Tone; description: string }> = {
  pending: { label: "Aguardando aprovação", tone: "warning", description: "Cadastro recebido; ninguém entra até a aprovação." },
  active: { label: "Ativo", tone: "success", description: "Equipe com acesso normal à Íntegra." },
  suspended: { label: "Suspenso", tone: "danger", description: "Acesso bloqueado temporariamente (ex.: pagamento). Os dados ficam guardados." },
  inactive: { label: "Inativo", tone: "neutral", description: "Acesso encerrado. Os dados ficam guardados e o escritório pode ser reativado." },
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled"

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  trialing: { label: "Em teste", tone: "info" },
  active: { label: "Assinante", tone: "success" },
  past_due: { label: "Inadimplente", tone: "danger" },
  canceled: { label: "Cancelada", tone: "neutral" },
}

export type Gateway = "manual" | "stripe" | "mercadopago" | "other"

export interface AdminSubscription {
  status: SubscriptionStatus
  trialEndsAt?: string
  currentPeriodStart?: string
  currentPeriodEnd?: string
  canceledAt?: string
  cancelReason?: string
  gateway: Gateway
  createdAt: string
}

/* --------------------------------- Limites -------------------------------- */

export const LIMIT_KEYS = ["users", "processes", "clients", "storage", "whatsapp", "ai"] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/** null = sem limite. Armazenamento em MB; WhatsApp e IA por mês. */
export type PlanLimits = Record<LimitKey, number | null>

export const LIMIT_META: Record<LimitKey, { label: string; short: string; unit: string; column: string; monthly?: boolean }> = {
  users: { label: "Usuários", short: "Usuários", unit: "", column: "max_users" },
  processes: { label: "Processos", short: "Processos", unit: "", column: "max_processes" },
  clients: { label: "Clientes", short: "Clientes", unit: "", column: "max_clients" },
  storage: { label: "Armazenamento", short: "Armaz.", unit: "MB", column: "max_storage_mb" },
  whatsapp: { label: "Mensagens WhatsApp", short: "WhatsApp", unit: "/mês", column: "max_whatsapp_messages", monthly: true },
  ai: { label: "Uso de IA", short: "IA", unit: "/mês", column: "max_ai_requests", monthly: true },
}

export const UNLIMITED: PlanLimits = { users: null, processes: null, clients: null, storage: null, whatsapp: null, ai: null }

/** Limites efetivos: os do plano, sobrepostos pelos personalizados do escritório. */
export function effectiveLimits(plan: PlanLimits | undefined, custom?: Partial<PlanLimits> | null): PlanLimits {
  const base = plan ?? UNLIMITED
  const out = { ...base }
  if (custom) {
    for (const key of LIMIT_KEYS) {
      if (key in custom) {
        const v = custom[key]
        out[key] = v === null || v === undefined ? null : Math.max(0, Math.floor(Number(v)))
      }
    }
  }
  return out
}

/** Aceita só chaves conhecidas e números ≥ 0 (ou null). Entrada de formulário ou do banco. */
export function sanitizeLimits(input: unknown): Partial<PlanLimits> {
  const out: Partial<PlanLimits> = {}
  if (!input || typeof input !== "object") return out
  for (const key of LIMIT_KEYS) {
    if (!(key in input)) continue
    const v = (input as Record<string, unknown>)[key]
    if (v === null || v === "") out[key] = null
    else if (typeof v === "number" || typeof v === "string") {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) out[key] = Math.floor(n)
    }
  }
  return out
}

/* ----------------------------------- Uso ---------------------------------- */

export interface UsageSnapshot {
  users: number
  activeUsers: number
  clients: number
  processes: number
  tasks: number
  appointments: number
  documents: number
  invoices: number
  storageBytes: number
  whatsappMonth: number
  aiMonth: number
  lastSignInAt?: string
  lastDataAt?: string
}

export const EMPTY_USAGE: UsageSnapshot = {
  users: 0,
  activeUsers: 0,
  clients: 0,
  processes: 0,
  tasks: 0,
  appointments: 0,
  documents: 0,
  invoices: 0,
  storageBytes: 0,
  whatsappMonth: 0,
  aiMonth: 0,
}

const MB = 1024 * 1024

/** Valor comparável ao limite (armazenamento em MB). */
export function usageValue(usage: UsageSnapshot, key: LimitKey): number {
  switch (key) {
    case "users":
      return usage.users
    case "processes":
      return usage.processes
    case "clients":
      return usage.clients
    case "storage":
      return usage.storageBytes / MB
    case "whatsapp":
      return usage.whatsappMonth
    case "ai":
      return usage.aiMonth
  }
}

export type UsageLevel = "unlimited" | "ok" | "warning" | "critical" | "exceeded"

/** `warnAt` em fração (0.8 = 80%). Crítico a partir de 95%; acima de 100% é excedido. */
export function usageLevel(used: number, limit: number | null, warnAt = 0.8): UsageLevel {
  if (limit === null) return "unlimited"
  if (limit === 0) return used > 0 ? "exceeded" : "critical"
  const ratio = used / limit
  if (ratio > 1) return "exceeded"
  if (ratio >= 0.95) return "critical"
  if (ratio >= warnAt) return "warning"
  return "ok"
}

export const USAGE_LEVEL: Record<Exclude<UsageLevel, "unlimited">, { label: string; tone: Tone; bar: string }> = {
  ok: { label: "Normal", tone: "success", bar: "bg-foreground/80" },
  warning: { label: "Próximo do limite", tone: "warning", bar: "bg-warning" },
  critical: { label: "No limite", tone: "danger", bar: "bg-danger" },
  exceeded: { label: "Limite excedido", tone: "danger", bar: "bg-danger" },
}

export interface UsageAlert {
  key: LimitKey
  used: number
  limit: number
  ratio: number
  level: Exclude<UsageLevel, "unlimited" | "ok">
}

/** Recursos em alerta, do mais crítico para o menos. */
export function usageAlerts(usage: UsageSnapshot, limits: PlanLimits, warnAt = 0.8): UsageAlert[] {
  const alerts: UsageAlert[] = []
  for (const key of LIMIT_KEYS) {
    const limit = limits[key]
    const used = usageValue(usage, key)
    const level = usageLevel(used, limit, warnAt)
    if (limit === null || level === "ok" || level === "unlimited") continue
    alerts.push({ key, used, limit, ratio: limit === 0 ? 1 : used / limit, level })
  }
  return alerts.sort((a, b) => b.ratio - a.ratio)
}

/* -------------------------------- Formatação ------------------------------ */

/** 7,4 GB · 512 MB · 18 KB */
export function formatBytes(bytes: number) {
  if (!bytes) return "0 MB"
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / MB
  if (mb < 1024) return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`
  return `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`
}

/** Um valor de limite ou uso, na unidade do recurso. */
export function formatLimitValue(key: LimitKey, value: number | null) {
  if (value === null) return "Ilimitado"
  if (key === "storage") return formatBytes(value * MB)
  return Math.round(value).toLocaleString("pt-BR")
}

const brlCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** R$ 1.290,00 */
export function formatCents(cents: number) {
  return brlCents.format(cents / 100).replace(/ /g, " ")
}

/** R$ 12,9 mil · R$ 890 */
export function formatCentsCompact(cents: number) {
  const value = cents / 100
  if (value >= 1000) return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
}

export function formatCount(n: number) {
  return n.toLocaleString("pt-BR")
}

/* ---------------------------------- Planos -------------------------------- */

export const PLAN_FEATURES = [
  { key: "clients", label: "Clientes" },
  { key: "processes", label: "Processos" },
  { key: "tasks", label: "Tarefas" },
  { key: "agenda", label: "Agenda" },
  { key: "documents", label: "Documentos" },
  { key: "finance", label: "Financeiro" },
  { key: "datajud", label: "Consulta DataJud" },
  { key: "custom_permissions", label: "Permissões personalizadas" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "ai", label: "Assistente de IA" },
  { key: "priority_support", label: "Suporte prioritário" },
] as const

export type PlanFeature = (typeof PLAN_FEATURES)[number]["key"]

const FEATURE_KEYS = new Set<string>(PLAN_FEATURES.map((f) => f.key))
export const sanitizeFeatures = (list: unknown): PlanFeature[] =>
  Array.isArray(list) ? (PLAN_FEATURES.map((f) => f.key).filter((k) => list.includes(k) && FEATURE_KEYS.has(k)) as PlanFeature[]) : []

export interface AdminPlan {
  id: string
  name: string
  description: string
  priceCents: number
  currency: string
  interval: "month" | "year"
  limits: PlanLimits
  features: PlanFeature[]
  status: "active" | "inactive"
  sortOrder: number
  gatewayProductId?: string
  gatewayPriceId?: string
  createdAt: string
  updatedAt: string
  /** Escritórios usando o plano (não cancelados). */
  organizations: number
}

/** Receita mensal equivalente (plano anual dividido por 12). */
export const monthlyCents = (plan: Pick<AdminPlan, "priceCents" | "interval">) =>
  plan.interval === "year" ? Math.round(plan.priceCents / 12) : plan.priceCents

/* ------------------------------- Escritórios ------------------------------ */

export interface AdminOrganization extends Organization {
  statusReason?: string
  adminNotes?: string
  customLimits: Partial<PlanLimits> | null
  memberCount: number
  activeCount: number
  owners: { id: string; name: string; email: string }[]
  usage: UsageSnapshot
  limits: PlanLimits
  alerts: UsageAlert[]
  subscription: AdminSubscription | null
  /** Receita mensal equivalente do plano atual (0 se não definido). */
  planMonthlyCents: number
  lastActivityAt?: string
}

export interface OrganizationDetail {
  organization: AdminOrganization
  plan: AdminPlan | null
  members: MemberAccess[]
  audit: AuditEntry[]
  activity: { id: string; at: string; type: string; actorName?: string }[]
  series: SeriesPoint[]
}

/* ---------------------------------- Usuários ------------------------------ */

export interface AdminUser {
  id: string
  name: string
  email: string
  role: MemberAccess["role"]
  jobTitle?: string
  avatarUrl?: string
  active: boolean
  permissions?: string[] | null
  organizationId: string
  organizationName: string
  organizationStatus: OrgStatus
  createdAt: string
  lastSignInAt?: string
  invitePending: boolean
}

/* --------------------------------- Auditoria ------------------------------ */

export type AuditSeverity = "info" | "warning" | "critical"

export interface AuditEntry {
  id: string
  at: string
  actorId?: string
  actorName?: string
  actorEmail?: string
  actorRole?: string
  organizationId?: string
  organizationName?: string
  action: string
  severity: AuditSeverity
  targetType?: string
  targetId?: string
  targetLabel?: string
  summary?: string
  metadata: Record<string, unknown>
  ip?: string
  userAgent?: string
}

/** Grupos de ação para filtro e ícone. */
export type AuditGroup = "auth" | "organization" | "user" | "plan" | "settings" | "billing"

export const AUDIT_ACTIONS: Record<string, { label: string; group: AuditGroup }> = {
  "auth.login": { label: "Entrou no sistema", group: "auth" },
  "auth.logout": { label: "Saiu do sistema", group: "auth" },
  "organization.created": { label: "Escritório criado", group: "organization" },
  "organization.signup": { label: "Cadastro público de escritório", group: "organization" },
  "organization.updated": { label: "Dados do escritório alterados", group: "organization" },
  "organization.status_changed": { label: "Status do escritório alterado", group: "organization" },
  "organization.plan_changed": { label: "Plano alterado", group: "plan" },
  "organization.limits_changed": { label: "Limites personalizados alterados", group: "plan" },
  "subscription.updated": { label: "Assinatura alterada", group: "billing" },
  "user.invited": { label: "Usuário convidado", group: "user" },
  "user.updated": { label: "Usuário alterado", group: "user" },
  "user.role_changed": { label: "Papel alterado", group: "user" },
  "user.permissions_changed": { label: "Permissões alteradas", group: "user" },
  "user.status_changed": { label: "Usuário ativado/desativado", group: "user" },
  "user.moved": { label: "Usuário movido de escritório", group: "user" },
  "user.removed": { label: "Usuário removido", group: "user" },
  "user.access_reset": { label: "Link de acesso enviado", group: "user" },
  "plan.created": { label: "Plano criado", group: "plan" },
  "plan.updated": { label: "Plano alterado", group: "plan" },
  "plan.status_changed": { label: "Plano ativado/desativado", group: "plan" },
  "settings.updated": { label: "Configurações alteradas", group: "settings" },
  "settings.maintenance": { label: "Modo manutenção alterado", group: "settings" },
}

export const AUDIT_GROUPS: Record<AuditGroup, string> = {
  auth: "Acesso",
  organization: "Escritórios",
  user: "Usuários",
  plan: "Planos",
  billing: "Assinaturas",
  settings: "Configurações",
}

export const auditLabel = (action: string) => AUDIT_ACTIONS[action]?.label ?? action

export const AUDIT_SEVERITY: Record<AuditSeverity, { label: string; tone: Tone }> = {
  info: { label: "Informativo", tone: "neutral" },
  warning: { label: "Atenção", tone: "warning" },
  critical: { label: "Crítico", tone: "danger" },
}

/* --------------------------- Dashboard e alertas -------------------------- */

export type AttentionKind = "pending" | "limit" | "trial_ending" | "past_due" | "suspended" | "unpriced"

/** Um ponto que pede ação do Admin: informação → contexto → link. */
export interface AttentionItem {
  kind: AttentionKind
  tone: Tone
  title: string
  detail: string
  href: string
  count: number
}

export interface OverviewData {
  range: { from: string; to: string }
  kpis: {
    organizations: { active: number; trial: number; pending: number; suspended: number; inactive: number; total: number }
    newOrganizations: { current: number; previous: number }
    users: { total: number; active: number; signedInPeriod: number; newCurrent: number; newPrevious: number }
    totals: {
      clients: number
      processes: number
      tasks: number
      documents: number
      appointments: number
      storageBytes: number
      whatsappMonth: number
      aiMonth: number
    }
    mrrCents: number
    payingOrganizations: number
    unpricedPlans: number
  }
  series: (SeriesPoint & { totalOrganizations: number; totalUsers: number })[]
  planDistribution: { plan: string; count: number; monthlyCents: number }[]
  attention: AttentionItem[]
  topUsage: { id: string; name: string; plan: string; key: LimitKey; ratio: number; used: number; limit: number }[]
  recent: AuditEntry[]
  maintenance: boolean
}

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "canceled"

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "neutral" },
  paid: { label: "Pago", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  refunded: { label: "Estornado", tone: "violet" },
  canceled: { label: "Cancelado", tone: "neutral" },
}

export interface FinanceData {
  range: { from: string; to: string }
  gateway: { connected: boolean; provider: string | null }
  mrrCents: number
  arrCents: number
  arpaCents: number
  counts: { paying: number; trialing: number; pastDue: number; canceled: number; canceledInPeriod: number }
  pastDueCents: number
  potentialCents: number
  revenueByPlan: { plan: string; organizations: number; mrrCents: number }[]
  monthly: { month: string; label: string; paidCents: number; pendingCents: number }[]
  subscriptions: {
    organizationId: string
    organizationName: string
    organizationStatus: OrgStatus
    plan: string
    monthlyCents: number
    status: SubscriptionStatus
    trialEndsAt?: string
    since: string
    canceledAt?: string
    cancelReason?: string
    gateway: Gateway
  }[]
  payments: {
    id: string
    organizationId: string
    organizationName: string
    amountCents: number
    status: PaymentStatus
    description?: string
    dueDate?: string
    paidAt?: string
    createdAt: string
    overdue: boolean
  }[]
  paymentTotals: { paidPeriodCents: number; pendingCents: number; overdueCents: number; failed: number }
  changes: { upgrades: number; downgrades: number; entries: AuditEntry[] }
}

export interface AdminNotification {
  id: string
  tone: Tone
  title: string
  detail: string
  href: string
  at?: string
}

/* ------------------------------ Séries e período -------------------------- */

export interface SeriesPoint {
  day: string
  organizations: number
  users: number
  clients: number
  processes: number
  tasks: number
  documents: number
  appointments: number
  logins: number
}

export type PeriodKey = "today" | "7d" | "30d" | "90d" | "custom"

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
]

const DAY = 86_400_000
const MAX_RANGE_DAYS = 366

/**
 * Intervalo [from, to) de um período. `custom` usa datas AAAA-MM-DD (inclusive).
 * Intervalos inválidos ou maiores que um ano caem para 30 dias.
 */
export function resolvePeriod(key: string | null | undefined, now: Date, custom?: { from?: string | null; to?: string | null }) {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const days = (n: number) => ({ from: new Date(startOfToday.getTime() - (n - 1) * DAY), to: now })
  if (key === "today") return { key: "today" as PeriodKey, ...days(1) }
  if (key === "7d") return { key: "7d" as PeriodKey, ...days(7) }
  if (key === "90d") return { key: "90d" as PeriodKey, ...days(90) }
  if (key === "custom" && custom?.from && custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) && /^\d{4}-\d{2}-\d{2}$/.test(custom.to)) {
    const from = new Date(`${custom.from}T00:00:00`)
    const to = new Date(new Date(`${custom.to}T00:00:00`).getTime() + DAY)
    const span = (to.getTime() - from.getTime()) / DAY
    if (!Number.isNaN(span) && span >= 1 && span <= MAX_RANGE_DAYS) return { key: "custom" as PeriodKey, from, to: to > now ? now : to }
  }
  return { key: "30d" as PeriodKey, ...days(30) }
}

/**
 * Intervalo vindo da URL (`from`/`to` em ISO, calculados no fuso do navegador).
 * Inválido, invertido ou maior que um ano → últimos 30 dias.
 */
export function parseRange(fromIso: string | null, toIso: string | null, now: Date) {
  const from = fromIso ? new Date(fromIso) : null
  const to = toIso ? new Date(toIso) : null
  if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
    const span = (to.getTime() - from.getTime()) / DAY
    if (span > 0 && span <= MAX_RANGE_DAYS + 1) return { from, to }
  }
  return { from: new Date(now.getTime() - 30 * DAY), to: now }
}

/** Variação percentual entre dois períodos (null quando não há base). */
export function growth(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous
}
