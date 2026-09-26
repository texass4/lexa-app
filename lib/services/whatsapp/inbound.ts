/**
 * Processamento dos webhooks do WhatsApp — servidor apenas (service role).
 *
 *   WhatsApp → Z-API → POST /api/whatsapp/webhook → parseZapiWebhook → aqui → banco → tela (Realtime)
 *
 * Tudo é idempotente: a Z-API pode repetir um webhook, e a mesma mensagem nunca
 * entra duas vezes (única por conversa + id do WhatsApp).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { phoneMatchKeys } from "@/lib/whatsapp/phone"
import { baseMime, safeFileName } from "@/lib/whatsapp/files"
import { TYPE_PREVIEW } from "@/lib/whatsapp/config"
import type { WebhookEvent } from "@/lib/integrations/whatsapp/types"
import type { ContactRow } from "@/lib/whatsapp/mappers"
import { instanceByExternalId, type Instance } from "./instances"

const MAX_MEDIA_BYTES = 64 * 1024 * 1024
const BUCKET = "whatsapp"

type MessageEvent = Extract<WebhookEvent, { kind: "message" }>

/** Trabalho que pode rodar depois de responder à Z-API (download de mídia). */
export type FollowUp = () => Promise<void>

export interface WebhookOutcome {
  status: "processed" | "ignored"
  reason?: string
  followUps: FollowUp[]
}

const db = () => getSupabaseAdmin()

/** Cliente do escritório com este telefone, ou null. */
async function matchClient(organizationId: string, phone: string): Promise<string | null> {
  const keys = phoneMatchKeys(phone)
  if (!keys.length) return null
  const { data, error } = await db().rpc("whatsapp_match_client", { p_org: organizationId, p_keys: keys })
  if (error) {
    console.error("[whatsapp] Falha ao procurar cliente pelo telefone:", error.message)
    return null
  }
  return (data as string | null) ?? null
}

/**
 * Contato do escritório com este telefone. Se é a primeira mensagem, cria o contato
 * e já o vincula ao cliente de mesmo telefone — se houver. Nunca cria cliente.
 */
