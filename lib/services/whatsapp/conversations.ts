/**
 * Gestão das conversas — servidor apenas. Cada ação confere a permissão de quem
 * chama e o escritório (toda consulta filtra por `organization_id`); as chaves
 * compostas do banco barram qualquer referência cruzada que escape daqui.
 */

import { HttpError } from "@/lib/auth/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { isSystemStatus, statusOption } from "@/lib/whatsapp/config"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone"
import { CONVERSATION_SELECT, type ConversationRow } from "@/lib/whatsapp/mappers"
import { CATEGORY_COLORS } from "@/lib/config"
import type { ConversationStatusOption } from "@/types"
import { conversationFor, upsertContact } from "./inbound"
import { instanceForOrg, providerFor } from "./instances"
import { loadConversation, logEvent, UUID, type Actor } from "./actor"

const db = () => getSupabaseAdmin()

export interface ConversationPatch {
  status?: string
  /** null = sem responsável. */
  assignedUserId?: string | null
  read?: boolean
  addTagIds?: string[]
  removeTagIds?: string[]
}

async function memberName(organizationId: string, userId: string) {
  const { data } = await db()
    .from("profiles")
    .select("name, active")
    .eq("organization_id", organizationId)
    .eq("id", userId)
    .maybeSingle<{ name: string; active: boolean }>()
  return data
}

const firstName = (name: string) => name.split(/\s+/)[0] ?? name

export async function updateConversation(actor: Actor, conversationId: string, patch: ConversationPatch) {
  const conversation = await loadConversation(actor, conversationId)
  const update: Record<string, unknown> = {}
  const followUp: (() => Promise<void>)[] = []

  if (patch.status !== undefined && patch.status !== conversation.status) {
    if (!actor.can("whatsapp.edit")) throw new HttpError(403, "Você não tem permissão para alterar o status.")
    if (typeof patch.status !== "string") throw new HttpError(400, "Status inválido.")
    let custom: ConversationStatusOption[] = []
    if (!isSystemStatus(patch.status)) {
      const { data } = await db().from("whatsapp_statuses").select("key, label, category").eq("organization_id", actor.organizationId).eq("key", patch.status)
      custom = (data ?? []) as ConversationStatusOption[]
      if (!custom.length) throw new HttpError(400, "Status inválido.")
    }
    const option = statusOption(patch.status, custom)
    update.status = patch.status
    update.resolved_at = option.category === "resolved" ? new Date().toISOString() : null
    followUp.push(() => logEvent(conversation, actor, `${firstName(actor.name)} alterou o status para "${option.label}".`))
  }

  if (patch.assignedUserId !== undefined && patch.assignedUserId !== conversation.assigned_user_id) {
    const target = patch.assignedUserId
    // Assumir uma conversa sem responsável é permitido a quem atende; distribuir,
    // tirar de alguém ou passar adiante exige `whatsapp.assign`.
    const selfClaim = target === actor.userId && !conversation.assigned_user_id && actor.can("whatsapp.edit")
    if (!selfClaim && !actor.can("whatsapp.assign")) throw new HttpError(403, "Você não tem permissão para alterar o responsável.")

    let targetName = ""
    if (target !== null) {
      if (typeof target !== "string" || !UUID.test(target)) throw new HttpError(400, "Responsável inválido.")
      const member = await memberName(actor.organizationId, target)
      if (!member?.active) throw new HttpError(400, "Escolha um membro ativo do escritório.")
      targetName = member.name
    }
    update.assigned_user_id = target
    followUp.push(async () => {
      await db().from("whatsapp_conversation_assignments").insert({
        organization_id: actor.organizationId,
        conversation_id: conversation.id,
        user_id: target,
        assigned_by: actor.userId,
      })
      const who = firstName(actor.name)
      const text =
        target === null
          ? `${who} deixou a conversa sem responsável.`
          : target === actor.userId
            ? `${who} assumiu a conversa.`
            : `${who} passou a conversa para ${targetName}.`
      await logEvent(conversation, actor, text)
    })
  }

  if (patch.read) {
    update.unread_count = 0
    // Confirmação de leitura no WhatsApp do cliente (melhor esforço).
    followUp.push(async () => {
      if (!conversation.unread_count) return
      const { data: last } = await db()
        .from("whatsapp_messages")
        .select("provider_message_id")
        .eq("conversation_id", conversation.id)
        .eq("direction", "inbound")
        .not("provider_message_id", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ provider_message_id: string }>()
      if (!last) return
      try {
        await providerFor(conversation.instance).markRead({ phone: conversation.contact.phone, messageId: last.provider_message_id })
      } catch (error) {
        console.warn("[whatsapp] Não foi possível marcar como lida no WhatsApp:", error instanceof Error ? error.message : error)
      }
    })
  }

  const add = patch.addTagIds ?? []
  const remove = patch.removeTagIds ?? []
  if (add.length || remove.length) {
    if (!actor.can("whatsapp.edit")) throw new HttpError(403, "Você não tem permissão para alterar tags.")
    if (![...add, ...remove].every((id) => typeof id === "string" && UUID.test(id))) throw new HttpError(400, "Tag inválida.")
    if (add.length) {
      const { data: tags } = await db().from("whatsapp_tags").select("id").eq("organization_id", actor.organizationId).in("id", add)
      if ((tags?.length ?? 0) !== new Set(add).size) throw new HttpError(400, "Tag inválida.")
      const { error } = await db()
        .from("whatsapp_conversation_tags")
        .upsert(
          add.map((tagId) => ({ organization_id: actor.organizationId, conversation_id: conversation.id, tag_id: tagId, created_by: actor.userId })),
          { onConflict: "conversation_id,tag_id", ignoreDuplicates: true },
        )
      if (error) throw error
    }
    if (remove.length) {
      await db().from("whatsapp_conversation_tags").delete().eq("organization_id", actor.organizationId).eq("conversation_id", conversation.id).in("tag_id", remove)
    }
    // O Realtime não entrega exclusões filtradas por escritório: tocar a conversa
    // avisa as telas abertas para recarregar as tags.
    update.updated_at = new Date().toISOString()
  }

  if (Object.keys(update).length) {
    const { error } = await db().from("whatsapp_conversations").update(update).eq("id", conversation.id).eq("organization_id", actor.organizationId)
    if (error) throw error
  }
  for (const run of followUp) await run()

  const { data } = await db().from("whatsapp_conversations").select(CONVERSATION_SELECT).eq("id", conversation.id).single<ConversationRow>()
  return data!
}

