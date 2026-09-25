import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, requireMember, route } from "@/lib/auth/server"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"

/**
 * Troca o e-mail de login. Exige a senha atual — sem provedor de e-mail ainda, é a
 * confirmação de que quem pede é o dono da conta.
 */
export const PATCH = route(async (request) => {
  const { user } = await requireMember()
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = normalizeEmail(body.email ?? "")
  if (!isEmail(email)) throw new HttpError(400, "E-mail inválido.")
  if (email === user.email) return NextResponse.json({ ok: true })

  // Cliente descartável: confere a senha sem mexer na sessão do navegador.
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: passwordError } = await check.auth.signInWithPassword({ email: user.email!, password: body.password ?? "" })
  if (passwordError) throw new HttpError(400, "Senha atual incorreta.")

  const admin = getSupabaseAdmin()
  const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true })
  if (error) {
    if (error.code === "email_exists" || /already/i.test(error.message)) throw new HttpError(409, "Este e-mail já está em uso.")
    throw error
  }
  await admin.from("profiles").update({ email }).eq("id", user.id)
  return NextResponse.json({ ok: true })
})
