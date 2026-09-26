/** POST /api/ai/process/analyze-movement — { processId, movementId } → explicação da movimentação. */

import { aiRoute } from "@/lib/ai/http"
import { readId } from "@/lib/ai/input"
import { analyzeMovement } from "@/lib/ai/services/process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", ({ body, deps }) => analyzeMovement(deps, readId(body, "processId"), readId(body, "movementId")))
