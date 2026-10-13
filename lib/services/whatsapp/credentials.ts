/**
 * Credenciais do WhatsApp oficial por escritório — servidor apenas.
 *
 * O token de acesso de cada escritório é guardado em `whatsapp_credentials` cifrado com
 * AES-256-GCM. A chave (`WHATSAPP_CREDENTIALS_KEY`, 32 bytes em base64) fica só no
 * ambiente do servidor, nunca no banco: um vazamento do banco não entrega os tokens.
 * O id da instância entra como dado autenticado — a cifra copiada para a linha de
 * outro escritório não abre.
 *
 * Nada aqui é lido pelo navegador: a tabela não tem política de RLS.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

const VERSION = "v1"

export class CredentialsKeyError extends Error {
  constructor() {
    super("WHATSAPP_CREDENTIALS_KEY ausente ou inválida (precisa ter 32 bytes em base64).")
    this.name = "CredentialsKeyError"
  }
}

/** Chave de 32 bytes, ou null se não configurada/ inválida. */
export function credentialsKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.WHATSAPP_CREDENTIALS_KEY?.trim()
  if (!raw) return null
  const key = Buffer.from(raw, "base64")
  return key.length === 32 ? key : null
}

export function encryptSecret(plain: string, instanceId: string, key: Buffer | null = credentialsKey()): string {
  if (!key) throw new CredentialsKeyError()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(instanceId))
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":")
}

export function decryptSecret(sealed: string, instanceId: string, key: Buffer | null = credentialsKey()): string {
  if (!key) throw new CredentialsKeyError()
  const [version, iv, tag, data] = sealed.split(":")
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Credencial em formato desconhecido.")
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"))
  decipher.setAAD(Buffer.from(instanceId))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}

/** Token decifrado da instância, ou null se o escritório ainda não salvou um. */
export async function readAccessToken(instance: { id: string; organization_id: string }): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_credentials")
    .select("access_token_encrypted")
    .eq("instance_id", instance.id)
    .eq("organization_id", instance.organization_id)
    .maybeSingle<{ access_token_encrypted: string }>()
  if (error) throw error
  return data ? decryptSecret(data.access_token_encrypted, instance.id) : null
}

export async function hasAccessToken(instance: { id: string; organization_id: string }): Promise<boolean> {
  const { count } = await getSupabaseAdmin()
    .from("whatsapp_credentials")
    .select("instance_id", { count: "exact", head: true })
    .eq("instance_id", instance.id)
    .eq("organization_id", instance.organization_id)
  return (count ?? 0) > 0
}

export async function saveAccessToken(instance: { id: string; organization_id: string }, token: string, userId: string) {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_credentials")
    .upsert(
      { instance_id: instance.id, organization_id: instance.organization_id, access_token_encrypted: encryptSecret(token, instance.id), updated_by: userId },
      { onConflict: "instance_id" },
    )
  if (error) throw error
}

export async function deleteAccessToken(instance: { id: string; organization_id: string }) {
  const { error } = await getSupabaseAdmin().from("whatsapp_credentials").delete().eq("instance_id", instance.id).eq("organization_id", instance.organization_id)
  if (error) throw error
}
