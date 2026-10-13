/**
 * Instâncias do WhatsApp — servidor apenas. Dois provedores:
 *
 * - `meta` (WhatsApp Business Cloud API, oficial): cada escritório vincula o PRÓPRIO
 *   número pela tela (`meta-connection.ts`); o token fica cifrado por escritório em
 *   `whatsapp_credentials`. Tem prioridade quando o escritório tem os dois.
 * - `zapi` (legado, não oficial): o descrito abaixo.
 *
 * A instância do `.env` (`ZAPI_INSTANCE_ID`) pertence ao escritório de
 * `ZAPI_ORGANIZATION_ID`: é o servidor quem vincula, nunca a tela — assim nenhum
 * escritório consegue se apropriar do número de outro. A linha em
 * `whatsapp_instances` é criada sozinha no primeiro uso.
 *
 * Credenciais nunca vão para o banco: `providerFor` casa a instância com o `.env`.
 * Para vários números/escritórios no futuro, este é o único ponto a estender
 * (ex.: um cofre de segredos por instância).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError } from "@/lib/auth/server"
import { createZapiClient, zapiCredentialsFromEnv } from "@/lib/integrations/whatsapp/zapi/client"
import { createMetaClient, MetaError } from "@/lib/integrations/whatsapp/meta/client"
import { CredentialsKeyError, credentialsKey, readAccessToken } from "./credentials"
import type { WhatsAppProvider } from "@/lib/integrations/whatsapp/types"
import type { InstanceRow } from "@/lib/whatsapp/mappers"

export type Instance = InstanceRow & { id: string; organization_id: string; external_id: string }

/** Escritório com o número oficial configurado mas sem token salvo (ou chave do servidor ausente). */
export const META_NOT_READY = "A conexão do WhatsApp oficial do escritório não está completa. Quem administra o escritório pode concluir em Atendimento › Configurar."

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

/** Para o escritório: a ativação é feita pela equipe da Íntegra (variáveis do servidor). */
export const NOT_ACTIVATED = "O WhatsApp do escritório ainda não foi ativado. Fale com o suporte da Íntegra."
export const RECEIVING_NOT_ACTIVATED = "O recebimento automático de mensagens ainda não foi ativado. Fale com o suporte da Íntegra."

/** O que está configurado no `.env` (sem expor os segredos). */
export function envSetup() {
  const credentials = zapiCredentialsFromEnv()
  const organizationId = process.env.ZAPI_ORGANIZATION_ID?.trim() || undefined
  return {
    credentials,
    organizationId,
    webhookSecret: process.env.ZAPI_WEBHOOK_SECRET?.trim() || undefined,
    missing: [
      !process.env.ZAPI_INSTANCE_ID?.trim() && "ZAPI_INSTANCE_ID",
      !process.env.ZAPI_TOKEN?.trim() && "ZAPI_TOKEN",
      !process.env.ZAPI_CLIENT_TOKEN?.trim() && "ZAPI_CLIENT_TOKEN",
      !organizationId && "ZAPI_ORGANIZATION_ID",
      !process.env.ZAPI_WEBHOOK_SECRET?.trim() && "ZAPI_WEBHOOK_SECRET",
    ].filter(Boolean) as string[],
  }
}

/** Instância do `.env` já garantida neste processo (evita repetir a cada webhook). */
let ensured: { key: string; instance: Instance } | null = null

/** Cria (uma vez) a linha da instância do `.env` para o escritório configurado. */
async function ensureEnvInstance(): Promise<Instance | null> {
  const { credentials, organizationId } = envSetup()
  if (!credentials || !organizationId) return null
  const key = `${credentials.instanceId}:${organizationId}`
  if (ensured?.key === key) return ensured.instance
  const db = getSupabaseAdmin()

  const { error } = await db
    .from("whatsapp_instances")
    .upsert(
      { organization_id: organizationId, provider: "zapi", external_id: credentials.instanceId },
      { onConflict: "provider,external_id", ignoreDuplicates: true },
    )
  if (error) throw error

  const { data } = await db.from("whatsapp_instances").select("*").eq("provider", "zapi").eq("external_id", credentials.instanceId).single<Instance>()
  if (data && data.organization_id !== organizationId) {
    // As conversas já pertencem ao escritório original; mudar de dono exigiria migrar
    // o histórico. Mantemos onde está e avisamos no log.
    console.warn(`[whatsapp] A instância ${credentials.instanceId} já pertence a outro escritório; ZAPI_ORGANIZATION_ID foi ignorado.`)
  }
  if (data) ensured = { key, instance: data }
  return data ?? null
}

/** Instância do escritório: a oficial (Meta), se houver; senão a primeira. */
export async function instanceForOrg(organizationId: string): Promise<Instance | null> {
  if (envSetup().organizationId === organizationId) await ensureEnvInstance()
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at")
    .returns<Instance[]>()
  return data?.find((row) => row.provider === "meta") ?? data?.[0] ?? null
}

export async function instanceByExternalId(externalId: string, provider: "zapi" | "meta" = "zapi"): Promise<Instance | null> {
  if (provider === "zapi" && zapiCredentialsFromEnv()?.instanceId === externalId) await ensureEnvInstance()
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("*")
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle<Instance>()
  return data ?? null
}

/** Cliente do provedor para a instância. As credenciais só existem no servidor. */
export async function providerFor(instance: Pick<Instance, "id" | "organization_id" | "external_id" | "provider" | "business_account_id">): Promise<WhatsAppProvider> {
  if (instance.provider === "meta") {
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
  const credentials = zapiCredentialsFromEnv()
  if (!credentials || credentials.instanceId !== instance.external_id) {
    console.error("[whatsapp] Sem credenciais da Z-API (ZAPI_INSTANCE_ID/ZAPI_TOKEN) para a instância", instance.external_id)
    throw new HttpError(503, NOT_ACTIVATED)
  }
  return createZapiClient(credentials)
}

/**
 * Meta: confere número e token (no máximo a cada 5 min se estava conectado) e grava o
 * resultado. "Conectado" só com a resposta positiva da Meta; falha vira `error`.
 */
async function refreshMetaStatus(instance: Instance, force: boolean) {
  const last = instance.last_checked_at ? Date.parse(instance.last_checked_at) : 0
  if (!force && instance.status === "connected" && Date.now() - last < META_RECHECK_MS) return { instance, smartphoneConnected: undefined }
  const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString() }
  try {
    const client = await providerFor(instance)
    const phone = await (client as ReturnType<typeof createMetaClient>).phoneNumber()
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
  return { instance: data ?? instance, smartphoneConnected: undefined }
}

/** Consulta o status no provedor e grava na instância. */
export async function refreshInstanceStatus(instance: Instance, options: { force?: boolean } = {}) {
  if (instance.provider === "meta") return refreshMetaStatus(instance, options.force ?? false)
  const status = await (await providerFor(instance)).status()
  const next = status.connected ? "connected" : "disconnected"
  const patch: Record<string, unknown> = { status: next, status_detail: status.detail ?? null }
  if (next === "connected" && instance.status !== "connected") patch.connected_at = new Date().toISOString()
  const { data } = await getSupabaseAdmin().from("whatsapp_instances").update(patch).eq("id", instance.id).select("*").single<Instance>()
  return { instance: data ?? instance, smartphoneConnected: status.smartphoneConnected }
}
