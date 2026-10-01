import type { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, siteUrl } from "./server"
import { EMAIL_FAILURE_STATUS, sendAuthLink, type EmailResult } from "./mailer"
import { MEMBER_ROLES, sanitizePermissions, type MemberRole } from "./permissions"
import { toUser, type MemberAccess, type ProfileRow } from "./profile"
import { isEmail, normalizeEmail } from "./validation"
import { loadSettings } from "@/lib/admin/platform"
import { sanitizeLimits } from "@/lib/admin/catalog"

/**
 * Gestão de usuários de um escritório, com a service role. Usado pelas rotas do
 * Sócio (`/api/team/users`, sempre com o escritório de quem chama) e do Super Admin
 * (`/api/admin/organizations/[id]/users`). Toda função recebe o `organizationId` e
 * confere que o usuário-alvo pertence a ele — nunca confia no id vindo do cliente.
 */

async function targetIn(organizationId: string, userId: string) {
  const { data } = await getSupabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle<ProfileRow>()
  if (!data) throw new HttpError(404, "Usuário não encontrado neste escritório.")
  return data
}

async function activeOwners(organizationId: string) {
  const { count } = await getSupabaseAdmin()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("active", true)
  return count ?? 0
}

export async function listMembers(organizationId: string): Promise<MemberAccess[]> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from("profiles").select("*").eq("organization_id", organizationId).order("name")
  if (error) throw error
  return Promise.all(
    (data as ProfileRow[]).map(async (row) => {
      const { data: auth } = await admin.auth.admin.getUserById(row.id)
      return {
        ...toUser(row),
        lastSignInAt: auth.user?.last_sign_in_at ?? undefined,
        invitePending: !auth.user?.last_sign_in_at,
      }
    }),
  )
}

/**
 * Link de uso único para definir a senha, enviado por e-mail. O de recuperação serve
 * de convite: a conta já existe e só precisa de senha. `kind` muda o texto do e-mail
 * e da tela. Não lança por falha de envio — devolve o resultado.
 */
async function sendPasswordLink(
  request: NextRequest,
  target: { email: string; name?: string; organizationId?: string },
  kind: "invite" | "recovery",
): Promise<EmailResult> {
  const admin = getSupabaseAdmin()
  let organizationName: string | undefined
  if (kind === "invite" && target.organizationId) {
    const { data } = await admin.from("organizations").select("name").eq("id", target.organizationId).maybeSingle<{ name: string }>()
    organizationName = data?.name
  }
  return sendAuthLink({
    to: target.email,
    kind,
    name: target.name,
    organizationName,
    createLink: async () => {
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: target.email })
      if (error || !data.properties?.hashed_token) throw error ?? new Error("Falha ao gerar o link.")
      const next = kind === "invite" ? "/redefinir-senha?convite=1" : "/redefinir-senha"
      return `${siteUrl(request)}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent(next)}`
    },
  })
}

export interface InviteInput {
  email?: string
  name?: string
  role?: string
  jobTitle?: string
}

export async function inviteMember(request: NextRequest, organizationId: string, input: InviteInput) {
  const email = normalizeEmail(input.email ?? "")
  const name = input.name?.trim() ?? ""
  const role = input.role as MemberRole
  if (!isEmail(email)) throw new HttpError(400, "E-mail inválido.")
  if (name.length < 3) throw new HttpError(400, "Informe o nome completo.")
  if (!MEMBER_ROLES.includes(role)) throw new HttpError(400, "Papel inválido.")

  const admin = getSupabaseAdmin()
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } })
  if (error || !created.user) {
    if (error?.code === "email_exists" || /already/i.test(error?.message ?? "")) {
      throw new HttpError(409, "Este e-mail já tem conta na Íntegra. Cada pessoa pertence a um escritório.")
    }
    throw error ?? new Error("Falha ao criar usuário.")
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, organization_id: organizationId, role, name, email, job_title: input.jobTitle?.trim() || null })
    .select("*")
    .single<ProfileRow>()
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    throw profileError
  }

  // A conta já existe: se o e-mail falhar, o convite continua pendente e pode ser reenviado.
  const delivery = await sendPasswordLink(request, { email, name, organizationId }, "invite")
  return { member: { ...toUser(profile), invitePending: true } satisfies MemberAccess, email: delivery }
}

/**
 * Reenvia o convite (quem nunca entrou) ou manda um link de nova senha (quem já entrou).
 * Aqui o e-mail é a própria operação: se não sair, vira erro para quem pediu.
 */
export async function resendInvite(request: NextRequest, organizationId: string, userId: string) {
  const target = await targetIn(organizationId, userId)
  if (!target.active) throw new HttpError(400, "Reative o usuário antes de enviar o link.")
  const { data } = await getSupabaseAdmin().auth.admin.getUserById(userId)
  const result = await sendPasswordLink(
    request,
    { email: target.email, name: target.name, organizationId },
    data.user?.last_sign_in_at ? "recovery" : "invite",
  )
  if (!result.ok) throw new HttpError(EMAIL_FAILURE_STATUS[result.reason], result.message)
}

export interface MemberPatch {
  name?: string
  jobTitle?: string | null
  phone?: string | null
  oab?: string | null
  role?: string
  /** null = volta ao padrão do papel. */
  permissions?: string[] | null
  active?: boolean
}

