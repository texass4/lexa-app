import { NextResponse } from "next/server"
import { readJson, requireMember, route } from "@/lib/auth/server"
import { assertUserCapacity, inviteMember, listMembers, type InviteInput } from "@/lib/auth/members"
import { recordAudit } from "@/lib/admin/audit"

/** Usuários do escritório de quem chama, com último acesso. */
export const GET = route(async () => {
  const { organizationId } = await requireMember("users.manage")
  return NextResponse.json({ members: await listMembers(organizationId) })
})

/** Convida alguém para o escritório de quem chama. */
export const POST = route(async (request) => {
  const { organizationId, profile } = await requireMember("users.manage")
  await assertUserCapacity(organizationId)
  const member = await inviteMember(request, organizationId, await readJson<InviteInput>(request))
  await recordAudit(request, {
    action: "user.invited",
    actor: profile,
    organizationId,
    target: { type: "user", id: member.id, label: member.name },
    summary: `${member.name} (${member.email}) convidado(a) como ${member.role}`,
  })
  return NextResponse.json({ member }, { status: 201 })
})
