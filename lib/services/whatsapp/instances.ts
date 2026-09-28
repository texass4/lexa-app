/**
 * Instâncias do WhatsApp (conexões com a Z-API) — servidor apenas.
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
import type { WhatsAppProvider } from "@/lib/integrations/whatsapp/types"
import type { InstanceRow } from "@/lib/whatsapp/mappers"

export type Instance = InstanceRow & { id: string; organization_id: string; external_id: string }

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
export async function ensureEnvInstance(): Promise<Instance | null> {
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

/** Instância do escritório (a primeira, se houver mais de uma). */
export async function instanceForOrg(organizationId: string): Promise<Instance | null> {
  if (envSetup().organizationId === organizationId) await ensureEnvInstance()
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle<Instance>()
  return data ?? null
}

export async function instanceByExternalId(externalId: string): Promise<Instance | null> {
  if (zapiCredentialsFromEnv()?.instanceId === externalId) await ensureEnvInstance()
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("*")
    .eq("provider", "zapi")
    .eq("external_id", externalId)
    .maybeSingle<Instance>()
  return data ?? null
}

/** Cliente do provedor para a instância. As credenciais só existem no servidor. */
export function providerFor(instance: Pick<Instance, "external_id">): WhatsAppProvider {
  const credentials = zapiCredentialsFromEnv()
  if (!credentials || credentials.instanceId !== instance.external_id)
    throw new HttpError(503, "As credenciais desta conexão do WhatsApp não estão configuradas no servidor.")
  return createZapiClient(credentials)
}

/** Consulta o status na Z-API e grava na instância. */
export async function refreshInstanceStatus(instance: Instance) {
  const status = await providerFor(instance).status()
  const next = status.connected ? "connected" : "disconnected"
  const patch: Record<string, unknown> = { status: next, status_detail: status.detail ?? null }
  if (next === "connected" && instance.status !== "connected") patch.connected_at = new Date().toISOString()
  const { data } = await getSupabaseAdmin().from("whatsapp_instances").update(patch).eq("id", instance.id).select("*").single<Instance>()
  return { instance: data ?? instance, smartphoneConnected: status.smartphoneConnected }
}
