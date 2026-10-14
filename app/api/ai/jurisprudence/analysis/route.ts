/** POST /api/ai/jurisprudence/analysis — { jurisprudenceId, processId?, query? } → Análise da Íntegra de uma decisão real. */

import { aiRoute } from "@/lib/ai/http"
import { readJurisprudenceInput } from "@/lib/ai/input"
import { analyzeJurisprudence } from "@/lib/ai/services/jurisprudence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", ({ body, deps }) => analyzeJurisprudence(deps, readJurisprudenceInput(body)))
