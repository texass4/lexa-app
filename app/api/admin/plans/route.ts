import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"
import { loadPlans, toPlan, type PlanRow } from "@/lib/admin/data"
import { loadSettings } from "@/lib/admin/platform"
import { isUniqueViolation, planColumns, type PlanBody } from "./input"

export const GET = route(async (request) => {
  await requireAdmin(request)
  const [plans, settings] = await Promise.all([loadPlans(), loadSettings()])
  return NextResponse.json({ plans, defaultLimits: settings.defaultLimits, defaultPlan: settings.general.defaultPlan })
})

export const POST = route(async (request) => {
  const { profile } = await requireAdmin(request)
  const columns = planColumns(await readJson<PlanBody>(request), false)
  const { data, error } = await getSupabaseAdmin().from("plans").insert(columns).select("*").single<PlanRow>()
  if (isUniqueViolation(error)) throw new HttpError(409, "Já existe um plano com esse nome.")
  if (error) throw error
  await recordAudit(request, {
    action: "plan.created",
    actor: profile,
    target: { type: "plan", id: data.id, label: data.name },
    summary: `Plano ${data.name} criado`,
    metadata: { priceCents: data.price_cents },
  })
  return NextResponse.json({ plan: toPlan(data) }, { status: 201 })
})
