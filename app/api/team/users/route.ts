import { NextResponse } from "next/server"
import { readJson, requireMember, route } from "@/lib/auth/server"
import { inviteMember, listMembers, type InviteInput } from "@/lib/auth/members"

/** Usuários do escritório de quem chama, com último acesso. */
export const GET = route(async () => {
  const { organizationId } = await requireMember("users.manage")
  return NextResponse.json({ members: await listMembers(organizationId) })
})

/** Convida alguém para o escritório de quem chama. */
export const POST = route(async (request) => {
  const { organizationId } = await requireMember("users.manage")
  const member = await inviteMember(request, organizationId, await readJson<InviteInput>(request))
  return NextResponse.json({ member }, { status: 201 })
})
