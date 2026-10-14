/**
 * Instância do WhatsApp do escritório — servidor apenas.
 *
 * Só o WhatsApp oficial (WhatsApp Business Cloud API, da Meta): cada escritório vincula
 * o PRÓPRIO número pela tela (`meta-connection.ts`) e o token fica cifrado por escritório
 * em `whatsapp_credentials`. Linhas antigas com `provider = 'zapi'` (conexão não oficial,
 * removida) ficam no banco só como histórico: não são usadas para enviar nem receber.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError } from "@/lib/auth/server"
import { createMetaClient, MetaError } from "@/lib/integrations/whatsapp/meta/client"
import { CredentialsKeyError, credentialsKey, readAccessToken } from "./credentials"
import type { WhatsAppProvider } from "@/lib/integrations/whatsapp/types"
import type { InstanceRow } from "@/lib/whatsapp/mappers"

export type Instance = InstanceRow & { id: string; organization_id: string; external_id: string }

/** Escritório com o número oficial configurado mas sem token salvo (ou chave do servidor ausente). */
export const META_NOT_READY = "A conexão do WhatsApp oficial do escritório não está completa. Quem administra o escritório pode concluir em Atendimento › Configurar."

/** Conversa de um número que não é o oficial conectado (ex.: da conexão antiga, removida). */
export const LEGACY_CONNECTION = "Esta conversa é de uma conexão antiga do WhatsApp, que foi desativada. O histórico fica guardado; para responder, use o número oficial do escritório."

/**
 * O que a equipe da Íntegra precisa ter configurado no servidor para o WhatsApp oficial
 * funcionar (uma vez, para todos os escritórios): o aplicativo da Meta (segredo e
 * token de verificação do webhook) e a chave que cifra os tokens dos escritórios.
 */
export function metaPlatformSetup(env: Record<string, string | undefined> = process.env) {
  const missing = [
    !env.META_APP_SECRET?.trim() && "META_APP_SECRET",
    !env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() && "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    !credentialsKey(env) && "WHATSAPP_CREDENTIALS_KEY",
  ].filter(Boolean) as string[]
  return { ready: missing.length === 0, missing }
}

/** Verificação na Meta no máximo a cada 5 min com o número conectado (evita chamar a cada tela aberta). */
const META_RECHECK_MS = 5 * 60_000

/** Número oficial do escritório, ou null. */
export async function instanceForOrg(organizationId: string): Promise<Instance | null> {
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "meta")
    .maybeSingle<Instance>()
  return data ?? null
}

/** Número oficial pelo Phone Number ID (o que vem nos eventos da Meta). */
export async function instanceByExternalId(phoneNumberId: string): Promise<Instance | null> {
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("*")
    .eq("provider", "meta")
    .eq("external_id", phoneNumberId)
    .maybeSingle<Instance>()
  return data ?? null
}

/** Cliente da Meta para a instância. O token só existe decifrado aqui, no servidor. */
export async function providerFor(instance: Pick<Instance, "id" | "organization_id" | "external_id" | "provider" | "business_account_id">): Promise<WhatsAppProvider> {
  if (instance.provider !== "meta") throw new HttpError(409, LEGACY_CONNECTION)
  let token: string | null
  try {
    token = await readAccessToken(instance)
  } catch (error) {
    console.error("[whatsapp] Não foi possível abrir a credencial da Meta da instância", instance.id, error instanceof CredentialsKeyError ? error.message : error instanceof Error ? error.name : "")
    throw new HttpError(503, META_NOT_READY)
  }
  if (!token || !instance.business_account_id) throw new HttpError(503, META_NOT_READY)
  return createMetaClient({ accessToken: token, phoneNumberId: instance.external_id, businessAccountId: instance.business_account_id })
}

/**
 * Confere número e token na Meta (no máximo a cada 5 min se estava conectado, ou na
 * hora com `force`) e grava o resultado. "Conectado" só com a resposta positiva da
 * Meta; falha vira `error`, com o motivo.
 */
export async function refreshInstanceStatus(instance: Instance, options: { force?: boolean } = {}) {
  const last = instance.last_checked_at ? Date.parse(instance.last_checked_at) : 0
  if (!options.force && instance.status === "connected" && Date.now() - last < META_RECHECK_MS) return instance
  const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString() }
  try {
    const client = (await providerFor(instance)) as ReturnType<typeof createMetaClient>
    const phone = await client.phoneNumber()
    patch.status = "connected"
    patch.status_detail = null
    if (phone.verifiedName) patch.verified_name = phone.verifiedName
    if (phone.qualityRating) patch.quality_rating = phone.qualityRating
    const digits = phone.displayPhoneNumber?.replace(/\D/g, "")
    if (digits) patch.phone = digits
    if (instance.status !== "connected") patch.connected_at = new Date().toISOString()
  } catch (error) {
    patch.status = "error"
    patch.status_detail = error instanceof MetaError || error instanceof HttpError ? error.message : "Não foi possível verificar o número na Meta."
    if (error instanceof MetaError) console.warn("[whatsapp] Verificação na Meta falhou:", error.status, error.code ?? "", error.subcode ?? "", error.detail ?? "")
    else if (!(error instanceof HttpError)) console.error("[whatsapp] Falha ao verificar o número na Meta:", error)
  }
  const { data } = await getSupabaseAdmin().from("whatsapp_instances").update(patch).eq("id", instance.id).select("*").single<Instance>()
  return data ?? instance
}
