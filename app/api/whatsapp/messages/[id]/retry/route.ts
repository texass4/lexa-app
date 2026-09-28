/** POST /api/whatsapp/messages/:id/retry — reenvia uma mensagem que falhou. */

import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { retryMessage } from "@/lib/services/whatsapp/outbound"

export const runtime = "nodejs"
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

export const POST = route<Context>(async (_request, { params }) => {
  const actor = await requireActor("whatsapp.edit")
  const { id } = await params
  return NextResponse.json({ message: await retryMessage(actor, id) })
})
