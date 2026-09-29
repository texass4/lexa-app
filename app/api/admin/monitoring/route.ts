import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { loadSettings } from "@/lib/admin/platform"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { loadMonitorStatus, monitorSetup, type MonitoringOverview, type MonitoringRun } from "@/lib/services/processes/monitor-status"
import { monitorConfig } from "@/lib/services/processes/monitoring-policy"

/** Execuções mostradas no painel. */
const LIMIT = 60

type RunRow = {
  id: string
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
 * Admin › Monitoramento: estado, fila e as últimas execuções do worker de processos.
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

  const body: MonitoringOverview = { status, setup, config: monitorConfig(), queue: { monitored, due, failing }, runs }
  return NextResponse.json(body)
})
