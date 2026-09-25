import { NextResponse } from "next/server"
import { requireMember, route } from "@/lib/auth/server"
import { resendInvite } from "@/lib/auth/members"

type Context = { params: Promise<{ id: string }> }

export const POST = route<Context>(async (request, { params }) => {
  const { organizationId } = await requireMember("users.manage")
  const { id } = await params
  await resendInvite(request, organizationId, id)
  return NextResponse.json({ ok: true })
})
