/**
 * GET /api/process-enrichment/:id — uma execução da consulta (etapas, fontes e, ao
 * final, o relatório). Lida com a sessão de quem chama: a RLS só entrega execuções do
 * próprio escritório, e os erros técnicos internos nunca saem do banco.
 */

import { createSupabaseServer } from "@/lib/supabase/server"
import { RUN_ID, enrichmentRoute, respond } from "@/lib/services/consulta/http"
import { EnrichmentError } from "@/lib/services/consulta/service"
import { readRun } from "@/lib/services/consulta/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: RouteContext<"/api/process-enrichment/[id]">) {
  const { id } = await context.params
  return enrichmentRoute("processes.view", async () => {
    if (!RUN_ID.test(id)) throw new EnrichmentError("NOT_FOUND", "id inválido")
    const run = await readRun(await createSupabaseServer(), id)
    if (!run) throw new EnrichmentError("NOT_FOUND", "execução inexistente ou de outro escritório")
    return respond({ run })
  })
}
