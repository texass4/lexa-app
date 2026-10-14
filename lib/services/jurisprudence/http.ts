/**
 * Moldura das rotas `/api/jurisprudencia/*` (somente servidor):
 * 1. pessoa autenticada, membro ativo de escritório ativo, com a permissão da rota;
 * 2. (pesquisa) alguma fonte configurada — senão "Pesquisa de jurisprudência ainda
 *    não configurada.";
 * 3. repositório com a SESSÃO de quem chama (RLS), nunca a service role;
 * 4. erro sempre como `{ error: { code, message } }`, sem detalhe técnico.
 */

import { NextResponse } from "next/server"
import { requireMember } from "@/lib/auth/server"
import { HttpError, toPublicError } from "@/lib/auth/http-error"
import type { Permission } from "@/lib/auth/permissions"
import { allow } from "@/lib/auth/protection/rate-limit"
import { createSupabaseServer } from "@/lib/supabase/server"
import { jurisprudenceConfig } from "./config"
import { JurisprudenceError, publicJurisprudenceError } from "./errors"
import { jurisprudenceRepository, type JurisprudenceRepository } from "./store"

const NO_STORE = { "Cache-Control": "no-store" }

export interface JurisprudenceContext {
  repo: JurisprudenceRepository
  organizationId: string
  userId: string
  userName: string
}

/** Pesquisas por pessoa (o banco aguenta mais; isto segura abuso e loops). */
export const SEARCH_RULE = { id: "juris:search", limit: 40, windowSeconds: 60 }

export function respond(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE })
}

export function errorResponse(error: unknown, where: string) {
  if (error instanceof HttpError) {
    const { status, message, logged } = toPublicError(error)
    if (logged) console.error(`[jurisprudencia] ${where}`, error)
    return respond({ error: { code: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST", message } }, status)
  }
  const pub = publicJurisprudenceError(error)
  if (!(error instanceof JurisprudenceError) || pub.status >= 500) {
    console.error(`[jurisprudencia] ${where}`, error instanceof JurisprudenceError ? `${error.code} ${error.detail ?? ""}` : error)
  }
  return respond({ error: { code: pub.code, message: pub.message } }, pub.status)
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    throw new JurisprudenceError("INVALID_QUERY", "corpo inválido")
  }
}

export async function jurisprudenceRoute(
  permission: Permission,
  handler: (context: JurisprudenceContext) => Promise<Response>,
  { requireSource = false, rateLimit = false, where = "rota" } = {},
) {
  try {
    const { organizationId, profile } = await requireMember(permission)
    if (requireSource && !jurisprudenceConfig().enabled) throw new JurisprudenceError("NOT_CONFIGURED", "JURISPRUDENCIA_FONTES vazia")
    if (rateLimit && !(await allow(SEARCH_RULE, profile.id))) throw new JurisprudenceError("RATE_LIMIT", "limite de pesquisas por pessoa")
    const repo = jurisprudenceRepository(await createSupabaseServer())
    return await handler({ repo, organizationId, userId: profile.id, userName: profile.name ?? "" })
  } catch (error) {
    return errorResponse(error, where)
  }
}

/** Id interno de processo da Íntegra (`p_102938`). */
export const PROCESS_ID = /^[A-Za-z0-9_-]{1,64}$/
