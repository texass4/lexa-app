/**
 * Webhook da WhatsApp Cloud API → eventos neutros da Íntegra (`WebhookEvent`).
 *
 * - Verificação inicial (GET): a Meta manda `hub.mode=subscribe`, `hub.verify_token`
 *   e `hub.challenge`; devolvemos o challenge só se o token bater.
 * - Assinatura (POST): `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 do corpo BRUTO
 *   com o App Secret. Conferida antes de ler o JSON (re-serializar muda os bytes).
 * - Um POST pode trazer várias mensagens e status, de números diferentes: cada item
 *   vira um evento, com o Phone Number ID (`metadata.phone_number_id`) — é ele que
 *   define o escritório, nunca outro campo do corpo.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import type { InboundMedia, WebhookEvent } from "../types"
import { metaErrorMessage } from "./client"
import type { MessageType } from "@/types"

function sameText(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** GET de verificação: o challenge a devolver, ou null (recusar). */
export function verifyChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token") ?? ""
  const challenge = params.get("hub.challenge")
  if (mode !== "subscribe" || !challenge || !sameText(token, verifyToken)) return null
  // A Meta manda um número; devolver exatamente o que veio (texto puro).
  return /^[A-Za-z0-9_-]{1,128}$/.test(challenge) ? challenge : null
}

/** Confere `X-Hub-Signature-256` sobre o corpo bruto. */
export function verifySignature(body: Uint8Array, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false
  const expected = createHmac("sha256", appSecret).update(body).digest("hex")
  const provided = header.slice("sha256=".length).trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(provided) && sameText(provided, expected)
}

type Obj = Record<string, unknown>
const obj = (value: unknown): Obj | undefined => (value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : undefined)
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined)
const digits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "") : "")

/** Unix (segundos, em texto) → ISO. Sem data válida, agora. */
function at(timestamp: unknown) {
  const seconds = Number(timestamp)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString()
}

const MEDIA_KINDS = ["image", "audio", "video", "document", "sticker"] as const

