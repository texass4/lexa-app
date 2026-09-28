import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/admin/guard"
import { loadAudit } from "@/lib/admin/data"
import { loadSettings } from "@/lib/admin/platform"
import { AUDIT_GROUPS, type AuditGroup, type AuditSeverity } from "@/lib/admin/catalog"

const UUID = /^[0-9a-f-]{36}$/i

/** Registros de auditoria com filtros e paginação. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const p = request.nextUrl.searchParams
  const date = (key: string) => {
    const v = p.get(key)
    const d = v ? new Date(v) : null
    return d && !Number.isNaN(d.getTime()) ? d : undefined
  }
  const group = p.get("group")
  const severity = p.get("severity")
  const org = p.get("org")
  const actor = p.get("actor")
  const result = await loadAudit({
    from: date("from"),
    to: date("to"),
    organizationId: org && UUID.test(org) ? org : undefined,
    actorId: actor && UUID.test(actor) ? actor : undefined,
    group: group && group in AUDIT_GROUPS ? (group as AuditGroup) : undefined,
    severity: severity === "info" || severity === "warning" || severity === "critical" ? (severity as AuditSeverity) : undefined,
    search: p.get("q") ?? undefined,
    limit: Number(p.get("limit")) || 50,
    offset: Number(p.get("offset")) || 0,
  })
  const admin = getSupabaseAdmin()
  // Retenção: apaga o que passou do prazo configurado (índice por data; barato).
  const { admin: adminSettings } = await loadSettings()
  const cutoff = new Date(Date.now() - adminSettings.auditRetentionDays * 86_400_000).toISOString()
  const { error: purgeError } = await admin.from("audit_logs").delete().lt("created_at", cutoff)
  if (purgeError) console.error("[audit retention]", purgeError.message)
  const { data: organizations } = await admin.from("organizations").select("id, name").order("name")
  return NextResponse.json({ ...result, organizations: organizations ?? [] })
})
