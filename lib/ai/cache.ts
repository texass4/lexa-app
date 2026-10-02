/**
 * Cache das análises da Íntegra IA no Supabase (`ai_result_cache`, `0013_ia_consumo.sql`):
 * a mesma análise (mesmo escritório, operação, modelo, prompt e contexto) não chama o
 * modelo de novo em nenhum servidor até expirar. Só o servidor lê e grava (service
 * role); a chave já inclui o escritório. Sem a tabela, o cache simplesmente não acerta.
 */

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AICache } from "./guard"

/** Chave do cache: hash forte (o conteúdo não vai para a chave). */
export const cacheKey = (parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex")

export function databaseCache(admin: SupabaseClient): AICache {
  return {
    async get<T>(key: string) {
      const { data, error } = await admin
        .from("ai_result_cache")
        .select("value")
        .eq("key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
      if (error || !data) return undefined
      return (data as { value: T }).value
    },
    async set(key, { organizationId, operation, value, ttlMs }) {
      const now = Date.now()
      const { error } = await admin.from("ai_result_cache").upsert({
        key,
        organization_id: organizationId,
        operation,
        value,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + ttlMs).toISOString(),
      })
      if (error) return
      // Limpeza ocasional do que venceu (sem tarefa agendada só para isso).
      if (Math.random() < 0.05) await admin.from("ai_result_cache").delete().lt("expires_at", new Date(now).toISOString())
    },
  }
}
