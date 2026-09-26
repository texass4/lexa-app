/** POST /api/ai/process/summary — { processId } → resumo estruturado do processo. */

import { aiRoute } from "@/lib/ai/http"
import { readId } from "@/lib/ai/input"
import { summarizeProcess } from "@/lib/ai/services/process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", ({ body, deps }) => summarizeProcess(deps, readId(body, "processId")))
