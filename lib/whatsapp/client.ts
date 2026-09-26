"use client"

/**
 * Central de Atendimento no navegador.
 *
 * Leitura: direto do Supabase (a RLS só entrega o escritório de quem está logado).
 * Escrita: sempre pelas rotas `/api/whatsapp/*`, que checam permissão e falam com a
 * Z-API — nenhuma credencial do WhatsApp chega aqui.
 */

import { getSupabase } from "@/lib/supabase/client"
import { safeFileName } from "./files"
import {
  CONVERSATION_SELECT,
  MESSAGE_SELECT,
  toConversation,
  toMessage,
  toTag,
  type ConversationRow,
  type MessageRow,
  type TagRow,
} from "./mappers"
import type { WhatsAppAttachment, WhatsAppConversation, WhatsAppInstance, WhatsAppMessage, WhatsAppTag } from "@/types"

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new Error("Sem conexão com o LEXA. Verifique a internet e tente de novo.")
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Não foi possível concluir a ação.")
  return data as T
}

export interface InstanceInfo {
  instance: WhatsAppInstance | null
  live: { connected: boolean; smartphoneConnected?: boolean; error?: string } | null
  canManage: boolean
  missing: string[]
  webhookUrl: string | null
  webhookHttps: boolean | null
}

export interface SendPayload {
  id: string
  type: "text" | "image" | "document" | "audio" | "note"
  text?: string
  replyToId?: string
  attachment?: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number; durationSeconds?: number }
}

export type AiAction = "summary" | "reply" | "tasks" | "processes" | "documents" | "internal_summary"

export type AiResponse =
  | { action: "summary"; result: { summary: string; keyPoints: string[]; pendingQuestions: string[] } }
  | { action: "reply"; result: { reply: string; rationale: string } }
  | { action: "tasks"; result: { tasks: { title: string; description: string; dueInDays: number | null; priority: "alta" | "media" | "baixa" }[] } }
  | {
      action: "processes"
      result: { mentions: { reference: string; processNumber: string | null; note: string }[]; suggestion: string }
      processes?: { number: string }[]
    }
  | { action: "documents"; result: { documents: { fileName: string; kind: string; summary: string; relevantFacts: string[]; concerns: string[] }[] } }
  | { action: "internal_summary"; result: { note: string } }

export const whatsappApi = {
  instance: () => api<InstanceInfo>("/api/whatsapp/instance"),
  qrCode: () => api<{ image?: string; needsPasskey?: boolean }>("/api/whatsapp/instance/qr"),
  registerWebhooks: () => api<{ ok: true }>("/api/whatsapp/instance", { method: "POST", body: { action: "webhooks" } }),

  async send(conversationId: string, payload: SendPayload) {
    const { message } = await api<{ message: MessageRow }>(`/api/whatsapp/conversations/${conversationId}/messages`, { method: "POST", body: payload })
    return toMessage(message)
  },
  async retry(messageId: string) {
    const { message } = await api<{ message: MessageRow }>(`/api/whatsapp/messages/${messageId}/retry`, { method: "POST" })
    return toMessage(message)
  },
  async update(
    conversationId: string,
    patch: { status?: string; assignedUserId?: string | null; read?: boolean; addTagIds?: string[]; removeTagIds?: string[] },
  ) {
    const { conversation } = await api<{ conversation: ConversationRow }>(`/api/whatsapp/conversations/${conversationId}`, { method: "PATCH", body: patch })
    return toConversation(conversation)
  },
  async start(input: { phone: string; name?: string; clientId?: string }) {
    const { conversation } = await api<{ conversation: ConversationRow }>("/api/whatsapp/conversations", { method: "POST", body: input })
    return toConversation(conversation)
  },
  updateContact: (contactId: string, patch: { clientId?: string | null; name?: string | null }) =>
    api<{ ok: true }>(`/api/whatsapp/contacts/${contactId}`, { method: "PATCH", body: patch }),
  async createTag(input: { name: string; color: string }) {
    const { tag } = await api<{ tag: TagRow }>("/api/whatsapp/tags", { method: "POST", body: input })
    return toTag(tag)
  },
  deleteTag: (tagId: string) => api<{ ok: true }>(`/api/whatsapp/tags/${tagId}`, { method: "DELETE" }),
  aiStatus: () => api<{ configured: boolean }>("/api/whatsapp/ai"),
  ai: (conversationId: string, action: AiAction) => api<AiResponse>("/api/whatsapp/ai", { method: "POST", body: { conversationId, action } }),
}

/* --------------------------------- Leitura -------------------------------- */

const CONVERSATION_LIMIT = 500
export const MESSAGE_PAGE = 60

export async function fetchConversations(): Promise<WhatsAppConversation[]> {
  const { data, error } = await getSupabase()
    .from("whatsapp_conversations")
    .select(CONVERSATION_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(CONVERSATION_LIMIT)
  if (error) throw error
  return (data as ConversationRow[]).map((row) => toConversation(row))
}

export async function fetchConversation(id: string): Promise<WhatsAppConversation | null> {
  const { data } = await getSupabase().from("whatsapp_conversations").select(CONVERSATION_SELECT).eq("id", id).maybeSingle()
  return data ? toConversation(data as ConversationRow) : null
}

export async function fetchTags(): Promise<WhatsAppTag[]> {
  const { data, error } = await getSupabase().from("whatsapp_tags").select("id, name, color").order("name")
  if (error) throw error
  return (data as TagRow[]).map(toTag)
}

/** Página de mensagens, da mais antiga para a mais nova. `before` pagina para trás. */
export async function fetchMessages(conversationId: string, before?: string): Promise<WhatsAppMessage[]> {
  let query = getSupabase()
    .from("whatsapp_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(MESSAGE_PAGE)
  if (before) query = query.lt("sent_at", before)
  const { data, error } = await query
  if (error) throw error
  return (data as MessageRow[]).map(toMessage).reverse()
}

export async function fetchMessage(id: string): Promise<WhatsAppMessage | null> {
  const { data } = await getSupabase().from("whatsapp_messages").select(MESSAGE_SELECT).eq("id", id).maybeSingle()
  return data ? toMessage(data as MessageRow) : null
}

/* --------------------------------- Arquivos ------------------------------- */

const signed = new Map<string, { url: string; expires: number }>()

/** Endereço para exibir um anexo: cópia do escritório (link de 10 min) ou a da Z-API. */
export async function attachmentUrl(attachment: WhatsAppAttachment, { download = false } = {}): Promise<string | null> {
  if (attachment.storagePath) {
    const key = `${attachment.storagePath}:${download}`
    const cached = signed.get(key)
    if (cached && cached.expires > Date.now()) return cached.url
    const { data } = await getSupabase()
      .storage.from("whatsapp")
      .createSignedUrl(attachment.storagePath, 600, download ? { download: attachment.fileName ?? true } : undefined)
    if (data?.signedUrl) {
      signed.set(key, { url: data.signedUrl, expires: Date.now() + 540_000 })
      return data.signedUrl
    }
  }
  return attachment.remoteUrl ?? null
}

/** Sobe um arquivo para a pasta de saída do escritório (a Z-API recebe um link assinado). */
export async function uploadOutgoing(organizationId: string, file: Blob, fileName: string) {
  const path = `${organizationId}/outgoing/${crypto.randomUUID()}/${safeFileName(fileName, "arquivo", file.type)}`
  const { error } = await getSupabase().storage.from("whatsapp").upload(path, file, { contentType: file.type || "application/octet-stream" })
  if (error) throw new Error("Não foi possível enviar o arquivo. Verifique sua permissão e a conexão.")
  return path
}
