/**
 * Persistência da Triagem no Supabase (`0012_triagem.sql`) para o servidor.
 *
 * Service role (o agendador não tem sessão): só funções do banco, que filtram por
 * escritório e não deixam gravar nada além da interpretação. Somente servidor.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { InterpretInput } from "@/lib/triagem/interpret"
import type { InterpretRepository } from "./interpret"

type ClaimRow = {
  item_id: string
  org_id: string
  item_kind: InterpretInput["kind"]
  item_title: string
  item_text: string
  item_event_date: string
  item_available_at: string | null
  item_tribunal: string | null
  item_classe: string | null
  item_suggestion: InterpretInput["suggestion"] | null
  item_attempts: number
}

/** A Triagem existe (migração 0012)? Sem ela, captura e interpretação ficam de fora. */
let triageTable: boolean | undefined
export async function hasTriage(admin: SupabaseClient) {
  if (triageTable === undefined) {
    const { error } = await admin.from("triage_items").select("id").limit(1)
    triageTable = !error
  }
  return triageTable
}

export function supabaseInterpretRepository(admin: SupabaseClient): InterpretRepository {
  return {
    async claim(limit, leaseMs) {
      const { data, error } = await admin.rpc("claim_triage_ai", { p_limit: limit, p_lease_seconds: Math.round(leaseMs / 1000) })
      if (error) throw error
      return ((data ?? []) as ClaimRow[]).map(
        (row): InterpretInput => ({
          id: row.item_id,
          organizationId: row.org_id,
          kind: row.item_kind,
          title: row.item_title,
          text: row.item_text,
          eventDate: row.item_event_date,
          availableAt: row.item_available_at ?? undefined,
          tribunal: row.item_tribunal ?? undefined,
          classe: row.item_classe ?? undefined,
          suggestion: row.item_suggestion ?? undefined,
          attempts: row.item_attempts ?? 0,
        }),
      )
    },

    async save(id, outcome) {
      const { error } = await admin.rpc(
        "save_triage_ai",
        outcome.ok
          ? { p_id: id, p_ai: outcome.ai, p_ok: true, p_review_reason: outcome.reviewReason ?? null }
          : {
              p_id: id,
              p_ai: null,
              p_ok: false,
              p_review_reason: null,
              p_retry_seconds: Math.round(outcome.retryAfterMs / 1000),
              p_count_attempt: outcome.countAttempt ?? true,
            },
      )
      if (error) throw error
    },
  }
}
