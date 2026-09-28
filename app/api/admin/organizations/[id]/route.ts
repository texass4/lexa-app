import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { listMembers } from "@/lib/auth/members"
import { toOrganization, type OrganizationRow } from "@/lib/auth/profile"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"
import { loadAudit, loadCrmActivity, loadOrganization, loadPlans, loadSeries } from "@/lib/admin/data"
import { assertAssignablePlan } from "@/lib/admin/plans"
import { ORG_STATUS, ORG_STATUSES, SUBSCRIPTION_STATUS, sanitizeLimits, type OrgStatus, type SubscriptionStatus } from "@/lib/admin/catalog"

type Context = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Visão completa de um escritório: dados, uso, equipe, auditoria e atividade (sem conteúdo jurídico). */
export const GET = route<Context>(async (request, { params }) => {
  await requireAdmin(request)
  const { id } = await params
  if (!UUID.test(id)) throw new HttpError(404, "Escritório não encontrado.")
  const organization = await loadOrganization(id)
  if (!organization) throw new HttpError(404, "Escritório não encontrado.")
  const now = new Date()
  const [plans, members, audit, activity, series] = await Promise.all([
    loadPlans(),
    listMembers(id),
    loadAudit({ organizationId: id, limit: 40 }),
    loadCrmActivity(id),
    loadSeries(new Date(now.getTime() - 29 * 86_400_000), now, id),
  ])
  return NextResponse.json({
    organization,
    plan: plans.find((p) => p.name === organization.plan) ?? null,
    plans,
    members,
    audit: audit.entries,
    activity,
    series,
  })
})

interface Body {
  status?: string
  statusReason?: string | null
  plan?: string
  name?: string
  legalName?: string | null
  cnpj?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  address?: string | null
  adminNotes?: string | null
  /** null = volta aos limites do plano. */
  customLimits?: Record<string, unknown> | null
  subscription?: { status?: string; trialEndsAt?: string | null; cancelReason?: string | null }
}

const text = (v: string | null | undefined, max = 200) => (v === null || v === undefined ? null : v.trim().slice(0, max) || null)

/**
 * Aprovar, ativar, suspender, desativar, trocar plano, editar dados, limites e
 * assinatura. Suspender/desativar bloqueia todos os usuários do escritório na hora (RLS).
 */
