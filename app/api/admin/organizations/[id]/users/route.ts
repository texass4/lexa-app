import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { inviteMember, listMembers, type InviteInput } from "@/lib/auth/members"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"

type Context = { params: Promise<{ id: string }> }

export const GET = route<Context>(async (request, { params }) => {
  await requireAdmin(request)
  const { id } = await params
  return NextResponse.json({ members: await listMembers(id) })
})

export const POST = route<Context>(async (request, { params }) => {
  const { profile } = await requireAdmin(request)
  const { id } = await params
  const member = await inviteMember(request, id, await readJson<InviteInput>(request))
  await recordAudit(request, {
    action: "user.invited",
    actor: profile,
    organizationId: id,
    target: { type: "user", id: member.id, label: member.name },
    summary: `${member.name} (${member.email}) convidado(a) pelo Super Admin como ${member.role}`,
  })
  return NextResponse.json({ member }, { status: 201 })
})
