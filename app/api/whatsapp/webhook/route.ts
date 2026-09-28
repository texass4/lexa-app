/**
 * POST /api/whatsapp/webhook?token=… — eventos da Z-API (mensagens, status, conexão).
 *
 * Rota pública (a Z-API não tem sessão), liberada no `proxy.ts`. Autenticidade:
 *   1. A Z-API não assina os webhooks; por isso a URL cadastrada leva um segredo
 *      (`ZAPI_WEBHOOK_SECRET`), comparado em tempo constante.
 *   2. O `instanceId` do corpo precisa ser de uma instância conhecida — é ele que
 *      define o escritório. Nada no corpo escolhe escritório diretamente.
 *
 * Responde rápido; o download das mídias continua depois (`after`).
 */

import { timingSafeEqual } from "node:crypto"
import { after, NextResponse, type NextRequest } from "next/server"
import { parseZapiWebhook } from "@/lib/integrations/whatsapp/zapi/webhook"
import { handleWebhookEvent } from "@/lib/services/whatsapp/inbound"
import { envSetup } from "@/lib/services/whatsapp/instances"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_BODY = 1024 * 1024

function sameSecret(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const secret = envSetup().webhookSecret
  if (!secret) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 })
  const provided = request.nextUrl.searchParams.get("token") ?? request.headers.get("x-lexa-webhook-token") ?? ""
  if (!sameSecret(provided, secret)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })

  const text = await request.text()
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 })
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  try {
    const outcome = await handleWebhookEvent(parseZapiWebhook(payload), payload)
    if (outcome.followUps.length) {
      after(async () => {
        for (const run of outcome.followUps) await run()
      })
    }
    return NextResponse.json({ value: true, status: outcome.status })
  } catch (error) {
    console.error("[whatsapp/webhook]", error)
    // 5xx: a Z-API tenta de novo; o processamento é idempotente.
    return NextResponse.json({ error: "Falha ao processar o evento." }, { status: 500 })
  }
}
