/** POST /api/ai/process/next-actions — { processId } → pontos de atenção e tarefas sugeridas (nada é gravado). */

import { aiRoute } from "@/lib/ai/http"
import { readId } from "@/lib/ai/input"
import { suggestNextActions } from "@/lib/ai/services/process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", ({ body, deps }) => suggestNextActions(deps, readId(body, "processId")))
