import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizeEmail, passwordProblem } from "./validation"

/**
 * Garante a conta do Super Admin a partir do `.env.local`. Roda no start do servidor
 * (`instrumentation.ts`). A senha do `.env.local` só vale na criação; depois, troque
 * pela recuperação de senha. Nunca transforma em Super Admin alguém que já pertence
 * a um escritório.
 */
export async function ensureSuperAdmin() {
  const email = normalizeEmail(process.env.LEXA_SUPERADMIN_EMAIL ?? "")
  const password = process.env.LEXA_SUPERADMIN_PASSWORD ?? ""
  if (!email || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.warn("[LEXA] Super Admin não configurado: defina LEXA_SUPERADMIN_EMAIL e as chaves do Supabase no .env.local.")
    return
  }

  const admin = getSupabaseAdmin()
  const { data: existing, error: lookupError } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle()
  if (lookupError) {
    console.error("[LEXA] Não foi possível verificar o Super Admin. A migração do banco foi aplicada?", lookupError.message)
    return
  }
  if (existing?.role === "super_admin") return
  if (existing) {
    console.error(`[LEXA] ${email} já pertence a um escritório e não pode virar Super Admin.`)
    return
  }

  const weak = passwordProblem(password)
  if (weak) {
    console.error(`[LEXA] LEXA_SUPERADMIN_PASSWORD inválida para criar o Super Admin: ${weak}`)
    return
  }

  let userId: string | undefined
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.user) userId = created.user.id
  else if (error?.code === "email_exists" || /already/i.test(error?.message ?? "")) {
    // Conta de autenticação sem perfil (ex.: perfil apagado): reaproveita.
    for (let page = 1; !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      userId = data.users.find((u) => u.email === email)?.id
      if (data.users.length < 200) break
    }
  } else {
    console.error("[LEXA] Falha ao criar o Super Admin:", error?.message)
    return
  }
  if (!userId) return

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: userId, organization_id: null, role: "super_admin", name: "Super Admin", email })
  if (profileError) console.error("[LEXA] Falha ao criar o perfil do Super Admin:", profileError.message)
  else console.info(`[LEXA] Super Admin pronto: ${email}`)
}
