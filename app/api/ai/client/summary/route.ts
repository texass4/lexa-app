/** POST /api/ai/client/summary — { clientId } → panorama do cliente. */

import { aiRoute } from "@/lib/ai/http"
import { readId } from "@/lib/ai/input"
import { summarizeClient } from "@/lib/ai/services/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("clients.view", ({ body, deps }) => summarizeClient(deps, readId(body, "clientId")))
