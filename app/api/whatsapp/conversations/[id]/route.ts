/** PATCH /api/whatsapp/conversations/:id — status, responsável, lida, tags. */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { updateConversation, type ConversationPatch } from "@/lib/services/whatsapp/conversations"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export const PATCH = route<Context>(async (request, { params }) => {
  // Cada campo confere a própria permissão (ver o serviço); ver a conversa é o mínimo.
  const actor = await requireActor("whatsapp.view")
  const { id } = await params
  const conversation = await updateConversation(actor, id, await readJson<ConversationPatch>(request))
  return NextResponse.json({ conversation })
})
