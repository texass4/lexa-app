import { after, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route, siteUrl } from "@/lib/auth/server"
import { sendAuthLink } from "@/lib/auth/mailer"
import { isEmailConfigured } from "@/lib/services/email"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"
import { clientIp } from "@/lib/auth/protection/client-ip"
import { enforce, LIMITS } from "@/lib/auth/protection/rate-limit"
import { isHoneypot, requireChallenge, type ProtectedBody } from "@/lib/auth/protection/guard"
import { atLeast } from "@/lib/auth/protection/timing"

/**
 * Recuperação de senha. A resposta é sempre a mesma, exista ou não a conta, para não
 * revelar quais e-mails estão cadastrados — por isso o envio roda depois da resposta
 * (`after`): nem o resultado nem o tempo do SMTP aparecem para quem pediu. Falhas
 * ficam no log do servidor. Protegida contra abuso (disparo de e-mails para uma
 * vítima, varredura): limite por IP e por e-mail, desafio anti-bot e campo-isca.
 */
export const POST = route((request) =>
  atLeast(600, async () => {
    const body = await readJson<ProtectedBody & { email?: unknown }>(request)
    const ip = clientIp(request)
    await enforce([LIMITS.recoverIp, ip])
    if (isHoneypot(body)) return NextResponse.json({ ok: true })
    await requireChallenge(body, "recover")
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "")

    // Vale para qualquer e-mail (não revela nada): em produção, sem SMTP, avisa em vez de fingir que enviou.
    if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
      throw new HttpError(503, "A recuperação de senha por e-mail está indisponível no momento. Fale com o suporte da Íntegra.")
    }

    if (isEmail(email)) {
      await enforce([LIMITS.recoverEmail, email])
      const origin = siteUrl(request)
      after(() =>
        sendAuthLink({
          to: email,
          kind: "recovery",
          createLink: async () => {
            const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({ type: "recovery", email })
            if (error || !data.properties?.hashed_token) throw error ?? new Error("Falha ao gerar o link.")
            return `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/redefinir-senha`
          },
        }),
      )
    }

    return NextResponse.json({ ok: true })
  }),
)
