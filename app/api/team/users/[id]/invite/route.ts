import { NextResponse } from "next/server"
import { requireMember, route } from "@/lib/auth/server"
import { resendInvite } from "@/lib/auth/members"
import { recordAudit } from "@/lib/admin/audit"

type Context = { params: Promise<{ id: string }> }

export const POST = route<Context>(async (request, { params }) => {
  const { organizationId, profile } = await requireMember("users.manage")
  const { id } = await params
  const emailSent = await resendInvite(request, organizationId, id)
  await recordAudit(request, {
    action: "user.access_reset",
    actor: profile,
    organizationId,
    target: { type: "user", id },
    summary: "Link de acesso (convite ou nova senha) enviado",
  })
  return NextResponse.json({ ok: true, emailSent })
})
