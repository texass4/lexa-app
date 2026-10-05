import { after, type NextRequest } from "next/server"
import type { User as AuthUser } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, siteUrl } from "@/lib/auth/server"
import { sendAccountExistsEmail, sendAuthLink } from "@/lib/auth/mailer"
import { loadSettings } from "@/lib/admin/platform"
import { resolveDefaultPlan } from "@/lib/admin/plans"
import { recordAudit } from "@/lib/admin/audit"

/**
 * Cadastro público em duas etapas, sem revelar quem já tem conta:
 *
 *   1. pedido (`requestSignup`): cria só o usuário do Auth, ainda sem e-mail
 *      confirmado (o Supabase não deixa entrar) e sem escritório; os dados do
 *      escritório ficam em `app_metadata.signup` (só o servidor grava). Sai o link de
 *      confirmação. Se o e-mail já tem conta, nada é criado: o dono recebe um aviso.
 *      A resposta da API é a mesma nos dois casos.
 *   2. confirmação (`/auth/confirm` → `provisionSignup`): com o e-mail confirmado, o
 *      banco cria o escritório e o perfil de Sócio (`provision_signup`, migração 0015).
 */

export interface PendingSignup {
  name: string
  officeName: string
  cnpj?: string
  requestedAt: string
}

export interface SignupInput {
  name: string
  email: string
  password: string
  officeName: string
  cnpj?: string
}

interface EmailStatus {
  user_id: string
  confirmed: boolean
  has_profile: boolean
}

/** Situação do e-mail no Auth (sem conta → `null`). Só o servidor consulta. */
async function emailStatus(email: string): Promise<EmailStatus | null> {
  const { data, error } = await getSupabaseAdmin().rpc("auth_email_status", { p_email: email })
  if (error) throw new Error(`auth_email_status: ${error.message}`)
  return ((data as EmailStatus[] | null) ?? [])[0] ?? null
}

const confirmUrl = (origin: string, tokenHash: string) => `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=/`

/** Link de uso único que confirma o e-mail de quem ainda não confirmou (e entra). */
async function freshConfirmationLink(origin: string, email: string) {
  const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({ type: "magiclink", email })
  if (error || !data.properties?.hashed_token) throw error ?? new Error("Falha ao gerar o link.")
  return confirmUrl(origin, data.properties.hashed_token)
}

/** O envio roda depois da resposta: nem o resultado nem o tempo do SMTP aparecem para quem pediu. */
function sendConfirmation(email: string, name: string | undefined, createLink: () => Promise<string>, replace = false) {
  after(() => sendAuthLink({ to: email, kind: "confirmation", name, createLink, replace }))
}

/** Pedido de cadastro. Não diz se o e-mail tem conta: quem chama responde sempre igual. */
export async function requestSignup(request: NextRequest, input: SignupInput) {
  const admin = getSupabaseAdmin()
  const origin = siteUrl(request)
  const status = await emailStatus(input.email)

  if (status?.confirmed) {
    // Conta confirmada sem escritório (a confirmação falhou no meio): manda de novo o
    // link que termina o cadastro. Com escritório: só o aviso para o dono do e-mail.
    if (!status.has_profile && (await pendingSignupOf(status.user_id))) {
      sendConfirmation(input.email, input.name, () => freshConfirmationLink(origin, input.email))
    } else {
      after(() => sendAccountExistsEmail(input.email, { loginUrl: `${origin}/login`, recoverUrl: `${origin}/recuperar-senha` }))
    }
    return
  }

  // Cadastro anterior nunca confirmado: o novo pedido substitui o antigo (que não tem
  // escritório nem dados — o Supabase não deixa entrar sem confirmar).
  if (status && !status.has_profile) {
    const { error } = await admin.auth.admin.deleteUser(status.user_id)
    if (error) throw new Error(`Falha ao descartar cadastro pendente: ${error.message}`)
  } else if (status) {
    // Não confirmado, mas com perfil (fora deste fluxo): não mexe na conta.
    after(() => sendAccountExistsEmail(input.email, { loginUrl: `${origin}/login`, recoverUrl: `${origin}/recuperar-senha` }))
    return
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: { data: { name: input.name } },
  })
  if (error || !data.user || !data.properties?.hashed_token) {
    // Corrida com outro cadastro do mesmo e-mail: mesma resposta, nada criado aqui.
    if (error?.code === "email_exists" || /already/i.test(error?.message ?? "")) return
    throw error ?? new Error("Falha ao criar o cadastro.")
  }

  const pending: PendingSignup = {
    name: input.name,
    officeName: input.officeName,
    cnpj: input.cnpj?.trim() || undefined,
    requestedAt: new Date().toISOString(),
  }
  const { error: metaError } = await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { signup: pending } })
  if (metaError) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw metaError
  }

  const link = confirmUrl(origin, data.properties.hashed_token)
  sendConfirmation(input.email, input.name, async () => link, true)
}

async function pendingSignupOf(userId: string): Promise<PendingSignup | null> {
  const { data } = await getSupabaseAdmin().auth.admin.getUserById(userId)
  return readPending(data.user)
}

function readPending(user: AuthUser | null | undefined): PendingSignup | null {
  const raw = user?.app_metadata?.signup as Partial<PendingSignup> | undefined
  if (!raw || typeof raw.name !== "string" || typeof raw.officeName !== "string") return null
  return { name: raw.name, officeName: raw.officeName, cnpj: typeof raw.cnpj === "string" ? raw.cnpj : undefined, requestedAt: String(raw.requestedAt ?? "") }
}

/** Reenvio do link de confirmação. Só sai para cadastro pendente; a resposta é sempre igual. */
export async function resendConfirmation(request: NextRequest, email: string) {
  const status = await emailStatus(email)
  if (!status || status.has_profile) return
  const pending = await pendingSignupOf(status.user_id)
  if (!pending) return
  const origin = siteUrl(request)
  sendConfirmation(email, pending.name, () => freshConfirmationLink(origin, email))
}

/**
 * Depois que o link confirmou o e-mail: cria o escritório e o perfil de Sócio, uma vez
 * só. Sem cadastro pendente (convite, recuperação, conta antiga), não faz nada.
 */
export async function provisionSignup(request: NextRequest, user: AuthUser) {
  const pending = readPending(user)
  if (!pending || !user.email || !user.email_confirmed_at) return
  const admin = getSupabaseAdmin()
  const settings = await loadSettings()
  const plan = await resolveDefaultPlan(settings.general.defaultPlan)
  const status = settings.general.requireApproval ? "pending" : "active"

  const { data: organizationId, error } = await admin.rpc("provision_signup", {
    p_user: user.id,
    p_email: user.email,
    p_name: pending.name,
    p_office: pending.officeName,
    p_cnpj: pending.cnpj ?? "",
    p_plan: plan,
    p_status: status,
  })
  if (error || typeof organizationId !== "string") throw new HttpError(500, "Não foi possível concluir o cadastro.")

  await admin.auth.admin.updateUserById(user.id, { app_metadata: { signup: null } })
  await recordAudit(request, {
    action: "organization.signup",
    actor: { id: user.id, name: pending.name, email: user.email, role: "owner" },
    organizationId,
    target: { type: "organization", id: organizationId, label: pending.officeName },
    summary: `${pending.officeName} se cadastrou (${status === "pending" ? "aguardando aprovação" : "ativado automaticamente"}) no plano ${plan}`,
    metadata: { plan, status, emailConfirmed: true },
  })
}