/** `actorId`: quem está alterando (não pode mudar o próprio papel, permissões ou status). */
export async function updateMember(organizationId: string, userId: string, patch: MemberPatch, actorId: string) {
  const target = await targetIn(organizationId, userId)
  const update: Record<string, unknown> = {}

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name.length < 3) throw new HttpError(400, "Informe o nome completo.")
    update.name = name
  }
  if (patch.jobTitle !== undefined) update.job_title = patch.jobTitle?.trim() || null
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null
  if (patch.oab !== undefined) update.oab = patch.oab?.trim() || null

  const changesAccess = patch.role !== undefined || patch.permissions !== undefined || patch.active !== undefined
  if (changesAccess && userId === actorId) throw new HttpError(400, "Você não pode alterar o próprio papel, permissões ou status.")

  const role = (patch.role ?? target.role) as MemberRole
  if (patch.role !== undefined) {
    if (!MEMBER_ROLES.includes(role)) throw new HttpError(400, "Papel inválido.")
    update.role = role
    // Ao trocar de papel, as permissões voltam ao padrão do novo papel (a menos que venham junto).
    if (patch.permissions === undefined) update.permissions = null
  }
  if (patch.permissions !== undefined)
    update.permissions = role === "owner" || patch.permissions === null ? null : sanitizePermissions(patch.permissions)
  if (patch.active !== undefined) update.active = patch.active

  const losesOwner = target.role === "owner" && target.active && (role !== "owner" || patch.active === false)
  if (losesOwner && (await activeOwners(organizationId)) <= 1) {
    throw new HttpError(400, "O escritório precisa de pelo menos um Sócio/Proprietário ativo.")
  }

  if (!Object.keys(update).length) return toUser(target)
  const { data, error } = await getSupabaseAdmin().from("profiles").update(update).eq("id", userId).select("*").single<ProfileRow>()
  if (error) throw error
  return toUser(data)
}

/**
 * Limite de usuários do plano (ou o personalizado do escritório). Só vale quando o
 * Super Admin liga "Aplicar limite de usuários" nas configurações; o próprio Super
 * Admin pode passar do limite de propósito.
 */
export async function assertUserCapacity(organizationId: string) {
  const settings = await loadSettings()
  if (!settings.general.enforceUserLimits) return
  const admin = getSupabaseAdmin()
  const [{ data: org }, { count }] = await Promise.all([
    admin.from("organizations").select("plan, custom_limits").eq("id", organizationId).maybeSingle<{ plan: string; custom_limits: Record<string, unknown> | null }>(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ])
  if (!org) return
  const { data: plan } = await admin.from("plans").select("max_users").eq("name", org.plan).maybeSingle<{ max_users: number | null }>()
  const custom = org.custom_limits ? sanitizeLimits(org.custom_limits) : {}
  const limit = "users" in custom ? (custom.users ?? null) : (plan?.max_users ?? null)
  if (limit !== null && (count ?? 0) >= limit) {
    throw new HttpError(403, `O plano ${org.plan} permite até ${limit} usuário(s). Fale com a equipe da Íntegra para ampliar.`)
  }
}

/**
 * Move a pessoa para outro escritório (só o Super Admin). As permissões voltam ao
 * padrão do papel — elas eram do escritório antigo. Registros criados por ela ficam
 * no escritório de origem.
 */
export async function moveMember(fromOrganizationId: string, toOrganizationId: string, userId: string, role?: string) {
  const target = await targetIn(fromOrganizationId, userId)
  if (fromOrganizationId === toOrganizationId) return toUser(target)
  const nextRole = (role ?? target.role) as MemberRole
  if (!MEMBER_ROLES.includes(nextRole)) throw new HttpError(400, "Papel inválido.")
  const admin = getSupabaseAdmin()
  const { data: dest } = await admin.from("organizations").select("id").eq("id", toOrganizationId).maybeSingle()
  if (!dest) throw new HttpError(404, "Escritório de destino não encontrado.")
  if (target.role === "owner" && target.active && (await activeOwners(fromOrganizationId)) <= 1) {
    throw new HttpError(400, "Esta pessoa é o único Sócio/Proprietário ativo do escritório de origem. Promova outra pessoa antes de movê-la.")
  }
  const { data, error } = await admin
    .from("profiles")
    .update({ organization_id: toOrganizationId, role: nextRole, permissions: null })
    .eq("id", userId)
    .select("*")
    .single<ProfileRow>()
  if (error) throw error
  return toUser(data)
}

export async function removeMember(organizationId: string, userId: string, actorId: string) {
  const target = await targetIn(organizationId, userId)
  if (userId === actorId) throw new HttpError(400, "Você não pode remover a si mesmo.")
  if (target.role === "owner" && target.active && (await activeOwners(organizationId)) <= 1) {
    throw new HttpError(400, "O escritório precisa de pelo menos um Sócio/Proprietário ativo.")
  }
  // Apaga a conta; o perfil sai junto (on delete cascade). Registros criados pela
  // pessoa continuam no escritório e passam a mostrar "Usuário removido".
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId)
  if (error) throw error
}
