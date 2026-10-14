/**
 * Vínculo do número oficial (WhatsApp Business Cloud API) de um escritório — servidor.
 *
 * Cada escritório vincula o PRÓPRIO número, com a própria autorização na Meta (WABA ID,
 * Phone Number ID e token de acesso de um usuário do sistema da empresa dele). Não há
 * credencial global representando todos os escritórios: o que é global é só o
 * aplicativo da Íntegra na Meta (segredo e verificação do webhook).
 *
 * "Conectado" só depois de a Meta confirmar, com o token informado, que:
 *   1. o número existe e o token tem acesso a ele (e é um número da Cloud API);
 *   2. o número pertence à conta (WABA) informada;
 *   3. o aplicativo da Íntegra ficou assinado na conta (sem isso, nada é recebido).
 * Qualquer falha: nada é salvo de novo e a tela mostra o motivo.
 */

import { HttpError } from "@/lib/auth/server"
import { allow } from "@/lib/auth/protection/rate-limit"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createMetaClient, MetaError, type MetaCredentials } from "@/lib/integrations/whatsapp/meta/client"
import type { Actor } from "./actor"
import { deleteAccessToken, readAccessToken, saveAccessToken } from "./credentials"
import { metaPlatformSetup, type Instance } from "./instances"

export interface MetaConnectInput {
  businessAccountId?: unknown
  phoneNumberId?: unknown
  /** Opcional ao revalidar: sem ele, usa o token já salvo. */
  accessToken?: unknown
}

export const PLATFORM_NOT_READY = "O WhatsApp oficial ainda não foi habilitado na Íntegra. Fale com o suporte da Íntegra."

const CONNECT_RULE = { id: "whatsapp:meta-connect", limit: 10, windowSeconds: 600 }
const META_ID = /^[0-9]{5,30}$/

type ClientFactory = (credentials: MetaCredentials) => Pick<ReturnType<typeof createMetaClient>, "phoneNumber" | "businessOwnsPhone" | "subscribeApp" | "unsubscribeApp">

const db = () => getSupabaseAdmin()

async function metaInstanceOf(organizationId: string) {
  const { data } = await db().from("whatsapp_instances").select("*").eq("organization_id", organizationId).eq("provider", "meta").maybeSingle<Instance>()
  return data ?? null
}

function cleanId(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : ""
  if (!META_ID.test(id)) throw new HttpError(400, `Informe o ${label} (só números, como aparece no painel da Meta).`)
  return id
}

function cleanToken(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined
  const token = typeof value === "string" ? value.trim() : ""
  if (token.length < 20 || token.length > 2048 || /\s/.test(token)) throw new HttpError(400, "O token de acesso parece incompleto. Copie o token inteiro do painel da Meta.")
  return token
}