export async function upsertContact(organizationId: string, phone: string, profile: { name?: string; photo?: string } = {}) {
  const { data: existing } = await db()
    .from("whatsapp_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle<ContactRow & { id: string }>()

  if (existing) {
    const patch: Record<string, string> = {}
    if (profile.name && profile.name !== existing.push_name) patch.push_name = profile.name
    if (profile.photo && profile.photo !== existing.avatar_url) patch.avatar_url = profile.photo
    if (!Object.keys(patch).length) return existing
    const { data } = await db().from("whatsapp_contacts").update(patch).eq("id", existing.id).select("*").single<ContactRow & { id: string }>()
    return data ?? existing
  }

  const clientId = await matchClient(organizationId, phone)
  const { data: created } = await db()
    .from("whatsapp_contacts")
    .upsert(
      { organization_id: organizationId, phone, push_name: profile.name ?? null, avatar_url: profile.photo ?? null, client_id: clientId },
      { onConflict: "organization_id,phone", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle<ContactRow & { id: string }>()
  if (created) return created

  // Outra requisição criou no mesmo instante.
  const { data } = await db()
    .from("whatsapp_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .single<ContactRow & { id: string }>()
  return data!
}

/** Conversa do contato nesta instância (uma só, com todo o histórico). */
export async function conversationFor(instance: Instance, contactId: string) {
  const { error } = await db()
    .from("whatsapp_conversations")
    .upsert(
      { organization_id: instance.organization_id, instance_id: instance.id, contact_id: contactId },
      { onConflict: "instance_id,contact_id", ignoreDuplicates: true },
    )
  if (error) throw error
  const { data } = await db()
    .from("whatsapp_conversations")
    .select("id, organization_id")
    .eq("instance_id", instance.id)
    .eq("contact_id", contactId)
    .single<{ id: string; organization_id: string }>()
  return data!
}

export async function touchConversation(
  conversationId: string,
  message: { at: string; body?: string | null; type: keyof typeof TYPE_PREVIEW; direction: "inbound" | "outbound"; status: string; countUnread: boolean },
) {
  const preview = message.body?.trim() || TYPE_PREVIEW[message.type]
  const { error } = await db().rpc("whatsapp_touch_conversation", {
    p_conversation: conversationId,
    p_at: message.at,
    p_preview: preview,
    p_direction: message.direction,
    p_status: message.status,
    p_count_unread: message.countUnread,
  })
  if (error) console.error("[whatsapp] Falha ao atualizar a conversa:", error.message)
}

/** Baixa a mídia da Z-API para o Storage do escritório (os links dela expiram em 30 dias). */
function storeMediaLater(attachment: { id: string; organization_id: string }, conversationId: string, url: string, fileName?: string, mime?: string): FollowUp {
  return async () => {
    try {
      // Só links HTTPS do provedor — nunca endereços internos ou outros protocolos.
      if (new URL(url).protocol !== "https:") throw new Error("URL de mídia não é HTTPS")
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000), redirect: "follow" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const declared = Number(response.headers.get("content-length") ?? 0)
      if (declared > MAX_MEDIA_BYTES) throw new Error("arquivo acima de 64 MB")
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("arquivo acima de 64 MB")

      const contentType = baseMime(mime) ?? baseMime(response.headers.get("content-type") ?? undefined) ?? "application/octet-stream"
      const path = `${attachment.organization_id}/${conversationId}/${attachment.id}/${safeFileName(fileName, "arquivo", contentType)}`
      const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
      if (error) throw error
      await db()
        .from("whatsapp_message_attachments")
        .update({ storage_path: path, size_bytes: bytes.byteLength, download_status: "stored" })
        .eq("id", attachment.id)
    } catch (error) {
      console.error(`[whatsapp] Não foi possível guardar a mídia ${attachment.id}:`, error)
      await db().from("whatsapp_message_attachments").update({ download_status: "failed" }).eq("id", attachment.id)
    }
  }
}

async function processMessage(instance: Instance, event: MessageEvent, raw: unknown): Promise<WebhookOutcome> {
  const org = instance.organization_id
  const contact = await upsertContact(org, event.phone, { name: event.contactName, photo: event.contactPhoto })
  const conversation = await conversationFor(instance, contact.id)

  // Edição de uma mensagem já registrada.
  if (event.isEdit) {
    await db()
      .from("whatsapp_messages")
      .update({ body: event.body ?? null, edited_at: event.at })
      .eq("conversation_id", conversation.id)
      .eq("provider_message_id", event.messageId)
    return { status: "processed", followUps: [] }
  }

  const { data: known } = await db()
    .from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .eq("provider_message_id", event.messageId)
    .maybeSingle()
  if (known) return { status: "ignored", reason: "mensagem já registrada", followUps: [] }

  if (event.fromMe) {
    // Enviada pelo LEXA: o webhook pode chegar antes de a Z-API responder o envio.
    // Adota a mensagem pendente em vez de duplicá-la como "enviada pelo celular".
    const since = new Date(Date.now() - 2 * 60_000).toISOString()
    let pending = db()
      .from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("direction", "outbound")
      .eq("status", "pending")
      .is("provider_message_id", null)
      .eq("type", event.type)
      .gte("created_at", since)
    if (event.type === "text") pending = pending.eq("body", event.body ?? "")
    const { data: claim } = await pending.order("created_at").limit(1).maybeSingle<{ id: string }>()
    if (claim) {
      await db().from("whatsapp_messages").update({ provider_message_id: event.messageId, status: "sent" }).eq("id", claim.id).eq("status", "pending")
      return { status: "processed", followUps: [] }
    }
  }

  let replyToId: string | null = null
  if (event.replyToProviderId) {
    const { data } = await db()
      .from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("provider_message_id", event.replyToProviderId)
      .maybeSingle<{ id: string }>()
    replyToId = data?.id ?? null
  }

  const direction = event.fromMe ? "outbound" : "inbound"
  const status = event.fromMe ? "sent" : "received"
  const { data: inserted, error } = await db()
    .from("whatsapp_messages")
    .upsert(
      {
        organization_id: org,
        conversation_id: conversation.id,
        direction,
        type: event.type,
        body: event.body ?? null,
        status,
        provider_message_id: event.messageId,
        reply_to_message_id: replyToId,
        reply_to_provider_id: event.replyToProviderId ?? null,
        from_device: event.fromMe,
        sent_at: event.at,
        raw,
      },
      { onConflict: "conversation_id,provider_message_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!inserted) return { status: "ignored", reason: "mensagem já registrada", followUps: [] }

  const followUps: FollowUp[] = []
  if (event.media) {
    const media = event.media
    const { data: attachment, error: attachmentError } = await db()
      .from("whatsapp_message_attachments")
      .insert({
        organization_id: org,
        message_id: inserted.id,
        kind: media.kind,
        mime_type: media.mimeType ?? null,
        file_name: media.fileName ?? null,
        remote_url: media.url ?? null,
        thumbnail_url: media.thumbnailUrl ?? null,
        duration_seconds: media.durationSeconds ?? null,
        width: media.width ?? null,
        height: media.height ?? null,
        page_count: media.pageCount ?? null,
        voice_note: media.voiceNote ?? false,
        download_status: media.url ? "pending" : "failed",
      })
      .select("id, organization_id")
      .single<{ id: string; organization_id: string }>()
    if (attachmentError) throw attachmentError
    if (media.url) followUps.push(storeMediaLater(attachment, conversation.id, media.url, media.fileName, media.mimeType))
  }

  await touchConversation(conversation.id, { at: event.at, body: event.body, type: event.type, direction, status, countUnread: !event.fromMe })
  return { status: "processed", followUps }
}

async function processEvent(instance: Instance, event: WebhookEvent, raw: unknown): Promise<WebhookOutcome> {
  const org = instance.organization_id
  switch (event.kind) {
    case "message":
      return processMessage(instance, event, raw)

    case "status": {
      if (event.status === "read_by_me") {
        // Lida no celular do escritório: some o contador de não lidas.
        const { data } = await db()
          .from("whatsapp_messages")
          .select("conversation_id")
          .eq("organization_id", org)
          .eq("direction", "inbound")
          .in("provider_message_id", event.ids)
        const ids = [...new Set((data ?? []).map((row) => row.conversation_id as string))]
        if (ids.length) await db().from("whatsapp_conversations").update({ unread_count: 0 }).eq("organization_id", org).in("id", ids)
        return { status: "processed", followUps: [] }
      }
      const { error } = await db().rpc("whatsapp_apply_status", { p_org: org, p_ids: event.ids, p_status: event.status, p_at: event.at })
      if (error) throw error
      return { status: "processed", followUps: [] }
    }

    case "delivery": {
      const ids = [event.messageId, event.providerId].filter(Boolean) as string[]
      if (!ids.length) return { status: "ignored", reason: "sem id", followUps: [] }
      if (event.error) {
        const filter = [
          event.messageId && `provider_message_id.eq.${event.messageId}`,
          event.providerId && `provider_zaap_id.eq.${event.providerId}`,
        ]
          .filter(Boolean)
          .join(",")
        await db()
          .from("whatsapp_messages")
          .update({ status: "failed", error: event.error, failed_at: event.at })
          .eq("organization_id", org)
          .eq("direction", "outbound")
          .or(filter)
        return { status: "processed", followUps: [] }
      }
      if (event.messageId) await db().rpc("whatsapp_apply_status", { p_org: org, p_ids: [event.messageId], p_status: "sent", p_at: event.at })
      return { status: "processed", followUps: [] }
    }

    case "connection": {
      const patch: Record<string, unknown> = {
        status: event.connected ? "connected" : "disconnected",
        status_detail: event.detail ?? null,
      }
      if (event.phone) patch.phone = event.phone
      if (event.connected) patch.connected_at = event.at
      await db().from("whatsapp_instances").update(patch).eq("id", instance.id)
      return { status: "processed", followUps: [] }
    }

    case "ignored":
      return { status: "ignored", reason: event.reason, followUps: [] }
  }
}

/** Registra o webhook bruto, identifica o escritório pela instância e processa. */
export async function handleWebhookEvent(event: WebhookEvent, raw: unknown): Promise<WebhookOutcome> {
  const instance = event.instanceExternalId ? await instanceByExternalId(event.instanceExternalId) : null

  const { data: logged } = await db()
    .from("whatsapp_webhook_events")
    .insert({
      organization_id: instance?.organization_id ?? null,
      instance_id: instance?.id ?? null,
      event_type: event.kind,
      payload: raw as object,
    })
    .select("id")
    .single<{ id: number }>()

  const finish = async (outcome: WebhookOutcome, error?: string) => {
    if (logged) await db().from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), error: error ?? outcome.reason ?? null }).eq("id", logged.id)
    return outcome
  }

  if (!instance) return finish({ status: "ignored", reason: "instância desconhecida", followUps: [] })
  if (event.kind === "ignored") return finish({ status: "ignored", reason: event.reason, followUps: [] })

  await db().from("whatsapp_instances").update({ last_event_at: new Date().toISOString() }).eq("id", instance.id)

  try {
    return await finish(await processEvent(instance, event, raw))
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error)
    await finish({ status: "ignored", followUps: [] }, message)
    throw error
  }
}
