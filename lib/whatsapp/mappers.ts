/**
 * Linhas das tabelas `whatsapp_*` (snake_case, como o Supabase devolve) → entidades
 * do LEXA (camelCase, `types/whatsapp.ts`). Usado no navegador e no servidor.
 */

import type {
  MessageDirection,
  MessageStatus,
  WhatsAppAttachment,
  WhatsAppContact,
  WhatsAppConversation,
  WhatsAppInstance,
  WhatsAppMessage,
  WhatsAppTag,
} from "@/types"

type Nullable<T> = { [K in keyof T]: T[K] | null }

export type InstanceRow = Nullable<{
  id: string
  organization_id: string
  provider: "zapi"
  external_id: string
  name: string
  phone: string
  status: WhatsAppInstance["status"]
  status_detail: string
  connected_at: string
  last_event_at: string
}>

export type ContactRow = Nullable<{
  id: string
  organization_id: string
  phone: string
  name: string
  push_name: string
  avatar_url: string
  client_id: string
  created_at: string
}>

export type ConversationRow = Nullable<{
  id: string
  organization_id: string
  instance_id: string
  contact_id: string
  status: string
  assigned_user_id: string
  unread_count: number
  last_message_at: string
  last_message_preview: string
  last_message_direction: MessageDirection
  last_message_status: MessageStatus
  last_inbound_at: string
  resolved_at: string
  created_at: string
}> & {
  contact?: ContactRow | null
  tags?: { tag_id: string }[] | null
}

export type AttachmentRow = Nullable<{
  id: string
  organization_id: string
  message_id: string
  kind: WhatsAppAttachment["kind"]
  mime_type: string
  file_name: string
  size_bytes: number
  storage_path: string
  remote_url: string
  thumbnail_url: string
  duration_seconds: number
  width: number
  height: number
  page_count: number
  voice_note: boolean
  download_status: WhatsAppAttachment["downloadStatus"]
}>

export type MessageRow = Nullable<{
  id: string
  organization_id: string
  conversation_id: string
  direction: MessageDirection
  type: WhatsAppMessage["type"]
  body: string
  status: MessageStatus
  error: string
  provider_message_id: string
  reply_to_message_id: string
  reply_to_provider_id: string
  sent_by_user_id: string
  from_device: boolean
  sent_at: string
  delivered_at: string
  read_at: string
  failed_at: string
  edited_at: string
}> & { attachments?: AttachmentRow[] | null }

export type TagRow = { id: string; name: string; color: string }

const opt = <T>(value: T | null | undefined) => (value === null ? undefined : value)

export const CONVERSATION_SELECT = "*, contact:whatsapp_contacts(*), tags:whatsapp_conversation_tags(tag_id)"
export const MESSAGE_SELECT = "*, attachments:whatsapp_message_attachments(*)"

export function toInstance(row: InstanceRow): WhatsAppInstance {
  return {
    id: row.id!,
    organizationId: row.organization_id!,
    provider: row.provider ?? "zapi",
    externalId: row.external_id!,
    name: row.name ?? "WhatsApp",
    phone: opt(row.phone),
    status: row.status ?? "unknown",
    statusDetail: opt(row.status_detail),
    connectedAt: opt(row.connected_at),
    lastEventAt: opt(row.last_event_at),
  }
}

export function toContact(row: ContactRow): WhatsAppContact {
  return {
    id: row.id!,
    organizationId: row.organization_id!,
    phone: row.phone!,
    name: opt(row.name),
    pushName: opt(row.push_name),
    avatarUrl: opt(row.avatar_url),
    clientId: opt(row.client_id),
    createdAt: row.created_at!,
  }
}

export function toConversation(row: ConversationRow, contact?: WhatsAppContact): WhatsAppConversation {
  return {
    id: row.id!,
    organizationId: row.organization_id!,
    instanceId: row.instance_id!,
    contact: contact ?? toContact(row.contact ?? ({ id: row.contact_id, organization_id: row.organization_id, phone: "" } as ContactRow)),
    status: row.status ?? "new",
    assignedUserId: opt(row.assigned_user_id),
    unreadCount: row.unread_count ?? 0,
    lastMessageAt: opt(row.last_message_at),
    lastMessagePreview: opt(row.last_message_preview),
    lastMessageDirection: opt(row.last_message_direction),
    lastMessageStatus: opt(row.last_message_status),
    lastInboundAt: opt(row.last_inbound_at),
    resolvedAt: opt(row.resolved_at),
    createdAt: row.created_at!,
    tagIds: (row.tags ?? []).map((t) => t.tag_id),
  }
}

export function toAttachment(row: AttachmentRow): WhatsAppAttachment {
  return {
    id: row.id!,
    messageId: row.message_id!,
    kind: row.kind!,
    mimeType: opt(row.mime_type),
    fileName: opt(row.file_name),
    sizeBytes: opt(row.size_bytes),
    storagePath: opt(row.storage_path),
    remoteUrl: opt(row.remote_url),
    thumbnailUrl: opt(row.thumbnail_url),
    durationSeconds: opt(row.duration_seconds),
    width: opt(row.width),
    height: opt(row.height),
    pageCount: opt(row.page_count),
    voiceNote: row.voice_note ?? false,
    downloadStatus: row.download_status ?? "pending",
  }
}

export function toMessage(row: MessageRow): WhatsAppMessage {
  return {
    id: row.id!,
    organizationId: row.organization_id!,
    conversationId: row.conversation_id!,
    direction: row.direction!,
    type: row.type!,
    body: opt(row.body),
    status: row.status!,
    error: opt(row.error),
    providerMessageId: opt(row.provider_message_id),
    replyToMessageId: opt(row.reply_to_message_id),
    replyToProviderId: opt(row.reply_to_provider_id),
    sentByUserId: opt(row.sent_by_user_id),
    fromDevice: row.from_device ?? false,
    sentAt: row.sent_at!,
    deliveredAt: opt(row.delivered_at),
    readAt: opt(row.read_at),
    failedAt: opt(row.failed_at),
    editedAt: opt(row.edited_at),
    attachments: (row.attachments ?? []).map(toAttachment),
  }
}

export const toTag = (row: TagRow): WhatsAppTag => ({ id: row.id, name: row.name, color: row.color })
