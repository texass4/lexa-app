import { NextResponse } from "next/server"
import { readJson, requireSuperAdmin, route } from "@/lib/auth/server"
import { removeMember, updateMember, type MemberPatch } from "@/lib/auth/members"

type Context = { params: Promise<{ id: string; userId: string }> }

export const PATCH = route<Context>(async (request, { params }) => {
  const { user } = await requireSuperAdmin()
  const { id, userId } = await params
  const member = await updateMember(id, userId, await readJson<MemberPatch>(request), user.id)
  return NextResponse.json({ member })
})

export const DELETE = route<Context>(async (_request, { params }) => {
  const { user } = await requireSuperAdmin()
  const { id, userId } = await params
  await removeMember(id, userId, user.id)
  return NextResponse.json({ ok: true })
})
