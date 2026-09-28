/** GET /api/whatsapp/instance/qr — QR Code para conectar o WhatsApp do escritório. */

import { NextResponse } from "next/server"
import { HttpError, route } from "@/lib/auth/server"
import { ZapiError } from "@/lib/integrations/whatsapp/zapi/client"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { instanceForOrg, providerFor } from "@/lib/services/whatsapp/instances"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const actor = await requireActor("office.manage")
  const instance = await instanceForOrg(actor.organizationId)
  if (!instance) throw new HttpError(409, "O WhatsApp do escritório ainda não está configurado no servidor.")
  try {
    const qr = await providerFor(instance).qrCode()
    return NextResponse.json(qr, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof ZapiError) throw new HttpError(502, error.message)
    throw error
  }
})
