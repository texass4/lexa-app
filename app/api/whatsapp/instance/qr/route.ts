/** GET /api/whatsapp/instance/qr — QR Code para conectar o WhatsApp do escritório. */

import { NextResponse } from "next/server"
import { HttpError, route } from "@/lib/auth/server"
import { ZapiError } from "@/lib/integrations/whatsapp/zapi/client"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { instanceForOrg, NOT_ACTIVATED, providerFor } from "@/lib/services/whatsapp/instances"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const actor = await requireActor("office.manage")
  const instance = await instanceForOrg(actor.organizationId)
  if (!instance) throw new HttpError(409, NOT_ACTIVATED)
  try {
    const provider = await providerFor(instance)
    // O WhatsApp oficial não usa QR Code: o número é vinculado com os dados da Meta.
    if (!provider.qrCode) throw new HttpError(409, "Este número é conectado pelos dados da Meta, sem QR Code.")
    const qr = await provider.qrCode()
    return NextResponse.json(qr, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof ZapiError) throw new HttpError(502, error.message)
    throw error
  }
})
