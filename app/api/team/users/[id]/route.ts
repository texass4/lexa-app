import { NextResponse } from "next/server"
import { readJson, requireMember, route } from "@/lib/auth/server"
import { removeMember, updateMember, type MemberPatch } from "@/lib/auth/members"
import { auditMemberPatch, recordAudit } from "@/lib/admin/audit"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type Context = { params: Promise<{ id: string }> }

export const PATCH = route<Context>(async (request, { params }) => {
  const { organizationId, user, profile } = await requireMember("users.manage")
  const { id } = await params
  const patch = await readJson<MemberPatch>(request)
  const member = await updateMember(organizationId, id, patch, user.id)
  await auditMemberPatch(request, profile, organizationId, member, patch)
  return NextResponse.json({ member })
})

export const DELETE = route<Context>(async (request, { params }) => {
  const { organizationId, user, profile } = await requireMember("users.manage")
  const { id } = await params
  const { data: target } = await getSupabaseAdmin().from("profiles").select("name, email").eq("id", id).eq("organization_id", organizationId).maybeSingle<{ name: string; email: string }>()
  await removeMember(organizationId, id, user.id)
  await recordAudit(request, {
    action: "user.removed",
    severity: "critical",
    actor: profile,
    organizationId,
    target: { type: "user", id, label: target?.name },
    summary: `${target?.name ?? "Usuário"} (${target?.email ?? id}) removido(a)`,
  })
  return NextResponse.json({ ok: true })
})
