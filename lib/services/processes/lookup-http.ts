/**
 * Parte HTTP comum às rotas de consulta: autorização, leitura do corpo e
 * tradução do resultado para o contrato público (`lookup-contract.ts`).
 *
 * Aqui é a fronteira dos erros: o `LookupError` (com detalhe técnico) fica no
 * log do serviço; para o navegador vai só `reason` + mensagem amigável.
 * Somente servidor.
 */

import { after, NextResponse } from "next/server"
import { authorizeMember } from "@/lib/auth/server"
import { LOOKUP_MESSAGES, LookupError, publicLookupError } from "@/lib/integrations/legal/errors"
import { createSupabaseServer } from "@/lib/supabase/server"
import { MAX_CNJ_INPUT, type LookupBody } from "./lookup-contract"
import { supabaseLookupStore } from "./lookup-cache"
import { processLookup } from "./process-lookup"
import type { LookupRequest } from "./lookup-service"

const NO_STORE = { "Cache-Control": "no-store" }

const json = (body: LookupBody, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

type Policy = Pick<LookupRequest, "maxAgeMs" | "staleWhileRevalidate">

/** `policy` recebe o corpo da requisição (ex.: `{ force: true }` no botão "Atualizar"). */
export async function handleLookup(request: Request, policy: (body: Record<string, unknown>) => Policy, label: string) {
  const auth = await authorizeMember("processes.edit")
  if ("response" in auth) return auth.response

  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await request.json()
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>
  } catch {}
  const { cnj } = body
  if (typeof cnj !== "string" || cnj.length > MAX_CNJ_INPUT) {
    return json({ ok: false, reason: "invalid", message: LOOKUP_MESSAGES.invalid }, 400)
  }

  try {
    const result = await processLookup.lookup({
      ...policy(body),
      cnj,
      organizationId: auth.organizationId,
      store: supabaseLookupStore(await createSupabaseServer()),
      // A atualização em segundo plano continua depois que a resposta sai.
      defer: (task) => after(() => task),
    })
    return json({ ok: true, sheet: result.sheet, checkedAt: result.checkedAt, refreshing: result.revalidating })
  } catch (error) {
    // `LookupError` já foi registrado pelo serviço; o resto é falha inesperada (banco, bug).
    if (!(error instanceof LookupError)) console.error(`[process-lookup] ${label} erro inesperado`, error)
    const publicError = publicLookupError(error)
    return json({ ok: false, reason: publicError.reason, message: publicError.message }, publicError.status)
  }
}
