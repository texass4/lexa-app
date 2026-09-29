import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { loadSettings } from "@/lib/admin/platform"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { loadMonitorStatus, monitorSetup, type MonitoringOverview, type MonitoringRun } from "@/lib/services/processes/monitor-status"
import { monitorConfig } from "@/lib/services/processes/monitoring-policy"
import { hasJobColumn } from "@/lib/services/processes/monitor-store"
import { hasTriage } from "@/lib/services/triagem/store"

/** Execuções mostradas no painel. */
const LIMIT = 120

type RunRow = {
  id: string
  job?: MonitoringRun["job"]
  status: MonitoringRun["status"]
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  evaluated: number
  queried: number
  from_cache: number
  updated_processes: number
  new_movements: number
  errors: number
  rate_limited: number
  unavailable: number
  resume_after: string | null
  note: string | null
}

const toRun = (r: RunRow): MonitoringRun => ({
  id: r.id,
  job: r.job ?? "processos",
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  durationMs: r.duration_ms,
  evaluated: r.evaluated,
  queried: r.queried,
  fromCache: r.from_cache,
  updatedProcesses: r.updated_processes,
  newMovements: r.new_movements,
  errors: r.errors,
  rateLimited: r.rate_limited,
  unavailable: r.unavailable,
  resumeAfter: r.resume_after,
  note: r.note,
})

/**
 * Admin › Monitoramento: estado, fila e as últimas execuções do monitoramento de
 * processos e da captura de intimações (DJEN).
 * Só números da plataforma — nenhum dado de processo ou de escritório sai daqui.
 */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const admin = getSupabaseAdmin()
  const now = new Date()
  const settings = await loadSettings({ fresh: true })
  const setup = monitorSetup(settings.features.datajud)

  const count = (build: (q: ReturnType<typeof admin.from>) => PromiseLike<{ count: number | null; error: unknown }>) =>
    build(admin.from("process_monitoring")).then(({ count, error }) => (error ? null : (count ?? 0)))

  const [status, runs, monitored, due, failing] = await Promise.all([
    loadMonitorStatus(admin, setup, now),
    admin
      .from("process_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data, error }) => (error ? [] : ((data ?? []) as RunRow[]).map(toRun))),
    count((q) => q.select("process_id", { count: "exact", head: true })),
    count((q) => q.select("process_id", { count: "exact", head: true }).lte("next_check_at", now.toISOString())),
    count((q) => q.select("process_id", { count: "exact", head: true }).gt("consecutive_failures", 0)),
  ])

  // Captura de intimações: só com as migrações 0011 e 0012 (Triagem) aplicadas. A fonte (DJEN) não tem chave.
  let intimacoes: MonitoringOverview["intimacoes"] = null
  if ((await hasJobColumn(admin)) && (await hasTriage(admin))) {
    const djenSetup = { ...monitorSetup(settings.features.djen), sourceKey: true }
    const oabCount = (failing: boolean) => {
      const query = failing
        ? admin.from("djen_oab_state").select("number", { count: "exact", head: true }).gt("consecutive_failures", 0)
        : admin.from("lawyer_oabs").select("id", { count: "exact", head: true }).eq("active", true)
      return query.then(({ count, error }) => (error ? null : (count ?? 0)))
    }
    const [djenStatus, active, failingOabs] = await Promise.all([loadMonitorStatus(admin, djenSetup, now, "intimacoes"), oabCount(false), oabCount(true)])
    intimacoes = { status: djenStatus, setup: djenSetup, oabs: { active, failing: failingOabs } }
  }

  const body: MonitoringOverview = { status, setup, config: monitorConfig(), queue: { monitored, due, failing }, runs, intimacoes }
  return NextResponse.json(body)
})
