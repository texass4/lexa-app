import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { readJson, route, siteUrl } from "@/lib/auth/server"
import { sendAuthLink } from "@/lib/auth/mailer"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"

/**
 * Recuperação de senha. A resposta é sempre a mesma, exista ou não a conta, para não
 * revelar quais e-mails estão cadastrados.
 */
export const POST = route(async (request) => {
  const { email: raw } = await readJson<{ email?: string }>(request)
  const email = normalizeEmail(raw ?? "")

  if (isEmail(email)) {
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({ type: "recovery", email })
    if (!error && data.properties?.hashed_token) {
      const link = `${siteUrl(request)}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/redefinir-senha`
      await sendAuthLink(email, "recovery", link)
    }
  }

  return NextResponse.json({ ok: true })
})
