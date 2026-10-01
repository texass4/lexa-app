/**
 * Persistência do monitoramento automático no Supabase (`0009_process_monitoring.sql`).
 *
 * Usa a service role — o worker não tem sessão de usuário. Por isso TODA leitura e
 * gravação aqui filtra por `organization_id` explicitamente: o isolamento entre
 * escritórios não depende da RLS neste caminho. Somente servidor.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { TriageItemInput } from "@/lib/triagem/sources"
import type { Activity, Process } from "@/types"
import type { ClaimedProcess, MonitoringState, MonitorRepository, ProcessRow, RunRecord, SaveOutcome } from "./monitor"
import { CLAIM_LEASE_MS } from "./monitoring-policy"

const RUNS = "process_sync_runs"
const STATES = "process_monitoring"
/** Execuções mais antigas que isso saem da tabela (o painel mostra as recentes). */
const RUN_RETENTION_DAYS = 90

type Row = { organization_id: string; id: string; data: Process; updated_at: string }

const toRow = (row: Row): ProcessRow => ({ organizationId: row.organization_id, id: row.id, data: row.data, version: row.updated_at })

const groupByOrg = <T extends { organizationId: string }>(items: T[]) => {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(item.organizationId, [...(groups.get(item.organizationId) ?? []), item])
  return groups
}

const runColumns = (record: RunRecord) => ({
  status: record.status,
  finished_at: record.finishedAt,
  duration_ms: record.durationMs,
  evaluated: record.evaluated,
  queried: record.queried,
  from_cache: record.fromCache,
  updated_processes: record.updatedProcesses,
  new_movements: record.newMovements,
  errors: record.errors,
  rate_limited: record.rateLimited,
  unavailable: record.unavailable,
  resume_after: record.resumeAfter,
  note: record.note,
})

const stateColumns = (state: MonitoringState) => ({
  organization_id: state.organizationId,
  process_id: state.processId,
  cnj: state.cnj,
  last_checked_at: state.lastCheckedAt,
  ...(state.lastSuccessAt ? { last_success_at: state.lastSuccessAt } : {}),
  last_result: state.lastResult,
  last_error: state.lastError,
  last_new_movements: state.lastNewMovements,
  consecutive_failures: state.consecutiveFailures,
  next_check_at: state.nextCheckAt,
  updated_at: new Date().toISOString(),
})

/** Função do banco ausente (migração ainda não aplicada). */
const isMissingFunction = (error: { code?: string }) => error.code === "PGRST202" || error.code === "42883"

/** Processo excluído entre a consulta e a gravação do estado (FK). */
const isMissingProcess = (error: { code?: string }) => error.code === "23503"

/** Tarefas que registram execuções em `process_sync_runs` (coluna `job`, migração 0011). */
export type RunJob = "processos" | "intimacoes"

/** A coluna `job` existe? Sem a 0011, o monitoramento continua funcionando (só processos). */
let jobColumn: boolean | undefined
export async function hasJobColumn(admin: SupabaseClient) {
  if (jobColumn === undefined) {
    const { error } = await admin.from(RUNS).select("job").limit(1)
    jobColumn = !error
  }
  return jobColumn
}

type RunLog = Pick<MonitorRepository, "pausedUntil" | "isRunning" | "startRun" | "finishRun" | "recordSkipped">

/** Registro das execuções de uma tarefa: pausa, "já rodando", início, fim e execuções ignoradas. */
export function runLog(admin: SupabaseClient, job: RunJob): RunLog {
  const withJob = async <T extends object>(row: T) => ((await hasJobColumn(admin)) ? { ...row, job } : row)

  return {
    async pausedUntil(now) {
      let query = admin.from(RUNS).select("resume_after").gt("resume_after", now.toISOString())
      if (await hasJobColumn(admin)) query = query.eq("job", job)
      const { data, error } = await query.order("resume_after", { ascending: false }).limit(1)
      if (error) throw error
      return (data?.[0] as { resume_after: string } | undefined)?.resume_after ?? null
    },

    async isRunning(now) {
      let query = admin
        .from(RUNS)
        .select("id")
        .eq("status", "running")
        .gt("started_at", new Date(now.getTime() - CLAIM_LEASE_MS).toISOString())
      if (await hasJobColumn(admin)) query = query.eq("job", job)
      const { data, error } = await query.limit(1)
      if (error) throw error
      return !!data?.length
    },

    async startRun(startedAt) {
      const { data, error } = await admin
        .from(RUNS)
        .insert(await withJob({ trigger: "cron", status: "running", started_at: startedAt.toISOString() }))
        .select("id")
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },

    async finishRun(id, record) {
      const { error } = await admin.from(RUNS).update(runColumns(record)).eq("id", id)
      if (error) throw error
      // Execuções que ficaram "rodando" (a função caiu no meio) não travam o painel para sempre.
      await admin
        .from(RUNS)
        .update({ status: "failed", note: "A execução não terminou (tempo esgotado ou falha do servidor)." })
        .eq("status", "running")
        .lt("started_at", new Date(Date.now() - CLAIM_LEASE_MS).toISOString())
      await admin
        .from(RUNS)
        .delete()
        .lt("started_at", new Date(Date.now() - RUN_RETENTION_DAYS * 86_400_000).toISOString())
    },

    async recordSkipped(record) {
      const { error } = await admin.from(RUNS).insert(await withJob({ trigger: "cron", started_at: record.startedAt, ...runColumns(record) }))
      if (error) throw error
    },
  }
}