/** Conteúdo de uma mensagem recebida → tipo, texto e mídia da Íntegra. */
function content(message: Obj): { type: MessageType; body?: string; media?: InboundMedia } | null {
  const type = str(message.type)
  if (type === "text") return { type: "text", body: str(obj(message.text)?.body) }

  if (type && (MEDIA_KINDS as readonly string[]).includes(type)) {
    const media = obj(message[type]) ?? {}
    const kind = type as (typeof MEDIA_KINDS)[number]
    return {
      type: kind,
      body: str(media.caption),
      media: {
        kind,
        mediaId: str(media.id),
        mimeType: str(media.mime_type),
        fileName: str(media.filename),
        caption: str(media.caption),
        voiceNote: kind === "audio" ? media.voice === true : undefined,
      },
    }
  }

  if (type === "location") {
    const location = obj(message.location) ?? {}
    const lat = Number(location.latitude)
    const lng = Number(location.longitude)
    const label = [str(location.name), str(location.address)].filter(Boolean).join(" — ")
    const link = Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.google.com/?q=${lat},${lng}` : undefined
    return { type: "location", body: [label, link].filter(Boolean).join("\n") || undefined }
  }

  if (type === "contacts") {
    const names = arr(message.contacts).map((item) => {
      const contact = obj(item) ?? {}
      const name = str(obj(contact.name)?.formatted_name)
      const phones = arr(contact.phones).map((p) => str(obj(p)?.phone)).filter(Boolean).join(", ")
      return [name, phones].filter(Boolean).join(" · ")
    })
    return { type: "contact", body: names.filter(Boolean).join("\n") || undefined }
  }

  // Respostas a botões e listas viram texto (o que a pessoa tocou).
  if (type === "button") return { type: "text", body: str(obj(message.button)?.text) }
  if (type === "interactive") {
    const interactive = obj(message.interactive) ?? {}
    const reply = obj(interactive.button_reply) ?? obj(interactive.list_reply)
    return { type: "text", body: str(reply?.title) }
  }

  // Reações não viram mensagem na conversa (nesta etapa).
  if (type === "reaction") return null

  // `unsupported`, `system`, `order` e tipos novos: registra que chegou algo.
  return { type: "unsupported" }
}

/**
 * Corpo do webhook → eventos. Não confere assinatura (isso é da rota) e nunca lança:
 * item malformado vira `ignored`, para os outros do mesmo POST seguirem.
 */
export function parseMetaWebhook(payload: unknown): WebhookEvent[] {
  const root = obj(payload)
  if (root?.object !== "whatsapp_business_account") return [{ kind: "ignored", reason: "objeto diferente de whatsapp_business_account" }]
  const events: WebhookEvent[] = []

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const field = str(obj(change)?.field)
      const value = obj(obj(change)?.value)
      const phoneNumberId = str(obj(value?.metadata)?.phone_number_id)
      if (field !== "messages" || !value) {
        events.push({ kind: "ignored", instanceExternalId: phoneNumberId, reason: `campo ${field ?? "desconhecido"}` })
        continue
      }
      if (!phoneNumberId) {
        events.push({ kind: "ignored", reason: "sem phone_number_id" })
        continue
      }

      const names = new Map<string, string>()
      for (const item of arr(value.contacts)) {
        const contact = obj(item)
        const waId = digits(contact?.wa_id)
        const name = str(obj(contact?.profile)?.name)
        if (waId && name) names.set(waId, name)
      }

      for (const item of arr(value.messages)) {
        const message = obj(item)
        const id = str(message?.id)
        const from = digits(message?.from)
        if (!message || !id || !/^[0-9]{8,15}$/.test(from)) {
          events.push({ kind: "ignored", instanceExternalId: phoneNumberId, reason: "mensagem sem id ou remetente" })
          continue
        }
        const parsed = content(message)
        if (!parsed) {
          events.push({ kind: "ignored", instanceExternalId: phoneNumberId, reason: `tipo ${str(message.type)}` })
          continue
        }
        events.push({
          kind: "message",
          instanceExternalId: phoneNumberId,
          messageId: id,
          phone: from,
          fromMe: false,
          at: at(message.timestamp),
          contactName: names.get(from),
          type: parsed.type,
          body: parsed.body,
          media: parsed.media,
          replyToProviderId: str(obj(message.context)?.id),
          isEdit: false,
        })
      }

      for (const item of arr(value.statuses)) {
        const status = obj(item)
        const id = str(status?.id)
        const state = str(status?.status)
        if (!status || !id) continue
        const when = at(status.timestamp)
        if (state === "sent" || state === "delivered" || state === "read") {
          events.push({ kind: "status", instanceExternalId: phoneNumberId, ids: [id], status: state, at: when })
        } else if (state === "failed") {
          const error = obj(arr(status.errors)[0])
          const code = typeof error?.code === "number" ? error.code : undefined
          events.push({
            kind: "delivery",
            instanceExternalId: phoneNumberId,
            messageId: id,
            error: metaErrorMessage(code, 400),
            errorCode: code !== undefined ? String(code) : undefined,
            at: when,
          })
        } else {
          events.push({ kind: "ignored", instanceExternalId: phoneNumberId, reason: `status ${state ?? "desconhecido"}` })
        }
      }

      if (!arr(value.messages).length && !arr(value.statuses).length) {
        const errorCodes = arr(value.errors).map((e) => obj(e)?.code).filter((c) => c !== undefined)
        events.push({ kind: "ignored", instanceExternalId: phoneNumberId, reason: errorCodes.length ? `erros ${errorCodes.join(",")}` : "sem mensagens nem status" })
      }
    }
  }
  return events.length ? events : [{ kind: "ignored", reason: "sem entradas" }]
}

/**
 * Cópia do webhook para o registro de diagnóstico, sem o conteúdo das conversas:
 * ficam ids, tipos, horários, status e códigos de erro; textos, legendas, nomes,
 * localização e contatos compartilhados saem.
 */
export function redactMetaPayload(payload: unknown): unknown {
  const root = obj(payload)
  if (!root) return null
  return {
    object: root.object,
    entry: arr(root.entry).map((entry) => ({
      id: obj(entry)?.id,
      changes: arr(obj(entry)?.changes).map((change) => {
        const value = obj(obj(change)?.value) ?? {}
        return {
          field: obj(change)?.field,
          value: {
            metadata: { phone_number_id: obj(value.metadata)?.phone_number_id },
            messages: arr(value.messages).map((m) => {
              const message = obj(m) ?? {}
              return { id: message.id, type: message.type, timestamp: message.timestamp, context: obj(message.context) ? { id: obj(message.context)?.id } : undefined }
            }),
            statuses: arr(value.statuses).map((s) => {
              const status = obj(s) ?? {}
              return { id: status.id, status: status.status, timestamp: status.timestamp, errors: arr(status.errors).map((e) => ({ code: obj(e)?.code })) }
            }),
            errors: arr(value.errors).map((e) => ({ code: obj(e)?.code })),
          },
        }
      }),
    })),
  }
}
