/**
 * GET /api/whatsapp/instance — conexão do WhatsApp oficial do escritório (verificada na Meta).
 *     `?check=1` força a verificação agora (senão, no máximo a cada 5 min).
 *
 * Nenhuma credencial sai daqui: só os ids públicos da Meta e se há token salvo — nunca o token.
 * Vincular e desconectar o número: `/api/whatsapp/instance/meta`.
 */

import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireActor } from "@/lib/services/whatsapp/actor"
import { hasAccessToken } from "@/lib/services/whatsapp/credentials"
import { instanceForOrg, metaPlatformSetup, refreshInstanceStatus } from "@/lib/services/whatsapp/instances"
import { toInstance } from "@/lib/whatsapp/mappers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CHECK_FAILED = "Não foi possível verificar a conexão do WhatsApp. Tente novamente em instantes."

export const GET = route(async (request) => {
  const actor = await requireActor("whatsapp.view")
  const canManage = actor.can("office.manage")
  const platform = metaPlatformSetup()
  if (canManage && !platform.ready) console.warn("[whatsapp] WhatsApp oficial sem configuração da plataforma. Faltam:", platform.missing.join(", "))

  let instance = await instanceForOrg(actor.organizationId)
  const hasToken = instance ? await hasAccessToken(instance) : false

  let live: { connected: boolean; error?: string } | null = null
  if (instance && hasToken) {
    try {
      instance = await refreshInstanceStatus(instance, { force: request.nextUrl.searchParams.get("check") === "1" })
      live = { connected: instance.status === "connected", ...(instance.status === "error" ? { error: instance.status_detail ?? CHECK_FAILED } : {}) }
    } catch (error) {
      console.error("[whatsapp] Falha ao consultar a conexão:", error)
      live = { connected: false, error: CHECK_FAILED }
    }
  }

  return NextResponse.json({
    instance: instance ? toInstance(instance) : null,
    live,
    canManage,
    // A plataforma está pronta e o escritório salvou o token (os nomes do que falta ficam no log).
    activated: platform.ready && hasToken,
    meta: { platformReady: platform.ready, hasToken },
  })
})