/** Inicia (ou reabre) a conversa com um número — ex.: a partir do cadastro do cliente. */
export async function startConversation(actor: Actor, input: { phone?: string; name?: string; clientId?: string }) {
  const phone = normalizeWhatsAppPhone(String(input.phone ?? ""))
  if (!phone) throw new HttpError(400, "Informe um telefone válido, com DDD.")
  const instance = await instanceForOrg(actor.organizationId)
  if (!instance) throw new HttpError(409, "O WhatsApp do escritório ainda não está configurado.")

  const contact = await upsertContact(actor.organizationId, phone)
  const patch: Record<string, string> = {}
  if (input.name?.trim() && !contact.name) patch.name = input.name.trim().slice(0, 120)
  if (input.clientId && !contact.client_id) {
    await assertClient(actor, input.clientId)
    patch.client_id = input.clientId
  }
  if (Object.keys(patch).length) await db().from("whatsapp_contacts").update(patch).eq("id", contact.id)

  const conversation = await conversationFor(instance, contact.id)
  const { data } = await db().from("whatsapp_conversations").select(CONVERSATION_SELECT).eq("id", conversation.id).single<ConversationRow>()
  return data!
}

async function assertClient(actor: Actor, clientId: string) {
  if (typeof clientId !== "string" || clientId.length > 80) throw new HttpError(400, "Cliente inválido.")
  const { data } = await db().from("clients").select("id, data->>name").eq("organization_id", actor.organizationId).eq("id", clientId).maybeSingle()
  if (!data) throw new HttpError(400, "Cliente não encontrado.")
  return data as { id: string; name: string | null }
}

/** Vincula o contato a um cliente (ou desfaz, com `clientId: null`) e/ou renomeia. */
export async function updateContact(actor: Actor, contactId: string, patch: { clientId?: string | null; name?: string | null }) {
  if (!UUID.test(contactId)) throw new HttpError(404, "Contato não encontrado.")
  const { data: contact } = await db()
    .from("whatsapp_contacts")
    .select("id, organization_id, client_id")
    .eq("organization_id", actor.organizationId)
    .eq("id", contactId)
    .maybeSingle<{ id: string; organization_id: string; client_id: string | null }>()
  if (!contact) throw new HttpError(404, "Contato não encontrado.")

  const update: Record<string, unknown> = {}
  let clientName: string | null = null
  if (patch.clientId !== undefined && patch.clientId !== contact.client_id) {
    if (patch.clientId !== null) clientName = (await assertClient(actor, patch.clientId)).name
    update.client_id = patch.clientId
  }
  if (patch.name !== undefined) update.name = patch.name?.trim().slice(0, 120) || null
  if (!Object.keys(update).length) return

  const { error } = await db().from("whatsapp_contacts").update(update).eq("id", contact.id)
  if (error) throw error

  if ("client_id" in update) {
    const { data: conversations } = await db().from("whatsapp_conversations").select("id, organization_id").eq("contact_id", contact.id)
    const text = update.client_id ? `${firstName(actor.name)} vinculou o contato ao cliente ${clientName ?? ""}.`.replace(" .", ".") : `${firstName(actor.name)} desvinculou o contato do cliente.`
    for (const conversation of conversations ?? []) await logEvent(conversation as { id: string; organization_id: string }, actor, text)
  }
}

export async function createTag(actor: Actor, input: { name?: string; color?: string }) {
  const name = String(input.name ?? "").trim()
  if (!name || name.length > 40) throw new HttpError(400, "Dê um nome de até 40 caracteres à tag.")
  const color = CATEGORY_COLORS.some((c) => c.value === input.color) ? input.color! : CATEGORY_COLORS[0].value
  const { data, error } = await db().from("whatsapp_tags").insert({ organization_id: actor.organizationId, name, color }).select("id, name, color").single()
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Já existe uma tag com esse nome.")
    throw error
  }
  return data as { id: string; name: string; color: string }
}

export async function deleteTag(actor: Actor, tagId: string) {
  if (!UUID.test(tagId)) throw new HttpError(404, "Tag não encontrada.")
  const { data } = await db().from("whatsapp_tags").delete().eq("organization_id", actor.organizationId).eq("id", tagId).select("id")
  if (!data?.length) throw new HttpError(404, "Tag não encontrada.")
}
