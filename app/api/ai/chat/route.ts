/**
 * POST /api/ai/chat — { scope, messages, mode?, attachments? } → resposta da Íntegra IA.
 * `attachments`: até 3 { name, text } (texto lido no navegador); entram como dados, nunca como instruções.
 * `mode` (padrão "all"): "office" só dados do escritório; "jurisprudence" só a base de jurisprudência.
 * A permissão depende do escopo e é conferida ao carregar os dados (processo, cliente ou escritório).
 */

import { aiRoute } from "@/lib/ai/http"
import { readChatInput } from "@/lib/ai/input"
import { chat } from "@/lib/ai/services/chat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute(null, ({ body, deps }) => {
  const { scope, messages, mode, attachments } = readChatInput(body)
  return chat(deps, scope, messages, mode, attachments)
})
