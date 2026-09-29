/** GET /api/admin/ai-usage?from&to — consumo de IA por escritório no período (Super Admin). */

import { NextResponse } from "next/server"
import { HttpError, route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { summarizeAIUsage, type AIUsageRow } from "@/lib/admin/ai-usage"

export const dynamic = "force-dynamic"

const MAX_DAYS = 400

export const GET = route(async (request) => {
  await requireAdmin(request)
  const p = request.nextUrl.searchParams
  const parse = (key: string, fallback: Date) => {
    const v = p.get(key)
    const d = v ? new Date(v) : fallback
    if (Number.isNaN(d.getTime())) throw new HttpError(400, "Período inválido.")
    return d
  }
  const to = parse("to", new Date())
  const from = parse("from", new Date(to.getTime() - 30 * 86_400_000))
  if (from >= to || to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) throw new HttpError(400, "Período inválido.")

  const admin = getSupabaseAdmin()
  const [usage, orgs] = await Promise.all([
    admin.rpc("admin_ai_usage", { p_from: from.toISOString(), p_to: to.toISOString() }),
    admin.from("organizations").select("id, name, plan"),
  ])
  if (usage.error) {
    // Sem a migração 0013 não há medição detalhada.
    if (usage.error.code === "PGRST202" || usage.error.code === "42883") {
      return NextResponse.json({ unavailable: true, from: from.toISOString(), to: to.toISOString(), organizations: [], totals: null })
    }
    throw usage.error
  }
  if (orgs.error) throw orgs.error
  const names = new Map(((orgs.data ?? []) as { id: string; name: string; plan: string }[]).map((o) => [o.id, { name: o.name, plan: o.plan }]))
  return NextResponse.json(summarizeAIUsage((usage.data ?? []) as AIUsageRow[], names, { from: from.toISOString(), to: to.toISOString() }))
})
