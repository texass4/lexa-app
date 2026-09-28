/**
 * Envio pela Central — servidor apenas.
 *
 *   Tela → POST /api/whatsapp/conversations/:id/messages → aqui → Z-API → WhatsApp
 *
 * A mensagem é gravada como `pending` antes de ir para a Z-API (a tela já mostra) e
 * vira `sent` ou `failed` com a resposta. Entregue/lida chegam depois, pelo webhook.
 * Notas internas são gravadas e param aqui: nunca chamam o provedor.
 */

import { HttpError } from "@/lib/auth/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { ZapiError } from "@/lib/integrations/whatsapp/zapi/client"
import type { SendResult } from "@/lib/integrations/whatsapp/types"
import { baseMime, extensionOf } from "@/lib/whatsapp/files"
import { MAX_ATTACHMENT_BYTES } from "@/lib/whatsapp/config"
import { MESSAGE_SELECT, type MessageRow } from "@/lib/whatsapp/mappers"
import { providerFor } from "./instances"
import { touchConversation } from "./inbound"
import { loadConversation, UUID, type Actor, type LoadedConversation } from "./actor"

const BUCKET = "whatsapp"
const MAX_TEXT = 4096
/** Tempo do link assinado que a Z-API usa para baixar o anexo. */
const SIGNED_URL_SECONDS = 60 * 60

export interface SendInput {
  /** Id gerado pela tela (evita duplicar se o pedido for repetido). */
  id?: string
  type: "text" | "image" | "document" | "audio" | "note"
  text?: string
  replyToId?: string
  attachment?: {
    storagePath: string
    fileName: string
    mimeType: string
    sizeBytes: number
    durationSeconds?: number
  }
}

const db = () => getSupabaseAdmin()

