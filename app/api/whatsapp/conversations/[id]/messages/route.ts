/**
 * POST /api/whatsapp/conversations/:id/messages — envia texto, imagem, documento ou
 * áudio pela Z-API, ou grava uma nota interna (que nunca vai para o WhatsApp).
 */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { sendMessage, type SendInput } from "@/lib/services/whatsapp/outbound"

export const runtime = "nodejs"
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

export const POST = route<Context>(async (request, { params }) => {
  const actor = await requireActor("whatsapp.edit")
  const { id } = await params
  const message = await sendMessage(actor, id, await readJson<SendInput>(request))
  return NextResponse.json({ message }, { status: 201 })
})