export const PATCH = route<Context>(async (request, { params }) => {
  const { profile } = await requireAdmin(request)
  const { id } = await params
  if (!UUID.test(id)) throw new HttpError(404, "Escritório não encontrado.")
  const body = await readJson<Body>(request)
  const admin = getSupabaseAdmin()

  const { data: current } = await admin.from("organizations").select("*").eq("id", id).maybeSingle<OrganizationRow>()
  if (!current) throw new HttpError(404, "Escritório não encontrado.")

  const update: Record<string, unknown> = {}
  const audits: Parameters<typeof recordAudit>[1][] = []
  const target = { type: "organization", id, label: current.name }

  // Status
  if (body.status !== undefined && body.status !== current.status) {
    if (!ORG_STATUSES.includes(body.status as OrgStatus)) throw new HttpError(400, "Status inválido.")
    const next = body.status as OrgStatus
    update.status = next
    update.status_reason = text(body.statusReason, 500)
    if (next === "active" && !current.approved_at) update.approved_at = new Date().toISOString()
    audits.push({
      action: "organization.status_changed",
      severity: next === "suspended" || next === "inactive" ? "critical" : "warning",
      summary: `${current.name}: ${ORG_STATUS[current.status].label} → ${ORG_STATUS[next].label}${update.status_reason ? ` (${update.status_reason})` : ""}`,
      metadata: { from: current.status, to: next, reason: update.status_reason },
    })
  }

  // Plano
  if (body.plan !== undefined && body.plan !== current.plan) {
    update.plan = await assertAssignablePlan(body.plan)
    const { data: prices } = await admin.from("plans").select("name, price_cents, billing_interval").in("name", [current.plan, body.plan])
    const monthly = (name: string) => {
      const p = (prices ?? []).find((x) => x.name === name) as { price_cents: number; billing_interval: string } | undefined
      return p ? (p.billing_interval === "year" ? Math.round(p.price_cents / 12) : p.price_cents) : 0
    }
    const fromCents = monthly(current.plan)
    const toCents = monthly(body.plan)
    audits.push({
      action: "organization.plan_changed",
      severity: "warning",
      summary: `${current.name}: plano ${current.plan} → ${body.plan}`,
      metadata: { from: current.plan, to: body.plan, fromCents, toCents, direction: toCents > fromCents ? "upgrade" : toCents < fromCents ? "downgrade" : "lateral" },
    })
  }

  // Dados cadastrais
  const fields: [keyof Body, string, number][] = [
    ["legalName", "legal_name", 200],
    ["cnpj", "cnpj", 20],
    ["email", "email", 160],
    ["phone", "phone", 30],
    ["city", "city", 100],
    ["address", "address", 300],
  ]
  const changedFields: string[] = []
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (name.length < 2) throw new HttpError(400, "Informe o nome do escritório.")
    if (name !== current.name) {
      update.name = name
      changedFields.push("name")
    }
  }
  for (const [key, column, max] of fields) {
    if (body[key] === undefined) continue
    const value = text(body[key] as string | null, max)
    if (value !== (current as unknown as Record<string, unknown>)[column]) {
      update[column] = value
      changedFields.push(column)
    }
  }
  if (body.adminNotes !== undefined && text(body.adminNotes, 2000) !== (current.admin_notes ?? null)) {
    update.admin_notes = text(body.adminNotes, 2000)
    changedFields.push("admin_notes")
  }
  if (changedFields.length) {
    audits.push({ action: "organization.updated", summary: `Dados de ${current.name} alterados`, metadata: { fields: changedFields } })
  }

  // Limites personalizados
  if (body.customLimits !== undefined) {
    const limits = body.customLimits === null ? null : sanitizeLimits(body.customLimits)
    update.custom_limits = limits && Object.keys(limits).length ? limits : null
    audits.push({
      action: "organization.limits_changed",
      severity: "warning",
      summary: update.custom_limits ? `Limites personalizados definidos para ${current.name}` : `${current.name} voltou aos limites do plano`,
      metadata: { from: current.custom_limits ?? null, to: update.custom_limits },
    })
  }

  let organization = current
  if (Object.keys(update).length) {
    const { data, error } = await admin.from("organizations").update(update).eq("id", id).select("*").single<OrganizationRow>()
    if (error) throw error
    organization = data
  }

  // Assinatura (e o reflexo do status do escritório nela)
  const subPatch: Record<string, unknown> = {}
  if (body.subscription) {
    const { status, trialEndsAt, cancelReason } = body.subscription
    if (status !== undefined) {
      if (!(status in SUBSCRIPTION_STATUS)) throw new HttpError(400, "Status de assinatura inválido.")
      subPatch.status = status
      if (status === "canceled") subPatch.canceled_at = new Date().toISOString()
      if (status === "active") {
        subPatch.canceled_at = null
        subPatch.current_period_start = new Date().toISOString()
      }
    }
    if (trialEndsAt !== undefined) {
      const date = trialEndsAt ? new Date(trialEndsAt) : null
      if (date && Number.isNaN(date.getTime())) throw new HttpError(400, "Data de fim do teste inválida.")
      subPatch.trial_ends_at = date?.toISOString() ?? null
    }
    if (cancelReason !== undefined) subPatch.cancel_reason = text(cancelReason, 500)
  } else if (update.status === "inactive") {
    subPatch.status = "canceled"
    subPatch.canceled_at = new Date().toISOString()
    subPatch.cancel_reason = update.status_reason ?? "Escritório desativado"
  }
  if (Object.keys(subPatch).length) {
    const { error } = await admin.from("subscriptions").upsert({ organization_id: id, ...subPatch }, { onConflict: "organization_id" })
    if (error) throw error
    if (body.subscription) {
      audits.push({
        action: "subscription.updated",
        severity: subPatch.status === "canceled" ? "warning" : "info",
        summary: `Assinatura de ${current.name}${subPatch.status ? `: ${SUBSCRIPTION_STATUS[subPatch.status as SubscriptionStatus].label}` : " alterada"}`,
        metadata: subPatch,
      })
    }
  }

  for (const entry of audits) await recordAudit(request, { ...entry, actor: profile, organizationId: id, target })
  return NextResponse.json({ organization: toOrganization(organization) })
})
