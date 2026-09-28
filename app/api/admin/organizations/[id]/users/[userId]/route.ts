import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { removeMember, updateMember, type MemberPatch } from "@/lib/auth/members"
import { requireAdmin } from "@/lib/admin/guard"
import { auditMemberPatch, recordAudit } from "@/lib/admin/audit"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type Context = { params: Promise<{ id: string; userId: string }> }

export const PATCH = route<Context>(async (request, { params }) => {
  const { user, profile } = await requireAdmin(request)
  const { id, userId } = await params
  const patch = await readJson<MemberPatch>(request)
  const member = await updateMember(id, userId, patch, user.id)
  await auditMemberPatch(request, profile, id, member, patch)
  return NextResponse.json({ member })
})

export const DELETE = route<Context>(async (request, { params }) => {
  const { user, profile } = await requireAdmin(request)
  const { id, userId } = await params
  const { data: target } = await getSupabaseAdmin()
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .eq("organization_id", id)
    .maybeSingle<{ name: string; email: string }>()
  await removeMember(id, userId, user.id)
  await recordAudit(request, {
    action: "user.removed",
    severity: "critical",
    actor: profile,
    organizationId: id,
    target: { type: "user", id: userId, label: target?.name },
    summary: `${target?.name ?? "Usuário"} (${target?.email ?? userId}) removido(a) pelo Super Admin`,
  })
  return NextResponse.json({ ok: true })
})
