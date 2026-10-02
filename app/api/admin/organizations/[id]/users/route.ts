import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { inviteMember, listMembers, type InviteInput } from "@/lib/auth/members"
import { requireAdmin } from "@/lib/admin/guard"
import { emailStatus } from "@/lib/auth/mailer"
import { recordAudit } from "@/lib/admin/audit"
import { ROLE_LABELS } from "@/lib/auth/permissions"

type Context = { params: Promise<{ id: string }> }

export const GET = route<Context>(async (request, { params }) => {
  await requireAdmin(request)
  const { id } = await params
  return NextResponse.json({ members: await listMembers(id) })
})

export const POST = route<Context>(async (request, { params }) => {
  const { profile } = await requireAdmin(request)
  const { id } = await params
  const { member, email } = await inviteMember(request, id, await readJson<InviteInput>(request))
  await recordAudit(request, {
    action: "user.invited",
    actor: profile,
    organizationId: id,
    target: { type: "user", id: member.id, label: member.name },
    summary: `${member.name} (${member.email}) convidado(a) pelo Super Admin como ${ROLE_LABELS[member.role]}`,
    metadata: { emailSent: email.ok },
  })
  return NextResponse.json({ member, email: emailStatus(email) }, { status: 201 })
})