export function supabaseMonitorRepository(admin: SupabaseClient): MonitorRepository {
  async function fetchProcess(organizationId: string, id: string): Promise<ProcessRow | null> {
    const { data, error } = await admin
      .from("processes")
      .select("organization_id, id, data, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle<Row>()
    if (error) throw error
    return data ? toRow(data) : null
  }

  return {
    ...runLog(admin, "processos"),

    async claim(limit, leaseMs) {
      const { data, error } = await admin.rpc("claim_process_monitoring", { p_limit: limit, p_lease_seconds: Math.round(leaseMs / 1000) })
      if (error) throw error
      return ((data ?? []) as { org_id: string; proc_id: string; cnj_digits: string; failures: number }[]).map(
        (row): ClaimedProcess => ({ organizationId: row.org_id, processId: row.proc_id, cnj: row.cnj_digits, failures: row.failures ?? 0 }),
      )
    },

    async loadProcesses(keys) {
      const rows: ProcessRow[] = []
      for (const [organizationId, items] of groupByOrg(keys)) {
        const { data, error } = await admin
          .from("processes")
          .select("organization_id, id, data, updated_at")
          .eq("organization_id", organizationId)
          .in(
            "id",
            items.map((item) => item.processId),
          )
        if (error) throw error
        rows.push(...((data ?? []) as Row[]).map(toRow))
      }
      return rows
    },

    async saveProcess(row, data): Promise<SaveOutcome> {
      // Mesma regra do navegador (`storage.ts`): só grava se ninguém mexeu desde a leitura.
      const { data: saved, error } = await admin
        .from("processes")
        .update({ data })
        .eq("organization_id", row.organizationId)
        .eq("id", row.id)
        .eq("updated_at", row.version)
        .select("id")
      if (error) throw error
      if (saved?.length) return { status: "saved" }
      return { status: "stale", current: await fetchProcess(row.organizationId, row.id) }
    },

    async insertActivities(activities: Activity[]) {
      const { error } = await admin.from("activities").insert(activities.map((a) => ({ organization_id: a.organizationId, id: a.id, data: a })))
      if (error) throw error
    },

    async saveTriageItems(items: TriageItemInput[]) {
      const { data, error } = await admin.rpc("save_triage_items", { p_items: items })
      if (error) {
        // Sem a migração 0012, a Triagem ainda não existe: o monitoramento segue igual.
        if (isMissingFunction(error)) return 0
        throw error
      }
      return Number(data ?? 0)
    },

    async saveStates(states) {
      // Num upsert em lote, coluna ausente em uma linha vira NULL: quem não teve sucesso
      // (e não deve apagar o último sucesso) vai num lote separado, sem a coluna.
      const batches = [states.filter((s) => s.lastSuccessAt), states.filter((s) => !s.lastSuccessAt)].filter((batch) => batch.length)
      for (const batch of batches) {
        const { error } = await admin.from(STATES).upsert(batch.map(stateColumns), { onConflict: "organization_id,process_id" })
        if (!error) continue
        if (!isMissingProcess(error)) throw error
        // Algum processo foi excluído no meio-tempo: grava os outros, um a um.
        for (const state of batch) {
          const { error: single } = await admin.from(STATES).upsert(stateColumns(state), { onConflict: "organization_id,process_id" })
          if (single && !isMissingProcess(single)) throw single
        }
      }
    },

    async release(claimed, now) {
      for (const [organizationId, items] of groupByOrg(claimed)) {
        const { error } = await admin
          .from(STATES)
          .update({ next_check_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("organization_id", organizationId)
          .in(
            "process_id",
            items.map((item) => item.processId),
          )
        if (error) throw error
      }
    },
  }
}
