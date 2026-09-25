import { NextResponse } from "next/server"
import { readJson, requireSuperAdmin, route } from "@/lib/auth/server"
import { inviteMember, listMembers, type InviteInput } from "@/lib/auth/members"

type Context = { params: Promise<{ id: string }> }

export const GET = route<Context>(async (_request, { params }) => {
  await requireSuperAdmin()
  const { id } = await params
  return NextResponse.json({ members: await listMembers(id) })
})

export const POST = route<Context>(async (request, { params }) => {
  await requireSuperAdmin()
  const { id } = await params
  const member = await inviteMember(request, id, await readJson<InviteInput>(request))
  return NextResponse.json({ member }, { status: 201 })
})
