import { NextResponse } from "next/server"
import { readJson, requireMember, route } from "@/lib/auth/server"
import { removeMember, updateMember, type MemberPatch } from "@/lib/auth/members"

type Context = { params: Promise<{ id: string }> }

export const PATCH = route<Context>(async (request, { params }) => {
  const { organizationId, user } = await requireMember("users.manage")
  const { id } = await params
  const member = await updateMember(organizationId, id, await readJson<MemberPatch>(request), user.id)
  return NextResponse.json({ member })
})

export const DELETE = route<Context>(async (_request, { params }) => {
  const { organizationId, user } = await requireMember("users.manage")
  const { id } = await params
  await removeMember(organizationId, id, user.id)
  return NextResponse.json({ ok: true })
})
