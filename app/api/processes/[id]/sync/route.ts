/**
 * POST /api/processes/:id/sync — informações atualizadas de um processo salvo.
 *
 * Corpo: `{ cnj, force? }`.
 * - Sem `force` (atualização automática ao abrir o processo): usa o cache do
 *   escritório se ainda estiver fresco; senão, consulta a fonte.
 * - Com `force` (botão "Atualizar"): consulta a fonte, salvo se alguém do
 *   escritório acabou de fazer isso (`MIN_REFRESH_INTERVAL_MS`).
 *
 * A rota devolve a ficha atual; quem guarda os dados decide o que é novo,
 * comparando hashes (`diffMovements`). O `id` identifica o processo nos logs.
 */

import { NextResponse } from "next/server"
import { LOOKUP_MESSAGES } from "@/lib/integrations/legal/errors"
import { handleLookup } from "@/lib/services/processos/lookup-http"
import { FRESH_FOR_MS, MIN_REFRESH_INTERVAL_MS } from "@/lib/services/processos/lookup-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Id interno da Íntegra (`p_102938`, `p_abc123`). */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export async function POST(request: Request, context: RouteContext<"/api/processes/[id]/sync">) {
  const { id } = await context.params
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, reason: "invalid", message: LOOKUP_MESSAGES.invalid }, { status: 400 })
  }
  return handleLookup(request, (body) => ({ maxAgeMs: body.force === true ? MIN_REFRESH_INTERVAL_MS : FRESH_FOR_MS }), `sync ${id}`)
}
