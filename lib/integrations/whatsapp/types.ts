/**
 * Contrato neutro entre a Íntegra e um provedor de WhatsApp: a Cloud API oficial da
 * Meta (`meta/`) e, como legado, a Z-API (`zapi/`).
 *
 * Os serviços (`lib/services/whatsapp/*`) só conhecem estes tipos: trocar ou somar
 * um provedor é escrever outro adaptador que produza `WebhookEvent` e implemente
 * `WhatsAppProvider`, sem tocar em banco nem interface.
 */

import type { AttachmentKind, MessageStatus, MessageType } from "@/types"

export interface SendResult {
  /** Id da mensagem no WhatsApp (usado nos webhooks de status e em respostas). */
  messageId: string
  /** Id interno do provedor. */
  providerId?: string
}

export interface SendBase {
  phone: string
  /** Id no WhatsApp da mensagem citada (responder). */
  replyTo?: string
}

export interface WhatsAppProvider {
  sendText(input: SendBase & { text: string }): Promise<SendResult>
  sendImage(input: SendBase & { url: string; caption?: string }): Promise<SendResult>
  sendDocument(input: SendBase & { url: string; fileName: string; extension: string; caption?: string }): Promise<SendResult>
  sendAudio(input: SendBase & { url: string }): Promise<SendResult>
  markRead(input: { phone: string; messageId: string }): Promise<void>
  status(): Promise<{ connected: boolean; detail?: string; smartphoneConnected?: boolean }>
  /** Só provedores que conectam por QR Code (Z-API). */
  qrCode?(): Promise<{ image?: string; needsPasskey?: boolean }>
  /** Só provedores em que o webhook é cadastrado por conexão (Z-API). Na Meta, é no aplicativo. */
  configureWebhooks?(url: string): Promise<void>
  /** Mídia recebida que vem por id (Meta): baixa com a credencial do escritório. */
  downloadMedia?(mediaId: string): Promise<{ bytes: Uint8Array; mimeType?: string }>
  /** O provedor envia anexos pela Íntegra? (Meta: só texto nesta etapa.) */
  readonly sendsMedia?: boolean
}

export interface InboundMedia {
  kind: AttachmentKind
  url?: string
  /** Id da mídia no provedor (Meta): o arquivo é baixado depois, com a credencial. */
  mediaId?: string
  thumbnailUrl?: string
  mimeType?: string
  fileName?: string
  caption?: string
  durationSeconds?: number
  width?: number
  height?: number
  pageCount?: number
  voiceNote?: boolean
}

/** Evento de webhook já traduzido para o vocabulário da Íntegra. */
export type WebhookEvent =
  | {
      kind: "message"
      instanceExternalId: string
      messageId: string
      /** Contato da conversa (quem mandou, ou para quem foi quando `fromMe`). */
      phone: string
      /** Enviada pelo próprio número do escritório (celular ou Íntegra). */
      fromMe: boolean
      at: string
      contactName?: string
      contactPhoto?: string
      type: MessageType
      body?: string
      media?: InboundMedia
      replyToProviderId?: string
      isEdit: boolean
    }
  | {
      kind: "status"
      instanceExternalId: string
      ids: string[]
      /** `read_by_me`: o escritório leu no celular uma mensagem recebida. */
      status: Extract<MessageStatus, "sent" | "delivered" | "read" | "played"> | "read_by_me"
      at: string
    }
  | {
      kind: "delivery"
      instanceExternalId: string
      messageId?: string
      providerId?: string
      error?: string
      /** Código do erro no provedor (ex.: 131047), para a tela e o diagnóstico. */
      errorCode?: string
      at: string
    }
  | {
      kind: "connection"
      instanceExternalId: string
      connected: boolean
      phone?: string
      detail?: string
      at: string
    }
  | { kind: "ignored"; instanceExternalId?: string; reason: string }
