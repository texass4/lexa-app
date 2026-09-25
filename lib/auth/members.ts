import type { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, siteUrl } from "./server"
import { sendAuthLink } from "./mailer"
import { MEMBER_ROLES, sanitizePermissions, type MemberRole } from "./permissions"
import { toUser, type MemberAccess, type ProfileRow } from "./profile"
import { isEmail, normalizeEmail } from "./validation"

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
 * Link de uso único para definir a senha. O de recuperação serve de convite: a conta
 * já existe e só precisa de senha. `kind` muda o texto do e-mail e da tela.
 */
async function sendPasswordLink(request: NextRequest, email: string, kind: "invite" | "recovery") {
  const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({ type: "recovery", email })
  if (error || !data.properties?.hashed_token) throw error ?? new Error("Falha ao gerar o link.")
  const next = kind === "invite" ? "/redefinir-senha?convite=1" : "/redefinir-senha"
  const link = `${siteUrl(request)}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent(next)}`
  await sendAuthLink(email, kind, link)
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
      throw new HttpError(409, "Este e-mail já tem conta no LEXA. Cada pessoa pertence a um escritório.")
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

  await sendPasswordLink(request, email, "invite")
  return { ...toUser(profile), invitePending: true } satisfies MemberAccess
}

/** Reenvia o convite (quem nunca entrou) ou manda um link de nova senha (quem já entrou). */
export async function resendInvite(request: NextRequest, organizationId: string, userId: string) {
  const target = await targetIn(organizationId, userId)
  if (!target.active) throw new HttpError(400, "Reative o usuário antes de enviar o link.")
  const { data } = await getSupabaseAdmin().auth.admin.getUserById(userId)
  await sendPasswordLink(request, target.email, data.user?.last_sign_in_at ? "recovery" : "invite")
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
