/** DELETE /api/whatsapp/tags/:id — exclui a tag (sai de todas as conversas). */

import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { deleteTag } from "@/lib/services/whatsapp/conversations"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export const DELETE = route<Context>(async (_request, { params }) => {
  const actor = await requireActor("whatsapp.assign")
  const { id } = await params
  await deleteTag(actor, id)
  return NextResponse.json({ ok: true })
})
