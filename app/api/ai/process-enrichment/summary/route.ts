/** POST /api/ai/process-enrichment/summary — { runId } → resumo da consulta (fatos, inferências, ausentes). */

import { aiRoute } from "@/lib/ai/http"
import { AIError } from "@/lib/ai/errors"
import { summarizeEnrichment } from "@/lib/ai/services/enrichment"
import { RUN_ID } from "@/lib/services/consulta/http"
import { readRun } from "@/lib/services/consulta/store"
import { createSupabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", async ({ body, deps }) => {
  const runId = (body as { runId?: unknown })?.runId
  if (typeof runId !== "string" || !RUN_ID.test(runId)) throw new AIError("BAD_REQUEST")
  // Sessão de quem chama: a RLS só entrega consultas do próprio escritório.
  return summarizeEnrichment(deps, await readRun(await createSupabaseServer(), runId))
})
