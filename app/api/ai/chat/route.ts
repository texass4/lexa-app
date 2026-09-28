/**
 * POST /api/ai/chat — { scope, messages } → resposta da LEXA IA.
 * A permissão depende do escopo e é conferida ao carregar os dados (processo, cliente ou escritório).
 */

import { aiRoute } from "@/lib/ai/http"
import { readChatInput } from "@/lib/ai/input"
import { chat } from "@/lib/ai/services/chat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute(null, ({ body, deps }) => {
  const { scope, messages } = readChatInput(body)
  return chat(deps, scope, messages)
})
