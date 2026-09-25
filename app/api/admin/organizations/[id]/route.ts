import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, requireSuperAdmin, route } from "@/lib/auth/server"
import { toOrganization, type OrganizationRow } from "@/lib/auth/profile"

type Context = { params: Promise<{ id: string }> }

const STATUSES = ["pending", "active", "inactive"]
const PLANS = ["Essencial", "Profissional", "Escritório"]

/** Aprovar, ativar/desativar, mudar plano ou nome. Desativar bloqueia todos os usuários do escritório na hora (RLS). */
export const PATCH = route<Context>(async (request, { params }) => {
  await requireSuperAdmin()
  const { id } = await params
  const body = await readJson<{ status?: string; plan?: string; name?: string }>(request)
  const admin = getSupabaseAdmin()

  const { data: current } = await admin.from("organizations").select("*").eq("id", id).maybeSingle<OrganizationRow>()
  if (!current) throw new HttpError(404, "Escritório não encontrado.")

  const update: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, "Status inválido.")
    update.status = body.status
    if (body.status === "active" && !current.approved_at) update.approved_at = new Date().toISOString()
  }
  if (body.plan !== undefined) {
    if (!PLANS.includes(body.plan)) throw new HttpError(400, "Plano inválido.")
    update.plan = body.plan
  }
  if (body.name !== undefined) {
    if (body.name.trim().length < 2) throw new HttpError(400, "Informe o nome do escritório.")
    update.name = body.name.trim()
  }

  const { data, error } = await admin.from("organizations").update(update).eq("id", id).select("*").single<OrganizationRow>()
  if (error) throw error
  return NextResponse.json({ organization: toOrganization(data) })
})
