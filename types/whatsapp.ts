import type { ID } from "./index"

/* ------------------------ Central de Atendimento ------------------------- */

/**
 * Categoria de status. Os quatro status do sistema têm a própria categoria como
 * chave; status criados pelo escritório (`whatsapp_statuses`) apontam para uma delas.
 */
export type ConversationStatusCategory = "new" | "in_progress" | "waiting_client" | "resolved"

export interface ConversationStatusOption {
  key: string
  label: string
  category: ConversationStatusCategory
  color?: string
}

export interface WhatsAppInstance {
  id: ID
  organizationId: ID
  /** `meta`: WhatsApp Business Cloud API (oficial). `zapi`: conexão antiga removida (só histórico). */
  provider: "zapi" | "meta"
  /** Meta: Phone Number ID. */
  externalId: string
  /** Meta: WABA ID. */
  businessAccountId?: string
  name: string
  phone?: string
  /** `error`: configurada, mas a última verificação no provedor falhou. */
  status: "unknown" | "connected" | "disconnected" | "error"
  statusDetail?: string
  verifiedName?: string
  qualityRating?: string
  lastCheckedAt?: string
  connectedAt?: string
  lastEventAt?: string
}

export interface WhatsAppContact {
  id: ID
  organizationId: ID
  /** Só dígitos, com DDI. */
  phone: string
  /** Nome dado pelo escritório. */
  name?: string
  /** Nome do perfil do WhatsApp. */
  pushName?: string
  avatarUrl?: string
  /** Cliente do LEXA vinculado; ausente = contato novo. */
  clientId?: ID
  createdAt: string
}

export type MessageDirection = "inbound" | "outbound" | "internal"

export type MessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "location"
  | "contact"
  /** Nota interna — nunca vai para o WhatsApp. */
  | "note"
  /** Registro automático (mudou o status, o responsável…). */
  | "event"
  | "unsupported"

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "played" | "failed" | "received"

export type AttachmentKind = "image" | "document" | "audio" | "video" | "sticker"

export interface WhatsAppAttachment {
  id: ID
  messageId: ID
  kind: AttachmentKind
  mimeType?: string
  fileName?: string
  sizeBytes?: number
  /** Arquivo no bucket `whatsapp`; ausente enquanto o download não termina. */
  storagePath?: string
  /** Cópia temporária do provedor, até o arquivo ser guardado no Storage. */
  remoteUrl?: string
  thumbnailUrl?: string
  durationSeconds?: number
  width?: number
  height?: number
  pageCount?: number
  voiceNote: boolean
  downloadStatus: "pending" | "stored" | "failed"
}

export interface WhatsAppMessage {
  id: ID
  organizationId: ID
  conversationId: ID
  direction: MessageDirection
  type: MessageType
  body?: string
  status: MessageStatus
  error?: string
  providerMessageId?: string
  replyToMessageId?: ID
  replyToProviderId?: string
  sentByUserId?: ID
  /** Enviada direto pelo celular, fora do LEXA. */
  fromDevice: boolean
  sentAt: string
  deliveredAt?: string
  readAt?: string
  failedAt?: string
  editedAt?: string
  attachments: WhatsAppAttachment[]
}

export interface WhatsAppConversation {
  id: ID
  organizationId: ID
  instanceId: ID
  contact: WhatsAppContact
  status: string
  assignedUserId?: ID
  unreadCount: number
  lastMessageAt?: string
  lastMessagePreview?: string
  lastMessageDirection?: MessageDirection
  lastMessageStatus?: MessageStatus
  lastInboundAt?: string
  resolvedAt?: string
  createdAt: string
  tagIds: ID[]
}

export interface WhatsAppTag {
  id: ID
  name: string
  color: string
}
