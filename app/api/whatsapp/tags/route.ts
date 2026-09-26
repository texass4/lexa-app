/** POST /api/whatsapp/tags — cria uma tag do escritório. */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { createTag } from "@/lib/services/whatsapp/conversations"

export const runtime = "nodejs"

export const POST = route(async (request) => {
  const actor = await requireActor("whatsapp.edit")
  const tag = await createTag(actor, await readJson<{ name?: string; color?: string }>(request))
  return NextResponse.json({ tag }, { status: 201 })
})
