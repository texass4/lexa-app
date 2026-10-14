/**
 * Moldura das rotas `/api/process-enrichment/*` (somente servidor):
 * pessoa autenticada, membro ativo com a permissão da rota; erro sempre como
 * `{ error: { code, message } }`, sem detalhe técnico (o detalhe vai para o log).
 */

import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireMember } from "@/lib/auth/server"
import { HttpError, toPublicError } from "@/lib/auth/http-error"
import type { Permission } from "@/lib/auth/permissions"
import { formatCNJ, onlyDigits } from "@/lib/processos/cnj"
import type { Process } from "@/types"
import { ENRICHMENT_MESSAGES, EnrichmentError } from "./service"

const NO_STORE = { "Cache-Control": "no-store" }

/** Por pessoa e por escritório (cada consulta nova pode ir a fontes externas). */
export const ENRICHMENT_RULES = {
  user: { id: "consulta:user", limit: 20, windowSeconds: 600 },
  organization: { id: "consulta:org", limit: 300, windowSeconds: 86_400 },
}

export const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: NO_STORE })

export async function enrichmentRoute(permission: Permission, handler: (member: Awaited<ReturnType<typeof requireMember>>) => Promise<Response>) {
  try {
    return await handler(await requireMember(permission))
  } catch (error) {
    if (error instanceof EnrichmentError) {
      const { status, message } = ENRICHMENT_MESSAGES[error.code]
      if (status >= 500) console.error("[consulta]", error.code, error.detail ?? "")
      return respond({ error: { code: error.code, message } }, status)
    }
    const { status, message, logged } = toPublicError(error)
    if (logged || !(error instanceof HttpError)) console.error("[consulta] erro inesperado", error)
    return respond({ error: { code: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "UNEXPECTED", message } }, status)
  }
}

/** Id interno de processo (`p_102938`). */
export const PROCESS_ID = /^[A-Za-z0-9_-]{1,64}$/
export const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Processo do escritório, com a sessão de quem chama (RLS). */
export async function readOfficeProcess(session: SupabaseClient, processId: string): Promise<Process | null> {
  const { data, error } = await session.from("processes").select("data").eq("id", processId).maybeSingle<{ data: Process }>()
  if (error) throw new EnrichmentError("UNAVAILABLE", `processo: ${error.code} ${error.message}`)
  return data?.data ?? null
}

/** Processo do escritório com este número (pelo CNJ salvo ou pelo número formatado). */
export async function findOfficeProcess(session: SupabaseClient, cnj: string): Promise<Process | null> {
  const digits = onlyDigits(cnj)
  const { data, error } = await session
    .from("processes")
    .select("data")
    .or(`data->>cnj.eq.${digits},data->>number.eq."${formatCNJ(digits)}"`)
    .limit(1)
    .maybeSingle<{ data: Process }>()
  if (error) throw new EnrichmentError("UNAVAILABLE", `processo por número: ${error.code} ${error.message}`)
  return data?.data ?? null
}

export async function clientNameOf(session: SupabaseClient, clientId?: string): Promise<string | undefined> {
  if (!clientId) return undefined
  const { data } = await session.from("clients").select("data").eq("id", clientId).maybeSingle<{ data: { name?: string } }>()
  return data?.data?.name
}
