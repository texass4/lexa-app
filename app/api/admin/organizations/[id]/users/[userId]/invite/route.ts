import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { resendInvite } from "@/lib/auth/members"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"

type Context = { params: Promise<{ id: string; userId: string }> }

/** Reenvia o convite ou manda link de nova senha ("resetar acesso"). */
export const POST = route<Context>(async (request, { params }) => {
  const { profile } = await requireAdmin(request)
  const { id, userId } = await params
  await resendInvite(request, id, userId)
  await recordAudit(request, {
    action: "user.access_reset",
    severity: "warning",
    actor: profile,
    organizationId: id,
    target: { type: "user", id: userId },
    summary: "Link de acesso (convite ou nova senha) enviado pelo Super Admin",
  })
  return NextResponse.json({ ok: true })
})
