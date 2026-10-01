"use client"

import * as React from "react"
import { Activity, CircleCheck, CircleX, Gauge, Radar, RefreshCw, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useAdminData } from "@/lib/admin/client"
import type { Tone } from "@/lib/config"
import type { MonitorHealth, MonitoringOverview, MonitoringRun } from "@/lib/services/processes/monitor-status"
import type { RunJob } from "@/lib/services/processes/monitor-store"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { AdminHeader } from "../ui/admin-header"
import { StatCard } from "../ui/stat-card"

const HEALTH: Record<MonitorHealth, { tone: Tone; label: string; hint: string }> = {
  active: { tone: "success", label: "Ativo", hint: "Execuções concluídas nas últimas 26 h" },
  waiting: { tone: "neutral", label: "Aguardando", hint: "Configurado; ainda sem nenhuma execução" },
  paused: { tone: "warning", label: "Pausado", hint: "A fonte limitou as consultas" },
  failing: { tone: "danger", label: "Parado", hint: "Nenhuma execução concluída nas últimas 26 h" },
  disabled: { tone: "neutral", label: "Desativado", hint: "Consulta automática desligada em Configurações" },
  unconfigured: { tone: "warning", label: "Não configurado", hint: "Falta configuração no servidor" },
}

const RUN_STATUS: Record<MonitoringRun["status"], { tone: Tone; label: string }> = {
  running: { tone: "info", label: "Rodando" },
  completed: { tone: "success", label: "Concluída" },
  partial: { tone: "warning", label: "Parcial" },
  failed: { tone: "danger", label: "Falhou" },
  skipped: { tone: "neutral", label: "Ignorada" },
}

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const fmtTimeOnly = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const fmtDuration = (ms: number | null) =>
  ms === null ? "—" : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`
const n = (value: number | null) => (value === null ? "—" : value.toLocaleString("pt-BR"))

/** Soma das execuções das últimas 24 h. */
function last24h(runs: MonitoringRun[]) {
  const since = Date.now() - 24 * 3_600_000
  return runs
    .filter((r) => Date.parse(r.startedAt) >= since)
    .reduce(
      (acc, r) => ({
        runs: acc.runs + (r.status === "skipped" ? 0 : 1),
        queried: acc.queried + r.queried,
        newMovements: acc.newMovements + r.newMovements,
        errors: acc.errors + r.errors,
        rateLimited: acc.rateLimited + r.rateLimited,
        unavailable: acc.unavailable + r.unavailable,
      }),
      { runs: 0, queried: 0, newMovements: 0, errors: 0, rateLimited: 0, unavailable: 0 },
    )
}

function SetupCheck({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      {ok ? <CircleCheck className="mt-px size-4 shrink-0 text-success" /> : <CircleX className="mt-px size-4 shrink-0 text-danger" />}
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      </div>
    </li>
  )
}

const Num = ({ value, tone }: { value: number; tone?: "warning" | "danger" | "success" }) => (
  <span
    className={cn(
      "tabular",
      value === 0
        ? "text-subtle"
        : tone === "danger"
          ? "text-danger"
          : tone === "warning"
            ? "text-warning"
            : tone === "success"
              ? "text-success"
              : "",
    )}
  >
    {value.toLocaleString("pt-BR")}
  </span>
)

export function MonitoringView() {
  const { data, error, loading, reload } = useAdminData<MonitoringOverview>("/api/admin/monitoring")
  // Processos (Etapa 5) ou intimações do DJEN (Etapa 8): mesmo agendador, mesmo registro.
  const [job, setJob] = React.useState<RunJob>("processos")
  const djen = job === "intimacoes" ? data?.intimacoes : null
  const status = djen ? djen.status : data?.status
  const setup = djen ? djen.setup : data?.setup
  const runs = data ? data.runs.filter((r) => r.job === job) : []
  const health = status ? HEALTH[status.health] : null
  const day = data ? last24h(runs) : null
  const labels =
    job === "processos" ? { evaluated: "Avaliados", third: "Do cache", news: "Novidades" } : { evaluated: "OABs", third: "Vinculadas", news: "Novas" }
  const third = (r: MonitoringRun) => (job === "processos" ? r.fromCache : r.updatedProcesses)

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Sistema"
        title="Monitoramento"
        description="Atualização automática das movimentações e captura das intimações do DJEN. Cada processo e cada OAB são consultados no máximo uma vez por dia; limite (429) e indisponibilidade (503) da fonte ativam espera automática."
        actions={
          <Button variant="secondary" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={cn(loading && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {error && !data ? (
        <Panel>
          <ErrorState onRetry={reload} description={error} />
        </Panel>
      ) : !data || !health || !day || !status || !setup ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[120px] rounded-[14px]" />
            ))}
          </div>
          <SkeletonTable rows={8} />
        </div>
      ) : (
        <>
          {data.intimacoes && (
            <FilterTabs
              ariaLabel="Tarefa"
              layoutId="monitoring-job"
              value={job}
              onChange={setJob}
              className="mx-0 px-0"
              options={[
                { value: "processos", label: "Processos (DataJud)" },
                { value: "intimacoes", label: "Intimações (DJEN)" },
              ]}
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Estado"
              value={
                <StatusBadge tone={health.tone} size="default">
                  {health.label}
                </StatusBadge>
              }
              icon={<Radar />}
              hint={
                status.health === "paused" && status.resumeAfter
                  ? `Volta às ${fmtTimeOnly(status.resumeAfter)}`
                  : status.lastHealthyRunAt
                    ? `Última execução concluída em ${fmtDateTime(status.lastHealthyRunAt)}`
                    : health.hint
              }
              hintTone={health.tone === "success" ? undefined : health.tone}
            />
            {djen ? (
              <StatCard
                label="OABs cadastradas (ativas)"
                value={n(djen.oabs.active)}
                icon={<Gauge />}
                hint={djen.oabs.failing ? `${n(djen.oabs.failing)} com falha na última consulta` : "Nenhuma com falha na última consulta"}
                hintTone={djen.oabs.failing ? "warning" : undefined}
              />
            ) : (
              <StatCard
                label="Processos monitorados"
                value={n(data.queue.monitored)}
                icon={<Gauge />}
                hint={data.queue.failing ? `${n(data.queue.failing)} com falha na última consulta` : "Nenhum com falha na última consulta"}
                hintTone={data.queue.failing ? "warning" : undefined}
              />
            )}
            <StatCard
              label="Consultas à fonte (24 h)"
              value={n(day.queried)}
              icon={<Activity />}
              hint={
                djen
                  ? `${day.runs} ${day.runs === 1 ? "execução" : "execuções"} · cada OAB uma vez por dia`
                  : `${day.runs} ${day.runs === 1 ? "execução" : "execuções"} · lote de ${data.config.batchSize}, ${data.config.concurrency} por vez`
              }
            />
            <StatCard
              label={djen ? "Intimações novas (24 h)" : "Novidades (24 h)"}
              value={n(day.newMovements)}
              icon={<TriangleAlert />}
              hint={`${day.errors} erros · ${day.rateLimited} × 429 · ${day.unavailable} × 503`}
              hintTone={day.rateLimited || day.unavailable ? "warning" : undefined}
            />
          </div>

          {status.health !== "active" && (
            <Panel>
              <PanelHeader
                title="Configuração"
                description={
                  djen
                    ? "A captura só aparece como ativa quando tudo abaixo está pronto e uma execução foi concluída. O servidor precisa rodar no Brasil: a fonte recusa (403) acessos de outros países."
                    : "O monitoramento só aparece como ativo quando tudo abaixo está pronto e uma execução foi concluída."
                }
              />
              <ul className="divide-y divide-border px-5 pb-3">
                <SetupCheck
                  ok={setup.enabled}
                  label={djen ? "Captura de intimações (DJEN) ligada" : "Consulta automática ligada"}
                  hint={
                    djen ? "Admin › Configurações › Recursos — depois de confirmar os termos de uso da fonte." : "Admin › Configurações › Recursos."
                  }
                />
                <SetupCheck
                  ok={setup.cronSecret}
                  label="Segredo do agendador (CRON_SECRET)"
                  hint="Variável de ambiente do servidor, com 16 caracteres ou mais."
                />
                {!djen && (
                  <SetupCheck ok={setup.sourceKey} label="Chave da consulta processual (DATAJUD_API_KEY)" hint="Variável de ambiente do servidor." />
                )}
                {djen ? (
                  <SetupCheck
                    ok={(djen.oabs.active ?? 0) > 0}
                    label="Advogados com OAB cadastrada"
                    hint="Configurações › Perfil › Inscrições na OAB (ou pelo Sócio, em Usuários)."
                  />
                ) : (
                  <SetupCheck
                    ok={data.queue.monitored !== null}
                    label="Tabelas do monitoramento"
                    hint="supabase/migrations/0009_process_monitoring.sql aplicada no banco."
                  />
                )}
                <SetupCheck
                  ok={!!status.lastRunAt}
                  label="Agendador chamando o worker"
                  hint={
                    status.lastRunAt
                      ? `Última chamada em ${fmtDateTime(status.lastRunAt)}.`
                      : "Nenhuma chamada recebida em /api/cron/process-sync (ex.: a cada hora, com Authorization: Bearer <CRON_SECRET>)."
                  }
                />
              </ul>
            </Panel>
          )}

          {runs.length === 0 ? (
            <TableShell>
              <EmptyState
                icon={<Radar />}
                title="Nenhuma execução registrada."
                description="As execuções aparecem aqui assim que o agendador chamar o worker."
              />
            </TableShell>
          ) : (
            <TableShell className={cn("transition-opacity", loading && "opacity-60")}>
              {/* Celular: lista compacta. */}
              <ul className="divide-y divide-border md:hidden">
                {runs.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tabular text-[12.5px] text-muted-foreground">{fmtDateTime(r.startedAt)}</span>
                      <StatusBadge tone={RUN_STATUS[r.status].tone} size="sm">
                        {RUN_STATUS[r.status].label}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-[12.5px]">
                      {r.evaluated} {labels.evaluated.toLowerCase()} · {r.queried} consultados · {r.newMovements} {labels.news.toLowerCase()} ·{" "}
                      {r.errors} erros
                      {r.rateLimited ? ` · ${r.rateLimited} × 429` : ""}
                      {r.unavailable ? ` · ${r.unavailable} × 503` : ""}
                    </p>
                    {r.note && <p className="mt-0.5 text-[12px] text-muted-foreground">{r.note}</p>}
                  </li>
                ))}
              </ul>
              <div className="overflow-x-auto thin-scrollbar max-md:hidden">
                <table className="w-full min-w-[980px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <Th>Início</Th>
                      <Th>Situação</Th>
                      <Th className="text-right">Duração</Th>
                      <Th className="text-right">{labels.evaluated}</Th>
                      <Th className="text-right">Consultados</Th>
                      <Th className="text-right">{labels.third}</Th>
                      <Th className="text-right">{labels.news}</Th>
                      <Th className="text-right">Erros</Th>
                      <Th className="text-right">429</Th>
                      <Th className="text-right">503</Th>
                      <Th>Observação</Th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child_td]:border-0">
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <Td className="tabular whitespace-nowrap text-[12.5px] text-muted-foreground">{fmtDateTime(r.startedAt)}</Td>
                        <Td>
                          <StatusBadge tone={RUN_STATUS[r.status].tone} size="sm">
                            {RUN_STATUS[r.status].label}
                          </StatusBadge>
                        </Td>
                        <Td className="tabular text-right text-muted-foreground">{fmtDuration(r.durationMs)}</Td>
                        <Td className="text-right">
                          <Num value={r.evaluated} />
                        </Td>
                        <Td className="text-right">
                          <Num value={r.queried} />
                        </Td>
                        <Td className="text-right">
                          <Num value={third(r)} />
                        </Td>
                        <Td className="text-right">
                          <Num value={r.newMovements} tone="success" />
                        </Td>
                        <Td className="text-right">
                          <Num value={r.errors} tone="danger" />
                        </Td>
                        <Td className="text-right">
                          <Num value={r.rateLimited} tone="warning" />
                        </Td>
                        <Td className="text-right">
                          <Num value={r.unavailable} tone="warning" />
                        </Td>
                        <Td className="max-w-[280px] truncate text-muted-foreground" title={r.note ?? undefined}>
                          {r.note ?? "—"}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableShell>
          )}
        </>
      )}
    </div>
  )
}
