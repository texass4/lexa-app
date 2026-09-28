import type { NextRequest } from "next/server"
import { HttpError, requireSuperAdmin } from "@/lib/auth/server"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Pedidos que alteram algo precisam vir do próprio LEXA. Os cookies de sessão já são
 * SameSite=Lax; isto fecha a porta para formulários de outros sites (CSRF) mesmo
 * que essa configuração mude.
 */
export function assertSameOrigin(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return
  const origin = request.headers.get("origin")
  // Navegadores sempre mandam Origin em fetch não-GET; sem ele, não é um navegador
  // (e sem navegador não há cookie de sessão de terceiros para abusar).
  if (!origin) return
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    throw new HttpError(403, "Origem não permitida.")
  }
  const expected = [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host].filter(Boolean)
  if (!expected.includes(host)) throw new HttpError(403, "Origem não permitida.")
}

/**
 * Porta de entrada de toda rota `/api/admin/*`: sessão válida (token conferido no
 * Supabase), papel `super_admin` ativo e origem do próprio app nas alterações.
 */
export async function requireAdmin(request: NextRequest) {
  assertSameOrigin(request)
  return requireSuperAdmin()
}
