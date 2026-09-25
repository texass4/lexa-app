import { NextResponse, type NextRequest } from "next/server"
import type { User as AuthUser } from "@supabase/supabase-js"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { hasPermission, type Permission } from "./permissions"
import type { ProfileRow } from "./profile"

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

interface Caller {
  user: AuthUser
  profile: ProfileRow
}

/** Quem está chamando, validado pelo token do cookie (não pelo corpo da requisição). */
async function getCaller(): Promise<Caller> {
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
  return { ...caller, organizationId: profile.organization_id }
}

export async function requireSuperAdmin() {
  const caller = await getCaller()
  if (caller.profile.role !== "super_admin" || !caller.profile.active) throw new HttpError(403, "Apenas o Super Admin.")
  return caller
}

/**
 * Para as rotas de consulta processual (streaming, fora de `route()`): resposta de erro
 * no formato que `lib/services/processes/client.ts` entende, ou null se pode seguir.
 */
export async function authorize(permission?: Permission): Promise<Response | null> {
  try {
    await requireMember(permission)
    return null
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    const code = error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN"
    return NextResponse.json({ error: { code, message: error.message } }, { status: error.status })
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
