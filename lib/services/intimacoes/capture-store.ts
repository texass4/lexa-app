/**
 * Persistência da captura de intimações no Supabase (`0011_intimacoes.sql` e `0012_triagem.sql`).
 *
 * Service role (o agendador não tem sessão): toda leitura e gravação filtra por
 * escritório explicitamente ou passa por funções do banco que fazem isso. Somente servidor.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { runLog } from "@/lib/services/processes/monitor-store"
import type { CaptureRepository, ClaimedOab, OabHolder, OabState, ProcessMatch } from "./capture"

const STATES = "djen_oab_state"

const stateColumns = (state: OabState) => ({
  number: state.number,
  uf: state.uf,
  window_end: state.windowEnd ?? null,
  last_checked_at: state.lastCheckedAt,
  ...(state.lastSuccessAt ? { last_success_at: state.lastSuccessAt } : {}),
  last_result: state.lastResult,
  last_error: state.lastError,
  last_found: state.lastFound,
  consecutive_failures: state.consecutiveFailures,
  next_check_at: state.nextCheckAt,
  updated_at: new Date().toISOString(),
})

export function supabaseCaptureRepository(admin: SupabaseClient): CaptureRepository {
  return {
    ...runLog(admin, "intimacoes"),

    async claim(limit, leaseMs) {
      const { data, error } = await admin.rpc("claim_djen_oabs", { p_limit: limit, p_lease_seconds: Math.round(leaseMs / 1000) })
      if (error) throw error
      return ((data ?? []) as { oab_number: string; oab_uf: string; window_end: string | null; failures: number }[]).map(
        (row): ClaimedOab => ({ number: row.oab_number, uf: row.oab_uf, windowEnd: row.window_end ?? undefined, failures: row.failures ?? 0 }),
      )
    },

    async holders(oabs) {
      const numbers = [...new Set(oabs.map((o) => o.number))]
      const { data, error } = await admin.from("lawyer_oabs").select("id, organization_id, user_id, number, uf").in("number", numbers).eq("active", true)
      if (error) throw error
      const wanted = new Set(oabs.map((o) => `${o.number}/${o.uf}`))
      const rows = ((data ?? []) as { id: string; organization_id: string; user_id: string; number: string; uf: string }[]).filter((row) =>
        wanted.has(`${row.number}/${row.uf}`),
      )
      if (!rows.length) return []
      // Só pessoas ativas de escritórios ativos recebem intimações.
      const [people, orgs] = await Promise.all([
        admin.from("profiles").select("id").in("id", [...new Set(rows.map((r) => r.user_id))]).eq("active", true),
        admin.from("organizations").select("id").in("id", [...new Set(rows.map((r) => r.organization_id))]).eq("status", "active"),
      ])
      if (people.error) throw people.error
      if (orgs.error) throw orgs.error
      const activePeople = new Set((people.data as { id: string }[]).map((p) => p.id))
      const activeOrgs = new Set((orgs.data as { id: string }[]).map((o) => o.id))
      return rows
        .filter((row) => activePeople.has(row.user_id) && activeOrgs.has(row.organization_id))
        .map((row): OabHolder => ({ organizationId: row.organization_id, oabId: row.id, userId: row.user_id, number: row.number, uf: row.uf }))
    },

    async matchProcesses(organizationId, cnjs) {
      const { data, error } = await admin.rpc("match_processes_by_cnj", { p_org: organizationId, p_cnjs: cnjs })
      if (error) throw error
      return ((data ?? []) as { cnj: string; process_id: string; client_id: string | null; owner_id: string | null }[]).map(
        (row): ProcessMatch => ({ cnj: row.cnj, processId: row.process_id, clientId: row.client_id ?? undefined, ownerId: row.owner_id ?? undefined }),
      )
    },

    async save(rows) {
      const { data, error } = await admin.rpc("save_intimacoes", { p_rows: rows })
      if (error) throw error
      const saved = (data ?? []) as { inserted: boolean; linked: boolean }[]
      return { inserted: saved.filter((r) => r.inserted).length, linked: saved.filter((r) => r.inserted && r.linked).length }
    },

    async saveStates(states) {
      // Como no monitoramento: quem falhou não apaga o último sucesso (lote sem a coluna).
      const batches = [states.filter((s) => s.lastSuccessAt), states.filter((s) => !s.lastSuccessAt)].filter((b) => b.length)
      for (const batch of batches) {
        const { error } = await admin.from(STATES).upsert(batch.map(stateColumns), { onConflict: "number,uf" })
        if (error) throw error
      }
    },

    async release(claimed, now) {
      for (const oab of claimed) {
        const { error } = await admin
          .from(STATES)
          .update({ next_check_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("number", oab.number)
          .eq("uf", oab.uf)
        if (error) throw error
      }
    },

    async relink() {
      const { data, error } = await admin.rpc("relink_triage_items")
      if (error) throw error
      return Number(data ?? 0)
    },
  }
}
