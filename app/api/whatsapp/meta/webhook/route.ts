/**
 * Webhook da WhatsApp Business Cloud API (Meta) — um endereço para todos os escritórios.
 *
 * GET  — verificação inicial da Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`):
 *        devolve o challenge só se o token bater com `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
 * POST — mensagens e status. Autenticidade: `X-Hub-Signature-256` (HMAC-SHA256 do corpo
 *        bruto com `META_APP_SECRET`), conferida antes de ler o JSON. O escritório vem
 *        do Phone Number ID de cada item (`metadata.phone_number_id`), casado com o
 *        número que o escritório vinculou — nada no corpo escolhe escritório direto.
 *
 * Rota pública (a Meta não tem sessão), liberada no `proxy.ts`. Responde rápido; as
 * mídias são baixadas depois (`after`). Processamento idempotente: a Meta repete o
 * envio quando não recebe 200, e a mesma mensagem nunca entra duas vezes.
 * Nenhum token, segredo ou conteúdo de conversa vai para o log.
 */

import { after, NextResponse, type NextRequest } from "next/server"
import { parseMetaWebhook, redactMetaPayload, verifyChallenge, verifySignature } from "@/lib/integrations/whatsapp/meta/webhook"
import { handleWebhookEvent } from "@/lib/services/whatsapp/inbound"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** A Meta manda lotes pequenos; acima disso não é dela. */
const MAX_BODY = 2 * 1024 * 1024

export async function GET(request: NextRequest) {
  const challenge = verifyChallenge(request.nextUrl.searchParams, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim())
  if (!challenge) return new NextResponse("Forbidden", { status: 403 })
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appSecret) {
    console.error("[whatsapp/meta] META_APP_SECRET não definido: eventos da Meta recusados.")
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 })
  }
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 })

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength > MAX_BODY) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 })
  if (!verifySignature(body, request.headers.get("x-hub-signature-256"), appSecret)) {
    console.warn("[whatsapp/meta] Assinatura inválida ou ausente: evento recusado.")
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body).toString("utf8"))
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }

  const events = parseMetaWebhook(payload)
  const logged = redactMetaPayload(payload)
  const followUps: (() => Promise<void>)[] = []
  let failed = false
  for (const event of events) {
    try {
      const outcome = await handleWebhookEvent(event, logged)
      followUps.push(...outcome.followUps)
    } catch (error) {
      failed = true
      console.error("[whatsapp/meta] Falha ao processar evento:", event.kind, error instanceof Error ? error.message : error)
    }
  }
  if (followUps.length) {
    after(async () => {
      for (const run of followUps) await run()
    })
  }
  // 5xx faz a Meta repetir o lote inteiro; o que já entrou é ignorado na repetição.
  if (failed) return NextResponse.json({ error: "Falha ao processar o evento." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
