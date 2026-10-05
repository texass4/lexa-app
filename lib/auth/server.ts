import { NextResponse, type NextRequest } from "next/server"
import type { User as AuthUser } from "@supabase/supabase-js"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { loadSettings } from "@/lib/admin/platform"
import { hasPermission, type Permission } from "./permissions"
import type { ProfileRow } from "./profile"

import { HttpError } from "./http-error"

export { HttpError }

interface Caller {
  user: AuthUser
  profile: ProfileRow
}

/** Quem está chamando, validado pelo token do cookie (não pelo corpo da requisição). */
export async function getCaller(): Promise<Caller> {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new HttpError(401, "Não autenticado.")
  const { data: profile } = await getSupabaseAdmin().from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>()
  if (!profile) throw new HttpError(403, "Perfil não encontrado.")
  return { user, profile }
}

/** Membro ativo de um escritório ativo, opcionalmente com uma permissão. */
export async function requireMember(permission?: Permission) {
  const caller = await getCaller()
  const { profile } = caller
  if (profile.role === "super_admin" || !profile.organization_id) throw new HttpError(403, "Disponível apenas para membros de um escritório.")
  const { data: org } = await getSupabaseAdmin()
    .from("organizations")
    .select("status")
    .eq("id", profile.organization_id)
    .maybeSingle<{ status: string }>()
  if (!profile.active || org?.status !== "active") throw new HttpError(403, "Acesso desativado.")
  if (permission && !hasPermission(profile, permission)) throw new HttpError(403, "Você não tem permissão para esta ação.")
  // Manutenção: as rotas do servidor usam a service role (ignoram a RLS), então o
  // bloqueio precisa estar aqui também — não só em `current_org_id()`.
  const { maintenance } = await loadSettings()
  if (maintenance.enabled) throw new HttpError(503, maintenance.message)
  return { ...caller, organizationId: profile.organization_id }
}

export async function requireSuperAdmin() {
  const caller = await getCaller()
  if (caller.profile.role !== "super_admin" || !caller.profile.active) throw new HttpError(403, "Apenas o Super Admin.")
  return caller
}

/**
 * Para as rotas de consulta processual: o escritório de quem chama, ou a resposta
 * de erro no formato que `lib/services/processos/client.ts` entende.
 */
export async function authorizeMember(permission?: Permission): Promise<{ organizationId: string } | { response: Response }> {
  try {
    const { organizationId } = await requireMember(permission)
    return { organizationId }
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    return { response: NextResponse.json({ ok: false, reason: "forbidden", message: error.message }, { status: error.status }) }
  }
}

/** Transforma `HttpError` em resposta JSON; o resto vira 500 sem vazar detalhes. */
export function route<C>(handler: (request: NextRequest, context: C) => Promise<Response>) {
  return async (request: NextRequest, context: C) => {
    try {
      return await handler(request, context)
    } catch (error) {
      if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
      console.error(error)
      return NextResponse.json({ error: "Erro inesperado. Tente de novo." }, { status: 500 })
    }
  }
}

export async function readJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, "Requisição inválida.")
  }
}

/** Origem pública do app, para montar links de e-mail. */
export function siteUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin
}