/** Vincula (ou revalida) o número oficial do escritório. */
export async function connectMeta(actor: Actor, input: MetaConnectInput, createClient: ClientFactory = createMetaClient) {
  if (!actor.can("office.manage")) throw new HttpError(403, "Só quem administra o escritório conecta o WhatsApp.")
  const platform = metaPlatformSetup()
  if (!platform.ready) {
    console.error("[whatsapp] WhatsApp oficial sem configuração da plataforma. Faltam:", platform.missing.join(", "))
    throw new HttpError(503, PLATFORM_NOT_READY)
  }
  if (!(await allow(CONNECT_RULE, actor.userId))) throw new HttpError(429, "Muitas tentativas de conexão. Aguarde alguns minutos.")

  const businessAccountId = cleanId(input.businessAccountId, "identificador da conta do WhatsApp Business (WABA ID)")
  const phoneNumberId = cleanId(input.phoneNumberId, "identificador do número (Phone Number ID)")
  const informedToken = cleanToken(input.accessToken)

  const existing = await metaInstanceOf(actor.organizationId)
  if (existing && existing.external_id !== phoneNumberId) {
    const { count } = await db().from("whatsapp_conversations").select("id", { count: "exact", head: true }).eq("instance_id", existing.id)
    if (count) throw new HttpError(409, "O escritório já tem conversas em outro número oficial. Para trocar de número, fale com o suporte da Íntegra.")
  }
  const token = informedToken ?? (existing && existing.external_id === phoneNumberId ? await readAccessToken(existing) : null)
  if (!token) throw new HttpError(400, "Informe o token de acesso.")

  const { data: taken } = await db().from("whatsapp_instances").select("organization_id").eq("provider", "meta").eq("external_id", phoneNumberId).maybeSingle<{ organization_id: string }>()
  if (taken && taken.organization_id !== actor.organizationId) {
    console.warn("[whatsapp] Tentativa de vincular um número oficial que já pertence a outro escritório.")
    throw new HttpError(409, "Este número já está vinculado a outro escritório na Íntegra. Fale com o suporte.")
  }

  // Validação na Meta, com o token informado. Nada é salvo antes.
  const client = createClient({ accessToken: token, phoneNumberId, businessAccountId })
  let phone: Awaited<ReturnType<typeof client.phoneNumber>>
  try {
    phone = await client.phoneNumber()
    if (phone.platformType && phone.platformType !== "CLOUD_API")
      throw new HttpError(422, "Este número não está na Cloud API da Meta. Migre o número para a Cloud API no painel da Meta e tente de novo.")
    if (!(await client.businessOwnsPhone())) throw new HttpError(422, "Este número não pertence à conta do WhatsApp Business informada. Confira os dois identificadores.")
    await client.subscribeApp()
  } catch (error) {
    if (error instanceof MetaError) {
      console.warn("[whatsapp] Conexão com a Meta recusada:", error.status, error.code ?? "", error.subcode ?? "", error.detail ?? "")
      if (existing) await db().from("whatsapp_instances").update({ status: "error", status_detail: error.message, last_checked_at: new Date().toISOString() }).eq("id", existing.id)
      throw new HttpError(422, error.message)
    }
    throw error
  }

  const now = new Date().toISOString()
  const fields = {
    external_id: phoneNumberId,
    business_account_id: businessAccountId,
    phone: phone.displayPhoneNumber?.replace(/\D/g, "") || null,
    verified_name: phone.verifiedName ?? null,
    quality_rating: phone.qualityRating ?? null,
    name: phone.verifiedName || "WhatsApp",
    last_checked_at: now,
  }

  let instance: Instance
  if (existing) {
    const { data, error } = await db().from("whatsapp_instances").update(fields).eq("id", existing.id).select("*").single<Instance>()
    if (error) throw error
    instance = data
  } else {
    const { data, error } = await db()
      .from("whatsapp_instances")
      .insert({ ...fields, organization_id: actor.organizationId, provider: "meta", status: "unknown" })
      .select("*")
      .single<Instance>()
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "Este número já está vinculado a um escritório na Íntegra. Fale com o suporte.")
      throw error
    }
    instance = data
  }

  if (informedToken) await saveAccessToken(instance, informedToken, actor.userId)

  const { data: connected } = await db()
    .from("whatsapp_instances")
    .update({ status: "connected", status_detail: null, ...(instance.status !== "connected" ? { connected_at: now } : {}) })
    .eq("id", instance.id)
    .select("*")
    .single<Instance>()
  console.info("[whatsapp] Número oficial validado e conectado.", { instance: instance.id })
  return connected ?? instance
}

/**
 * Desconecta o número oficial: apaga o token, para o recebimento na Meta (melhor
 * esforço) e marca como desconectado. Conversas e mensagens ficam.
 */
export async function disconnectMeta(actor: Actor, createClient: ClientFactory = createMetaClient) {
  if (!actor.can("office.manage")) throw new HttpError(403, "Só quem administra o escritório desconecta o WhatsApp.")
  const instance = await metaInstanceOf(actor.organizationId)
  if (!instance) throw new HttpError(404, "O escritório não tem um número oficial conectado.")

  try {
    const token = await readAccessToken(instance)
    if (token && instance.business_account_id)
      await createClient({ accessToken: token, phoneNumberId: instance.external_id, businessAccountId: instance.business_account_id }).unsubscribeApp()
  } catch (error) {
    console.warn("[whatsapp] Não foi possível desfazer a assinatura na Meta:", error instanceof MetaError ? `${error.status} ${error.code ?? ""}` : error instanceof Error ? error.name : "")
  }
  await deleteAccessToken(instance)
  const { data } = await db()
    .from("whatsapp_instances")
    .update({ status: "disconnected", status_detail: null, last_checked_at: new Date().toISOString() })
    .eq("id", instance.id)
    .select("*")
    .single<Instance>()
  return data ?? instance
}
