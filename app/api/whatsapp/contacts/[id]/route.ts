/** PATCH /api/whatsapp/contacts/:id — vincula a um cliente ({ clientId }) ou renomeia ({ name }). */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { updateContact } from "@/lib/services/whatsapp/conversations"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export const PATCH = route<Context>(async (request, { params }) => {
  const actor = await requireActor("whatsapp.edit")
  const { id } = await params
  await updateContact(actor, id, await readJson<{ clientId?: string | null; name?: string | null }>(request))
  return NextResponse.json({ ok: true })
})
