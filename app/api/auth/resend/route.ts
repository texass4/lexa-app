import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"
import { resendConfirmation } from "@/lib/auth/signup"
import { clientIp } from "@/lib/auth/protection/client-ip"
import { enforce, LIMITS } from "@/lib/auth/protection/rate-limit"
import { isHoneypot, requireChallenge, type ProtectedBody } from "@/lib/auth/protection/guard"
import { atLeast } from "@/lib/auth/protection/timing"

/**
 * POST /api/auth/resend — reenvia o link de confirmação do cadastro. Resposta sempre
 * igual (não revela se há cadastro pendente para o e-mail); mesmas proteções do
 * cadastro e da recuperação de senha.
 */
export const POST = route((request) =>
  atLeast(800, async () => {
    const body = await readJson<ProtectedBody & { email?: unknown }>(request)
    const ip = clientIp(request)
    await enforce([LIMITS.resendIp, ip])
    if (isHoneypot(body)) return NextResponse.json({ ok: true })
    await requireChallenge(body, "resend")
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "")
    if (isEmail(email)) {
      await enforce([LIMITS.resendEmail, email])
      await resendConfirmation(request, email)
    }
    return NextResponse.json({ ok: true })
  }),
)
