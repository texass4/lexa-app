import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { inviteMember } from "@/lib/auth/members"
import { toOrganization, type OrganizationRow } from "@/lib/auth/profile"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"
import { loadOrganizations, loadPlans } from "@/lib/admin/data"
import { assertAssignablePlan, resolveDefaultPlan } from "@/lib/admin/plans"
import { loadSettings } from "@/lib/admin/platform"

/** Todos os escritórios, com equipe, uso, limites, alertas e assinatura; e o catálogo de planos. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const [organizations, plans] = await Promise.all([loadOrganizations(), loadPlans()])
  return NextResponse.json({ organizations, plans })
})

interface Body {
  name?: string
  cnpj?: string
  email?: string
  plan?: string
  ownerName?: string
  ownerEmail?: string
  /** true = assinante direto; false = começa em teste (padrão). */
  skipTrial?: boolean
}

/** Cria um escritório já ativo e convida o Sócio/Proprietário. */
export const POST = route(async (request) => {
  const { profile } = await requireAdmin(request)
  const body = await readJson<Body>(request)
  const name = body.name?.trim() ?? ""
  if (name.length < 2) throw new HttpError(400, "Informe o nome do escritório.")
  const plan = body.plan ? await assertAssignablePlan(body.plan) : await resolveDefaultPlan((await loadSettings()).general.defaultPlan)

  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name, cnpj: body.cnpj?.trim() || null, email: body.email?.trim() || null, plan, status: "active", approved_at: now })
    .select("*")
    .single<OrganizationRow>()
  if (error) throw error

  try {
    await inviteMember(request, org.id, { name: body.ownerName, email: body.ownerEmail, role: "owner" })
  } catch (inviteError) {
    await admin.from("organizations").delete().eq("id", org.id)
    throw inviteError
  }

  // A assinatura nasce em teste (trigger do banco); "sem teste" já vira assinante.
  if (body.skipTrial) {
    await admin.from("subscriptions").update({ status: "active", trial_ends_at: null, current_period_start: now }).eq("organization_id", org.id)
  }

  await recordAudit(request, {
    action: "organization.created",
    actor: profile,
    organizationId: org.id,
    target: { type: "organization", id: org.id, label: org.name },
    summary: `Escritório ${org.name} criado no plano ${plan}; convite enviado para ${body.ownerEmail}`,
    metadata: { plan, skipTrial: !!body.skipTrial },
  })
  return NextResponse.json({ organization: toOrganization(org) }, { status: 201 })
})
