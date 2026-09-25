import { NextResponse } from "next/server"
import { requireSuperAdmin, route } from "@/lib/auth/server"
import { resendInvite } from "@/lib/auth/members"

type Context = { params: Promise<{ id: string; userId: string }> }

export const POST = route<Context>(async (request, { params }) => {
  await requireSuperAdmin()
  const { id, userId } = await params
  await resendInvite(request, id, userId)
  return NextResponse.json({ ok: true })
})