function validate(actor: Actor, input: SendInput) {
  if (!["text", "image", "document", "audio", "note"].includes(input.type)) throw new HttpError(400, "Tipo de mensagem inválido.")
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (text.length > MAX_TEXT) throw new HttpError(400, `A mensagem passa de ${MAX_TEXT} caracteres.`)
  if ((input.type === "text" || input.type === "note") && !text) throw new HttpError(400, "Escreva a mensagem.")
  if (input.id !== undefined && !UUID.test(input.id)) throw new HttpError(400, "Identificador inválido.")

  const needsFile = input.type === "image" || input.type === "document" || input.type === "audio"
  if (needsFile !== !!input.attachment) throw new HttpError(400, needsFile ? "Anexe o arquivo." : "Este tipo de mensagem não leva anexo.")
  if (input.attachment) {
    const { storagePath, fileName, mimeType, sizeBytes } = input.attachment
    // Só arquivos que a própria pessoa subiu na pasta de saída do escritório.
    if (typeof storagePath !== "string" || !storagePath.startsWith(`${actor.organizationId}/outgoing/`) || storagePath.includes(".."))
      throw new HttpError(400, "Arquivo inválido.")
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 200) throw new HttpError(400, "Nome de arquivo inválido.")
    if (typeof sizeBytes !== "number" || sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) throw new HttpError(400, "O arquivo passa de 64 MB.")
    const mime = baseMime(mimeType) ?? ""
    if (input.type === "image" && !["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new HttpError(400, "Envie imagens em JPG, PNG ou WEBP.")
    if (input.type === "audio" && !mime.startsWith("audio/")) throw new HttpError(400, "Arquivo de áudio inválido.")
  }
  return text
}

async function loadMessage(id: string) {
  const { data } = await db().from("whatsapp_messages").select(MESSAGE_SELECT).eq("id", id).single<MessageRow>()
  return data!
}

/** Manda para a Z-API uma mensagem já gravada como `pending` e grava o resultado. */
async function dispatch(
  conversation: LoadedConversation,
  message: { id: string; type: string; body: string | null; reply_to_message_id: string | null; sent_at: string },
) {
  const provider = providerFor(conversation.instance)
  const phone = conversation.contact.phone

  let replyTo: string | undefined
  if (message.reply_to_message_id) {
    const { data } = await db().from("whatsapp_messages").select("provider_message_id").eq("id", message.reply_to_message_id).maybeSingle()
    replyTo = (data?.provider_message_id as string | null) ?? undefined
  }

  try {
    let result: SendResult
    if (message.type === "text") {
      result = await provider.sendText({ phone, text: message.body ?? "", replyTo })
    } else {
      const { data: attachment } = await db()
        .from("whatsapp_message_attachments")
        .select("storage_path, file_name, mime_type")
        .eq("message_id", message.id)
        .single<{ storage_path: string; file_name: string | null; mime_type: string | null }>()
      if (!attachment?.storage_path) throw new HttpError(400, "O arquivo do anexo não foi encontrado.")
      const { data: signed, error } = await db().storage.from(BUCKET).createSignedUrl(attachment.storage_path, SIGNED_URL_SECONDS)
      if (error || !signed) throw new HttpError(400, "O arquivo do anexo não foi encontrado.")
      const url = signed.signedUrl
      const caption = message.body ?? undefined
      if (message.type === "image") result = await provider.sendImage({ phone, url, caption, replyTo })
      else if (message.type === "audio") result = await provider.sendAudio({ phone, url, replyTo })
      else {
        const fileName = attachment.file_name ?? "documento"
        result = await provider.sendDocument({ phone, url, fileName, extension: extensionOf(fileName, attachment.mime_type ?? undefined), caption, replyTo })
      }
    }

    await db()
      .from("whatsapp_messages")
      .update({ provider_message_id: result.messageId, provider_zaap_id: result.providerId ?? null, error: null })
      .eq("id", message.id)
    // Só para frente: o webhook pode ter adotado a mensagem (e até avançado o status)
    // antes desta resposta. A função também atualiza a prévia da conversa.
    await db().rpc("whatsapp_apply_status", {
      p_org: conversation.organization_id,
      p_ids: [result.messageId],
      p_status: "sent",
      p_at: new Date().toISOString(),
    })
  } catch (error) {
    const reason = error instanceof ZapiError || error instanceof HttpError ? error.message : "Não foi possível enviar a mensagem."
    if (error instanceof ZapiError) console.error("[whatsapp] Z-API recusou o envio:", error.status, error.detail)
    else if (!(error instanceof HttpError)) console.error("[whatsapp] Falha no envio:", error)
    await db().from("whatsapp_messages").update({ status: "failed", error: reason, failed_at: new Date().toISOString() }).eq("id", message.id)
    // A prévia da lista mostra a falha se esta ainda é a última mensagem.
    await db()
      .from("whatsapp_conversations")
      .update({ last_message_status: "failed" })
      .eq("id", conversation.id)
      .eq("last_message_direction", "outbound")
      .lte("last_message_at", message.sent_at)
  }
}

export async function sendMessage(actor: Actor, conversationId: string, input: SendInput) {
  const text = validate(actor, input)
  const conversation = await loadConversation(actor, conversationId)

  let replyToId: string | null = null
  if (input.replyToId) {
    if (!UUID.test(input.replyToId)) throw new HttpError(400, "Mensagem citada inválida.")
    const { data } = await db()
      .from("whatsapp_messages")
      .select("id, direction")
      .eq("id", input.replyToId)
      .eq("conversation_id", conversation.id)
      .maybeSingle<{ id: string; direction: string }>()
    if (!data) throw new HttpError(400, "Mensagem citada não encontrada.")
    replyToId = data.id
  }

  const note = input.type === "note"
  const { data: created, error } = await db()
    .from("whatsapp_messages")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      organization_id: actor.organizationId,
      conversation_id: conversation.id,
      direction: note ? "internal" : "outbound",
      type: input.type,
      body: text || null,
      status: note ? "sent" : "pending",
      reply_to_message_id: replyToId,
      sent_by_user_id: actor.userId,
    })
    .select("id, type, body, reply_to_message_id, sent_at")
    .single<{ id: string; type: string; body: string | null; reply_to_message_id: string | null; sent_at: string }>()
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Esta mensagem já foi enviada.")
    throw error
  }

  if (note) return loadMessage(created.id)

  if (input.attachment) {
    const { error: attachmentError } = await db()
      .from("whatsapp_message_attachments")
      .insert({
        organization_id: actor.organizationId,
        message_id: created.id,
        kind: input.type,
        mime_type: baseMime(input.attachment.mimeType) ?? null,
        file_name: input.attachment.fileName.trim(),
        size_bytes: input.attachment.sizeBytes,
        storage_path: input.attachment.storagePath,
        duration_seconds: input.attachment.durationSeconds ? Math.round(input.attachment.durationSeconds) : null,
        voice_note: input.type === "audio",
        download_status: "stored",
      })
    if (attachmentError) throw attachmentError
  }

  await touchConversation(conversation.id, {
    at: created.sent_at,
    body: text || input.attachment?.fileName,
    type: input.type as "text",
    direction: "outbound",
    status: "pending",
    countUnread: false,
  })
  await dispatch(conversation, created)
  return loadMessage(created.id)
}

/** Reenvia uma mensagem que falhou. */
export async function retryMessage(actor: Actor, messageId: string) {
  if (!UUID.test(messageId)) throw new HttpError(404, "Mensagem não encontrada.")
  const { data: message } = await db()
    .from("whatsapp_messages")
    .select("id, type, body, reply_to_message_id, conversation_id, status, direction, sent_at")
    .eq("organization_id", actor.organizationId)
    .eq("id", messageId)
    .maybeSingle<{
      id: string
      type: string
      body: string | null
      reply_to_message_id: string | null
      conversation_id: string
      status: string
      direction: string
      sent_at: string
    }>()
  if (!message || message.direction !== "outbound") throw new HttpError(404, "Mensagem não encontrada.")
  if (message.status !== "failed") throw new HttpError(409, "Só mensagens que falharam podem ser reenviadas.")

  const conversation = await loadConversation(actor, message.conversation_id)
  await db().from("whatsapp_messages").update({ status: "pending", error: null, failed_at: null }).eq("id", message.id)
  await dispatch(conversation, message)
  return loadMessage(message.id)
}
