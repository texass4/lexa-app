/**
 * GET  /api/whatsapp/instance — conexão do escritório (status ao vivo na Z-API).
 * POST /api/whatsapp/instance — { action: "webhooks" } cadastra a URL de webhook na Z-API.
 *
 * Nenhuma credencial sai daqui. A URL do webhook (que leva o segredo) só aparece
 * para quem administra o escritório, para colar no painel da Z-API se preciso.
 */

import { NextResponse, type NextRequest } from "next/server"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { ZapiError } from "@/lib/integrations/whatsapp/zapi/client"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { envSetup, instanceForOrg, NOT_ACTIVATED, providerFor, RECEIVING_NOT_ACTIVATED, refreshInstanceStatus } from "@/lib/services/whatsapp/instances"
import { toInstance } from "@/lib/whatsapp/mappers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function webhookUrl(request: NextRequest) {
  const secret = envSetup().webhookSecret
  if (!secret) return null
  const base = (process.env.ZAPI_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "")
  return `${base}/api/whatsapp/webhook?token=${encodeURIComponent(secret)}`
}

const CHECK_FAILED = "Não foi possível verificar a conexão do WhatsApp. Tente novamente em instantes."

export const GET = route(async (request) => {
  const actor = await requireActor("whatsapp.view")
  const canManage = actor.can("office.manage")
  const setup = envSetup()
  if (canManage && setup.missing.length) console.warn("[whatsapp] Conexão incompleta. Faltam no ambiente:", setup.missing.join(", "))
  let instance = await instanceForOrg(actor.organizationId)

  let live: { connected: boolean; smartphoneConnected?: boolean; error?: string } | null = null
  if (instance) {
    try {
      const refreshed = await refreshInstanceStatus(instance)
      instance = refreshed.instance
      live = { connected: instance.status === "connected", smartphoneConnected: refreshed.smartphoneConnected }
    } catch (error) {
      if (!(error instanceof ZapiError || error instanceof HttpError)) console.error("[whatsapp] Falha ao consultar a conexão:", error)
      live = { connected: false, error: error instanceof ZapiError || error instanceof HttpError ? error.message : CHECK_FAILED }
    }
  }

  const url = canManage ? webhookUrl(request) : null
  return NextResponse.json({
    instance: instance ? toInstance(instance) : null,
    live,
    canManage,
    // Só se a ativação está completa: os nomes do que falta ficam no log do servidor.
    activated: setup.missing.length === 0,
    webhookUrl: url,
    webhookHttps: url ? url.startsWith("https://") : null,
  })
})

export const POST = route(async (request) => {
  const actor = await requireActor("office.manage")
  const { action } = await readJson<{ action?: string }>(request)
  if (action !== "webhooks") throw new HttpError(400, "Ação inválida.")
  const instance = await instanceForOrg(actor.organizationId)
  if (!instance) throw new HttpError(409, NOT_ACTIVATED)
  const url = webhookUrl(request)
  if (!url) {
    console.error("[whatsapp] ZAPI_WEBHOOK_SECRET não definido: não há como cadastrar o webhook.")
    throw new HttpError(409, RECEIVING_NOT_ACTIVATED)
  }
  if (!url.startsWith("https://")) {
    console.error("[whatsapp] A Z-API só aceita webhooks HTTPS. Defina ZAPI_WEBHOOK_BASE_URL com o endereço público.")
    throw new HttpError(409, RECEIVING_NOT_ACTIVATED)
  }
  try {
    await providerFor(instance).configureWebhooks(url)
  } catch (error) {
    if (error instanceof ZapiError) throw new HttpError(502, error.message)
    throw error
  }
  return NextResponse.json({ ok: true })
})
