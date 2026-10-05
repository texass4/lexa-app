import { NextResponse } from "next/server"
import { readJson, requireMember, route } from "@/lib/auth/server"
import { assertUserCapacity, inviteMember, listMembers, type InviteInput } from "@/lib/auth/members"
import { emailStatus } from "@/lib/auth/mailer"
import { recordAudit } from "@/lib/admin/audit"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import { enforce, LIMITS } from "@/lib/auth/protection/rate-limit"

/** Usuários do escritório de quem chama, com último acesso. */
export const GET = route(async () => {
  const { organizationId } = await requireMember("users.manage")
  return NextResponse.json({ members: await listMembers(organizationId) })
})

/** Convida alguém para o escritório de quem chama. */
export const POST = route(async (request) => {
  const { organizationId, profile } = await requireMember("users.manage")
  // O convite diz se o e-mail já tem conta na Íntegra; com limite, não vira varredura de e-mails.
  await enforce([LIMITS.inviteUser, profile.id], [LIMITS.inviteOrg, organizationId])
  await assertUserCapacity(organizationId)
  const { member, email } = await inviteMember(request, organizationId, await readJson<InviteInput>(request))
  await recordAudit(request, {
    action: "user.invited",
    actor: profile,
    organizationId,
    target: { type: "user", id: member.id, label: member.name },
    summary: `${member.name} (${member.email}) convidado(a) como ${ROLE_LABELS[member.role]}`,
    metadata: { emailSent: email.ok },
  })
  return NextResponse.json({ member, email: emailStatus(email) }, { status: 201 })
})
