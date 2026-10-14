/**
 * POST   /api/whatsapp/instance/meta — { businessAccountId, phoneNumberId, accessToken? }:
 *        vincula ou revalida o número oficial do escritório (valida na Meta antes de salvar).
 * DELETE /api/whatsapp/instance/meta — desconecta (apaga o token; o histórico fica).
 *
 * Só quem administra o escritório. O token entra aqui e vai cifrado para o banco:
 * nunca volta em nenhuma resposta.
 */

import { NextResponse } from "next/server"
import { readJson, route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { connectMeta, disconnectMeta, type MetaConnectInput } from "@/lib/services/whatsapp/meta-connection"
import { toInstance } from "@/lib/whatsapp/mappers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
  const actor = await requireActor("office.manage")
  const input = await readJson<MetaConnectInput>(request)
  const instance = await connectMeta(actor, input)
  return NextResponse.json({ instance: toInstance(instance) }, { headers: { "Cache-Control": "no-store" } })
})

export const DELETE = route(async () => {
  const actor = await requireActor("office.manage")
  const instance = await disconnectMeta(actor)
  return NextResponse.json({ instance: toInstance(instance) })
})
