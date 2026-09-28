/** POST /api/whatsapp/conversations — inicia (ou reabre) a conversa com um número. */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { startConversation } from "@/lib/services/whatsapp/conversations"

export const runtime = "nodejs"

export const POST = route(async (request) => {
  const actor = await requireActor("whatsapp.edit")
  const conversation = await startConversation(actor, await readJson<{ phone?: string; name?: string; clientId?: string }>(request))
  return NextResponse.json({ conversation }, { status: 201 })
})
