/** POST /api/ai/jurisprudence/related — { processId, ids } → quais decisões encontradas se parecem com o processo. */

import { aiRoute } from "@/lib/ai/http"
import { readRelatedInput } from "@/lib/ai/input"
import { analyzeRelatedJurisprudence } from "@/lib/ai/services/jurisprudence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", ({ body, deps }) => analyzeRelatedJurisprudence(deps, readRelatedInput(body)))
