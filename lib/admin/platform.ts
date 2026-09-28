import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sanitizeSettings, type PlatformSettings } from "./settings"

/**
 * Configurações da plataforma no servidor. Um cache curto evita uma consulta a mais
 * em cada rota (cadastro, consulta DataJud, gestão de equipe); salvar invalida na hora.
 */

const TTL = 10_000
let cache: { at: number; value: PlatformSettings } | null = null

export async function loadSettings({ fresh = false } = {}): Promise<PlatformSettings> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value
  const { data, error } = await getSupabaseAdmin().from("platform_settings").select("data").eq("id", true).maybeSingle<{ data: unknown }>()
  // Sem a migração 0002 aplicada, segue com os padrões (o sistema continua funcionando).
  if (error) console.warn("[platform_settings]", error.message)
  const value = sanitizeSettings(data?.data)
  cache = { at: Date.now(), value }
  return value
}

export async function saveSettings(next: PlatformSettings, actorId: string) {
  const { error } = await getSupabaseAdmin()
    .from("platform_settings")
    .upsert({ id: true, data: next, updated_at: new Date().toISOString(), updated_by: actorId })
  if (error) throw error
  cache = { at: Date.now(), value: next }
}
