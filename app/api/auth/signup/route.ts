import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { isEmail, normalizeEmail, passwordProblem } from "@/lib/auth/validation"
import { loadSettings } from "@/lib/admin/platform"
import { resolveDefaultPlan } from "@/lib/admin/plans"
import { recordAudit } from "@/lib/admin/audit"

interface Body {
  name?: string
  email?: string
  password?: string
  officeName?: string
  cnpj?: string
}

/**
 * Cadastro público: cria o escritório (aguardando aprovação do Super Admin) e a
 * conta do Sócio/Proprietário. Nada do escritório fica acessível até a aprovação —
 * `current_org_id()` só devolve escritórios ativos.
 */
export const POST = route(async (request) => {
  const body = await readJson<Body>(request)
  const name = body.name?.trim() ?? ""
  const email = normalizeEmail(body.email ?? "")
  const password = body.password ?? ""
  const officeName = body.officeName?.trim() ?? ""

  if (name.length < 3) throw new HttpError(400, "Informe seu nome completo.")
  if (!isEmail(email)) throw new HttpError(400, "E-mail inválido.")
  const weak = passwordProblem(password)
  if (weak) throw new HttpError(400, weak)
  if (officeName.length < 2) throw new HttpError(400, "Informe o nome do escritório.")

  const settings = await loadSettings()
  if (!settings.general.publicSignup) throw new HttpError(403, "O cadastro de novos escritórios está fechado no momento. Fale com a equipe da Íntegra.")
  const plan = await resolveDefaultPlan(settings.general.defaultPlan)
  const status = settings.general.requireApproval ? "pending" : "active"

  const admin = getSupabaseAdmin()

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: officeName,
      cnpj: body.cnpj?.trim() || null,
      email,
      plan,
      status,
      approved_at: status === "active" ? new Date().toISOString() : null,
    })
    .select("id")
    .single()
  if (orgError || !org) throw orgError ?? new Error("Falha ao criar escritório.")

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    // A aprovação do escritório é a porta de entrada; o e-mail será verificado quando houver provedor.
    email_confirm: true,
    user_metadata: { name },
  })
  if (userError || !created.user) {
    await admin.from("organizations").delete().eq("id", org.id)
    if (userError?.code === "email_exists" || /already/i.test(userError?.message ?? "")) {
      throw new HttpError(409, "Já existe uma conta com este e-mail. Entre ou recupere a senha.")
    }
    throw userError ?? new Error("Falha ao criar usuário.")
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    organization_id: org.id,
    role: "owner",
    name,
    email,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    await admin.from("organizations").delete().eq("id", org.id)
    throw profileError
  }

  await recordAudit(request, {
    action: "organization.signup",
    actor: { id: created.user.id, name, email, role: "owner" },
    organizationId: org.id,
    target: { type: "organization", id: org.id, label: officeName },
    summary: `${officeName} se cadastrou (${status === "pending" ? "aguardando aprovação" : "ativado automaticamente"}) no plano ${plan}`,
    metadata: { plan, status },
  })

  return NextResponse.json({ ok: true, pending: status === "pending" }, { status: 201 })
})
