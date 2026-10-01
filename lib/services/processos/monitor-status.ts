/**
 * Estado real do monitoramento automático — uma definição só de "ativo", usada pelo
 * painel do Super Admin e pelo cartão de Configurações do escritório.
 *
 * "Ativo" exige tudo isto: consulta ligada pela administração, segredo do agendador
 * e chave da fonte configurados no servidor, e uma execução que de fato consultou
 * (concluída ou parcial) nas últimas 26 h. Configurado não é o mesmo que funcionando.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { MONITOR_HEALTHY_WITHIN_MS, type MonitorConfig } from "./monitoring-policy"
import { hasJobColumn, type RunJob } from "./monitor-store"

export type MonitorHealth = "active" | "waiting" | "paused" | "failing" | "disabled" | "unconfigured"

export interface MonitorStatus {
  health: MonitorHealth
  /** Fim da última execução que consultou (concluída ou parcial). ISO UTC. */
  lastHealthyRunAt: string | null
  /** Início da última execução de qualquer tipo. ISO UTC. */
  lastRunAt: string | null
  /** Pausa em vigor (429 / fonte fora). ISO UTC. */
  resumeAfter: string | null
}

export interface MonitorSetup {
  /** Consulta automática ligada em Admin › Configurações › Recursos. */
  enabled: boolean
  /** `CRON_SECRET` definido no servidor. */
  cronSecret: boolean
  /** `DATAJUD_API_KEY` definida no servidor. */
  sourceKey: boolean
}

/** Uma execução do worker, como o painel do Super Admin mostra (`process_sync_runs`). */
export interface MonitoringRun {
  id: string
  /** Monitoramento de processos ou captura de intimações (mesma tabela). */
  job: RunJob
  status: "running" | "completed" | "partial" | "failed" | "skipped"
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  /** Processos elegíveis reservados. */
  evaluated: number
  /** Idas reais à fonte. */
  queried: number
  fromCache: number
  updatedProcesses: number
  newMovements: number
  /** Todas as falhas (inclui 429 e 503). */
  errors: number
  rateLimited: number
  unavailable: number
  resumeAfter: string | null
  note: string | null
}

/** Resposta de `GET /api/admin/monitoring`. Contagens `null` = tabela ainda não criada. */
export interface MonitoringOverview {
  status: MonitorStatus
  setup: MonitorSetup
  config: MonitorConfig
  queue: { monitored: number | null; due: number | null; failing: number | null }
  runs: MonitoringRun[]
  /** Captura de intimações do DJEN (Etapa 8). `null` = migrações 0011/0012 não aplicadas. */
  intimacoes: {
    status: MonitorStatus
    setup: MonitorSetup
    /** Inscrições na OAB ativas e com falha na última consulta. */
    oabs: { active: number | null; failing: number | null }
  } | null
}

interface RunFacts {
  /** Tabela ausente (migração 0009 não aplicada). */
  missing: boolean
  lastRunAt: string | null
  lastHealthyRunAt: string | null
  resumeAfter: string | null
}

export function monitorHealth(setup: MonitorSetup, facts: RunFacts, now: Date): MonitorHealth {
  if (!setup.enabled) return "disabled"
  if (!setup.cronSecret || !setup.sourceKey || facts.missing) return "unconfigured"
  if (facts.lastHealthyRunAt && now.getTime() - Date.parse(facts.lastHealthyRunAt) <= MONITOR_HEALTHY_WITHIN_MS) return "active"
  if (facts.resumeAfter && Date.parse(facts.resumeAfter) > now.getTime()) return "paused"
  return facts.lastRunAt ? "failing" : "waiting"
}

export const monitorSetup = (enabled: boolean, env: Record<string, string | undefined> = process.env): MonitorSetup => ({
  enabled,
  cronSecret: (env.CRON_SECRET ?? "").trim().length >= 16,
  sourceKey: !!(env.DATAJUD_API_KEY ?? "").trim(),
})

const isMissingTable = (error: { code?: string }) => error.code === "42P01" || error.code === "PGRST205"

/** Lê as execuções com a service role. Somente servidor. */
export async function loadMonitorStatus(admin: SupabaseClient, setup: MonitorSetup, now = new Date(), job: RunJob = "processos"): Promise<MonitorStatus> {
  // Só as execuções do monitoramento de processos (a captura de intimações registra na mesma tabela).
  const byJob = await hasJobColumn(admin)
  const runs = (columns: string) => {
    const query = admin.from("process_sync_runs").select(columns)
    return byJob ? query.eq("job", job) : query
  }
  const [last, healthy, pause] = await Promise.all([
    runs("started_at").order("started_at", { ascending: false }).limit(1),
    runs("finished_at").in("status", ["completed", "partial"]).order("finished_at", { ascending: false }).limit(1),
    runs("resume_after").gt("resume_after", now.toISOString()).order("resume_after", { ascending: false }).limit(1),
  ])
  const error = last.error ?? healthy.error ?? pause.error
  if (error && !isMissingTable(error)) throw error

  const facts: RunFacts = {
    missing: !!error,
    lastRunAt: (last.data?.[0] as { started_at: string } | undefined)?.started_at ?? null,
    lastHealthyRunAt: (healthy.data?.[0] as { finished_at: string | null } | undefined)?.finished_at ?? null,
    resumeAfter: (pause.data?.[0] as { resume_after: string } | undefined)?.resume_after ?? null,
  }
  return {
    health: monitorHealth(setup, facts, now),
    lastHealthyRunAt: facts.lastHealthyRunAt,
    lastRunAt: facts.lastRunAt,
    resumeAfter: facts.resumeAfter,
  }
}
