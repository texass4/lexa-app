/**
 * Execuções da consulta processual no Supabase (`process_enrichment_runs`, migração
 * 0020). Somente servidor.
 *
 * - Escrita: só com a service role, SEMPRE filtrando pelo escritório de quem pediu
 *   (`organization_id` explícito em toda consulta e gravação).
 * - Leitura para a tela: com a sessão de quem chama (RLS: escritório + `processes.view`)
 *   e só as colunas públicas — `internal_errors` nunca sai daqui.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { EnrichmentRun, RunStatus } from "./types"
import type { RunState } from "./workflow"

const TABLE = "process_enrichment_runs"

/** Colunas que a tela pode ler (o GRANT da migração é o mesmo). */
export const PUBLIC_COLUMNS =
  "id, process_id, cnj, status, forced, started_at, finished_at, duration_ms, steps, sources, report, found_fields, missing_fields, data_version"

/** Execução "rodando" há mais que isso morreu com o servidor: vira falha. */
export const STALE_RUNNING_MS = 5 * 60_000
/** Execuções guardadas por processo (as mais recentes). */
export const KEEP_PER_PROCESS = 10

export interface RunRow {
  id: string
  process_id: string | null
  cnj: string
  status: RunStatus
  forced: boolean
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  steps: EnrichmentRun["steps"]
  sources: EnrichmentRun["sources"]
  report: EnrichmentRun["report"] | null
  found_fields: string[]
  missing_fields: string[]
  data_version: string | null
}

export const toRun = (row: RunRow): EnrichmentRun => ({
  id: row.id,
  cnj: row.cnj,
  processId: row.process_id ?? undefined,
  status: row.status,
  forced: row.forced,
  startedAt: row.started_at,
  finishedAt: row.finished_at ?? undefined,
  durationMs: row.duration_ms ?? undefined,
  steps: row.steps ?? [],
  sources: row.sources ?? [],
  report: row.report ?? undefined,
  foundFields: row.found_fields ?? [],
  missingFields: row.missing_fields ?? [],
  dataVersion: row.data_version ?? undefined,
})

export interface NewRun {
  organizationId: string
  processId?: string | null
  cnj: string
  requestedBy: string
  forced: boolean
  state: RunState
}

export interface EnrichmentStore {
  /** Execução recente concluída (reaproveitada sem consultar de novo). */
  findRecent(organizationId: string, cnj: string, sinceIso: string): Promise<{ id: string } | null>
  /** Execução em andamento (pedido repetido reaproveita). */
  findRunning(organizationId: string, cnj: string): Promise<{ id: string; startedAt: string } | null>
  /** Marca como falha as execuções "rodando" antigas demais. */
  expireStale(organizationId: string, cnj: string, beforeIso: string): Promise<void>
  /** `null` quando já existe uma execução em andamento (corrida entre dois pedidos). */
  create(run: NewRun): Promise<string | null>
  update(organizationId: string, id: string, state: RunState, final: boolean, finishedAt?: string): Promise<void>
  prune(organizationId: string, cnj: string, keep: number): Promise<void>
}

const publicState = (state: RunState) => ({
  status: state.status,
  steps: state.steps,
  sources: state.sources,
})

export function supabaseEnrichmentStore(admin: SupabaseClient): EnrichmentStore {
  return {
    async findRecent(organizationId, cnj, sinceIso) {
      const { data, error } = await admin
        .from(TABLE)
        .select("id")
        .eq("organization_id", organizationId)
        .eq("cnj", cnj)
        .in("status", ["completed", "partial"])
        .gte("finished_at", sinceIso)
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>()
      if (error) throw error
      return data
    },

    async findRunning(organizationId, cnj) {
      const { data, error } = await admin
        .from(TABLE)
        .select("id, started_at")
        .eq("organization_id", organizationId)
        .eq("cnj", cnj)
        .eq("status", "running")
        .limit(1)
        .maybeSingle<{ id: string; started_at: string }>()
      if (error) throw error
      return data ? { id: data.id, startedAt: data.started_at } : null
    },

    async expireStale(organizationId, cnj, beforeIso) {
      const { error } = await admin
        .from(TABLE)
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          internal_errors: [{ source: "workflow", code: "STALE", detail: "execução interrompida (servidor reiniciado ou prazo excedido)" }],
        })
        .eq("organization_id", organizationId)
        .eq("cnj", cnj)
        .eq("status", "running")
        .lt("started_at", beforeIso)
      if (error) throw error
    },

    async create(run) {
      const { data, error } = await admin
        .from(TABLE)
        .insert({
          organization_id: run.organizationId,
          process_id: run.processId ?? null,
          cnj: run.cnj,
          requested_by: run.requestedBy,
          forced: run.forced,
          ...publicState(run.state),
        })
        .select("id")
        .single<{ id: string }>()
      if (error) {
        // Índice "uma em andamento por número": outro pedido chegou antes.
        if (error.code === "23505") return null
        throw error
      }
      return data.id
    },

    async update(organizationId, id, state, final, finishedAt) {
      const patch: Record<string, unknown> = publicState(state)
      if (final) {
        Object.assign(patch, {
          report: state.report ?? null,
          found_fields: state.foundFields,
          missing_fields: state.missingFields,
          data_version: state.dataVersion ?? null,
          internal_errors: state.internalErrors,
          duration_ms: state.durationMs ?? null,
          finished_at: finishedAt ?? new Date().toISOString(),
        })
      }
      const { error } = await admin.from(TABLE).update(patch).eq("organization_id", organizationId).eq("id", id)
      if (error) throw error
    },

    async prune(organizationId, cnj, keep) {
      const { data, error } = await admin
        .from(TABLE)
        .select("id")
        .eq("organization_id", organizationId)
        .eq("cnj", cnj)
        .neq("status", "running")
        .order("started_at", { ascending: false })
        .range(keep, keep + 200)
      if (error) throw error
      const ids = (data ?? []).map((r: { id: string }) => r.id)
      if (ids.length) {
        const { error: deleteError } = await admin.from(TABLE).delete().eq("organization_id", organizationId).in("id", ids)
        if (deleteError) throw deleteError
      }
    },
  }
}

/** Leitura com a sessão de quem chama (RLS). `null` = não existe ou é de outro escritório. */
export async function readRun(session: SupabaseClient, id: string): Promise<EnrichmentRun | null> {
  const { data, error } = await session.from(TABLE).select(PUBLIC_COLUMNS).eq("id", id).maybeSingle<RunRow>()
  if (error) throw error
  return data ? toRun(data) : null
}

/** Última execução de um processo do escritório (RLS). */
export async function latestRunForProcess(session: SupabaseClient, processId: string): Promise<EnrichmentRun | null> {
  const { data, error } = await session
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .eq("process_id", processId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<RunRow>()
  if (error) throw error
  return data ? toRun(data) : null
}
