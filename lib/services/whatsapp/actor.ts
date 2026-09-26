import { HttpError, requireMember } from "@/lib/auth/server"
import { hasPermission, type Permission } from "@/lib/auth/permissions"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { ContactRow, ConversationRow } from "@/lib/whatsapp/mappers"
import type { Instance } from "./instances"

/** Quem está agindo na Central: membro ativo, já validado pelo cookie da sessão. */
export interface Actor {
  userId: string
  organizationId: string
  name: string
  can(permission: Permission): boolean
}

export async function requireActor(permission: Permission = "whatsapp.view"): Promise<Actor> {
  const { profile, organizationId } = await requireMember(permission)
  return {
    userId: profile.id,
    organizationId,
    name: profile.name,
    can: (p) => hasPermission(profile, p),
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type LoadedConversation = ConversationRow & {
  id: string
  organization_id: string
  contact: ContactRow & { id: string; phone: string }
  instance: Instance
}

/** Conversa do escritório de quem chama (404 para qualquer outra — nem confirma que existe). */
export async function loadConversation(actor: Actor, conversationId: string): Promise<LoadedConversation> {
  if (!UUID.test(conversationId)) throw new HttpError(404, "Conversa não encontrada.")
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_conversations")
    .select("*, contact:whatsapp_contacts(*), instance:whatsapp_instances(*)")
    .eq("organization_id", actor.organizationId)
    .eq("id", conversationId)
    .maybeSingle<LoadedConversation>()
  if (!data) throw new HttpError(404, "Conversa não encontrada.")
  return data
}

/** Registro automático na linha do tempo (não vai para o WhatsApp). */
export async function logEvent(conversation: { id: string; organization_id: string }, actor: Actor, text: string) {
  await getSupabaseAdmin().from("whatsapp_messages").insert({
    organization_id: conversation.organization_id,
    conversation_id: conversation.id,
    direction: "internal",
    type: "event",
    body: text,
    status: "sent",
    sent_by_user_id: actor.userId,
  })
}
