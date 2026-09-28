/**
 * GET  /api/whatsapp/ai — a Lexa IA está configurada?
 * POST /api/whatsapp/ai — { conversationId, action } → sugestão da IA (nunca executa nada).
 */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { aiConfigured, runAssistant, type AiAction } from "@/lib/services/whatsapp/ai"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export const GET = route(async () => {
  await requireActor("whatsapp.view")
  return NextResponse.json({ configured: aiConfigured() })
})

export const POST = route(async (request) => {
  const actor = await requireActor("whatsapp.view")
  const { conversationId, action } = await readJson<{ conversationId?: string; action?: AiAction }>(request)
  const result = await runAssistant(actor, String(conversationId ?? ""), action as AiAction)
  return NextResponse.json(result)
})
