/**
 * Tradução dos webhooks da Z-API para `WebhookEvent`.
 *
 * Tipos tratados (campo `type` do corpo):
 *   ReceivedCallback        mensagem recebida (ou enviada pelo celular, com `fromMe`)
 *   MessageStatusCallback   SENT, RECEIVED (entregue), READ, READ_BY_ME, PLAYED
 *   DeliveryCallback        resultado do envio (com `error` quando falhou)
 *   ConnectedCallback / DisconnectedCallback
 *
 * Grupos, canais, status (stories) e reações ficam de fora: a Central é 1:1.
 */

import type { InboundMedia, WebhookEvent } from "../types"
import type { MessageType } from "@/types"

type Json = Record<string, unknown>

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined)
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)
const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined)

/** `momment` vem em milissegundos na maioria dos eventos e em segundos em alguns. */
export function momentToISO(value: unknown, now: Date = new Date()): string {
  const n = num(value)
  if (!n) return now.toISOString()
  return new Date(n < 1e12 ? n * 1000 : n).toISOString()
}

const cleanPhone = (value: unknown) => str(value)?.replace(/\D/g, "")

function messageContent(body: Json): { type: MessageType; body?: string; media?: InboundMedia } {
  const text = obj(body.text)
  if (text) return { type: "text", body: str(text.message) }

  const image = obj(body.image)
  if (image)
    return {
      type: "image",
      body: str(image.caption),
      media: {
        kind: "image",
        url: str(image.imageUrl),
        thumbnailUrl: str(image.thumbnailUrl),
        mimeType: str(image.mimeType),
        width: num(image.width),
        height: num(image.height),
      },
    }

  const audio = obj(body.audio)
  if (audio)
    return {
      type: "audio",
      media: {
        kind: "audio",
        url: str(audio.audioUrl),
        mimeType: str(audio.mimeType),
        durationSeconds: num(audio.seconds),
        voiceNote: audio.ptt === true,
      },
    }

  const video = obj(body.video)
  if (video)
    return {
      type: "video",
      body: str(video.caption),
      media: { kind: "video", url: str(video.videoUrl), mimeType: str(video.mimeType), durationSeconds: num(video.seconds) },
    }

  const document = obj(body.document)
  if (document)
    return {
      type: "document",
      body: str(document.caption),
      media: {
        kind: "document",
        url: str(document.documentUrl),
        mimeType: str(document.mimeType),
        fileName: str(document.fileName) ?? str(document.title),
        pageCount: num(document.pageCount),
      },
    }

  const sticker = obj(body.sticker)
  if (sticker) return { type: "sticker", media: { kind: "sticker", url: str(sticker.stickerUrl), mimeType: str(sticker.mimeType) } }

  const location = obj(body.location)
  if (location) {
    const lat = num(location.latitude)
    const lng = num(location.longitude)
    const label = [str(location.name), str(location.address)].filter(Boolean).join(" — ")
    const link = lat !== undefined && lng !== undefined ? `https://maps.google.com/?q=${lat},${lng}` : undefined
    return { type: "location", body: [label, link].filter(Boolean).join("\n") || undefined }
  }

  const contact = obj(body.contact)
  if (contact) {
    const phones = Array.isArray(contact.phones) ? contact.phones.filter((p) => typeof p === "string").join(", ") : ""
    return { type: "contact", body: [str(contact.displayName), phones].filter(Boolean).join(" · ") || undefined }
  }

  return { type: "unsupported" }
}

export function parseZapiWebhook(payload: unknown, now: Date = new Date()): WebhookEvent {
  const body = obj(payload)
  if (!body) return { kind: "ignored", reason: "corpo inválido" }
  const instanceExternalId = str(body.instanceId)
  if (!instanceExternalId) return { kind: "ignored", reason: "sem instanceId" }
  const at = momentToISO(body.momment, now)

  switch (body.type) {
    case "ReceivedCallback": {
      if (body.isGroup === true || body.isNewsletter === true || body.broadcast === true || body.isStatusReply === true)
        return { kind: "ignored", instanceExternalId, reason: "grupo, canal ou status" }
      if (obj(body.reaction)) return { kind: "ignored", instanceExternalId, reason: "reação" }
      const phone = cleanPhone(body.phone)
      const messageId = str(body.messageId)
      if (!phone || !messageId || /@|-group/.test(String(body.phone))) return { kind: "ignored", instanceExternalId, reason: "sem telefone ou id" }

      const fromMe = body.fromMe === true
      const content = messageContent(body)
      return {
        kind: "message",
        instanceExternalId,
        messageId,
        phone,
        fromMe,
        at,
        // Em mensagens enviadas por nós, `senderName` é o próprio escritório; o nome
        // do contato está em `chatName`.
        contactName: fromMe ? str(body.chatName) : (str(body.senderName) ?? str(body.chatName)),
        contactPhoto: str(body.photo) ?? (fromMe ? undefined : str(body.senderPhoto)),
        ...content,
        replyToProviderId: str(body.referenceMessageId),
        isEdit: body.isEdit === true,
      }
    }

    case "MessageStatusCallback": {
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && !!id) : []
      const map = { SENT: "sent", RECEIVED: "delivered", READ: "read", PLAYED: "played", READ_BY_ME: "read_by_me" } as const
      const status = map[String(body.status) as keyof typeof map]
      if (!ids.length || !status || body.isGroup === true) return { kind: "ignored", instanceExternalId, reason: "status sem ids ou desconhecido" }
      return { kind: "status", instanceExternalId, ids, status, at }
    }

    case "DeliveryCallback":
      return {
        kind: "delivery",
        instanceExternalId,
        messageId: str(body.messageId),
        providerId: str(body.zaapId),
        error: str(body.error),
        at,
      }

    case "ConnectedCallback":
      return { kind: "connection", instanceExternalId, connected: body.connected !== false, phone: cleanPhone(body.phone), at }

    case "DisconnectedCallback":
      return { kind: "connection", instanceExternalId, connected: false, detail: str(body.error), at }

    default:
      return { kind: "ignored", instanceExternalId, reason: `tipo ${String(body.type)}` }
  }
}
