"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  FileText,
  ListChecks,
  MessageCircle,
  RefreshCw,
  Scale,
  UsersRound,
  Wallet,
  Wrench,
} from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { ErrorState } from "@/components/ui/empty-state"
import { Skeleton, SkeletonStats } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/motion"
import { useAdminData } from "@/lib/admin/client"
import { formatBytes, formatCents, formatCount, growth, LIMIT_META, type OverviewData } from "@/lib/admin/catalog"
import { AdminHeader, SectionTitle } from "../ui/admin-header"
import { Delta, StatCard } from "../ui/stat-card"
import { PeriodFilter, usePeriod } from "../ui/period-filter"
import { BarList, BarsChart, TrendChart } from "../ui/charts"
import { toChart } from "../ui/badges"
import { AttentionList } from "../ui/attention-list"
import { AuditList } from "../ui/audit-list"
import { useAdminShell } from "../shell/admin-context"

type UsageMetric = "processes" | "clients" | "tasks" | "documents" | "appointments"
const USAGE_METRICS: { value: UsageMetric; label: string; unit: string }[] = [
  { value: "processes", label: "Processos", unit: "processos" },
  { value: "clients", label: "Clientes", unit: "clientes" },
  { value: "tasks", label: "Tarefas", unit: "tarefas" },
  { value: "documents", label: "Documentos", unit: "documentos" },
  { value: "appointments", label: "Agenda", unit: "compromissos" },
]

function MiniStat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3 shadow-card">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11.5px] text-muted-foreground">{label}</p>
        <p className="tabular truncate text-[15px] font-semibold tracking-[-0.01em]">
          {value}
          {detail && <span className="ml-1 text-[11.5px] font-normal text-subtle">{detail}</span>}
        </p>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-[12px]" />
        ))}
      </div>
      <SkeletonStats />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] rounded-[12px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[290px] rounded-[14px]" />
        <Skeleton className="h-[290px] rounded-[14px]" />
      </div>
    </div>
  )
}

export function AdminDashboardView() {
  const { admin } = useAdminShell()
  const { period, update, query } = usePeriod("30d")
  const { data, error, loading, reload } = useAdminData<OverviewData>(`/api/admin/overview?${query}`)
  const [metric, setMetric] = React.useState<UsageMetric>("processes")

  const k = data?.kpis
  const metricMeta = USAGE_METRICS.find((m) => m.value === metric)!
  const periodTotal = (key: UsageMetric | "logins" | "organizations" | "users") => data?.series.reduce((acc, p) => acc + p[key], 0) ?? 0

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="Lexa Admin"
        title={`Olá, ${admin.name.split(/\s+/)[0]}`}
        description="A operação da plataforma em um só lugar — o que cresceu, o que está no limite e o que pede sua ação."
        actions={
          <div className="flex items-center gap-2">
            <PeriodFilter period={period} onChange={update} />
            <Button variant="ghost" size="icon-sm" aria-label="Atualizar" onClick={reload} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {error && !data ? (
        <Panel>
          <ErrorState onRetry={reload} description={error} />
        </Panel>
      ) : !data || !k ? (
        <DashboardSkeleton />
      ) : (
        <FadeIn className={cn("space-y-8 transition-opacity", loading && "opacity-60")}>
          {data.maintenance && (
            <Link
              href="/admin/configuracoes#manutencao"
              className="flex items-center gap-3 rounded-[14px] border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] text-warning outline-none hover:border-warning/40 focus-visible:ring-2 focus-visible:ring-gold/45"
            >
              <Wrench className="size-4 shrink-0" />
              <span className="flex-1">
                <strong className="font-semibold">Modo manutenção ligado.</strong> Nenhum escritório está conseguindo acessar o LEXA.
              </span>
              <span className="flex items-center gap-1 font-medium">
                Desligar <ArrowRight className="size-3.5" />
              </span>
            </Link>
          )}

          <section className="space-y-3">
            <SectionTitle title="Precisa da sua atenção" description="Pendências atuais, da mais urgente para a menos." />
            <AttentionList items={data.attention} />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Escritórios ativos"
              value={formatCount(k.organizations.active)}
              icon={<Building2 />}
              hint={`${k.organizations.trial} em teste · ${k.organizations.pending} aguardando · ${k.organizations.suspended + k.organizations.inactive} inativos`}
              href="/admin/escritorios?status=active"
              action="Ver"
            />
            <StatCard
              label="Usuários"
              value={formatCount(k.users.total)}
              icon={<UsersRound />}
              delta={growth(k.users.newCurrent, k.users.newPrevious)}
              hint={`${k.users.active} ativos · ${k.users.signedInPeriod} entraram no período`}
              href="/admin/usuarios"
              action="Ver"
            />
            <StatCard
              label="Receita recorrente (MRR)"
              value={formatCents(k.mrrCents)}
              icon={<Wallet />}
              hint={k.unpricedPlans ? `${k.unpricedPlans} plano(s) sem preço — estimativa parcial` : `${k.payingOrganizations} assinantes · estimado pelos planos`}
              hintTone={k.unpricedPlans ? "gold" : undefined}
              href={k.unpricedPlans ? "/admin/planos" : "/admin/financeiro"}
              action={k.unpricedPlans ? "Definir preços" : "Financeiro"}
            />
            <StatCard
              label="Novos escritórios"
              value={formatCount(k.newOrganizations.current)}
              icon={<Building2 />}
              delta={growth(k.newOrganizations.current, k.newOrganizations.previous)}
              hint={`${k.newOrganizations.previous} no período anterior`}
              href="/admin/escritorios?ordem=recentes"
              action="Ver"
            />
          </section>

          <section className="space-y-3">
            <SectionTitle title="Volume na plataforma" description="Totais atuais somando todos os escritórios. WhatsApp e IA contam o mês corrente." />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniStat icon={<Scale />} label="Processos cadastrados" value={formatCount(k.totals.processes)} />
              <MiniStat icon={<UsersRound />} label="Clientes cadastrados" value={formatCount(k.totals.clients)} />
              <MiniStat icon={<FileText />} label="Documentos armazenados" value={formatCount(k.totals.documents)} detail={formatBytes(k.totals.storageBytes)} />
              <MiniStat icon={<ListChecks />} label="Tarefas criadas" value={formatCount(k.totals.tasks)} />
              <MiniStat icon={<CalendarClock />} label="Compromissos" value={formatCount(k.totals.appointments)} />
              <MiniStat icon={<MessageCircle />} label="Mensagens WhatsApp" value={formatCount(k.totals.whatsappMonth)} detail="no mês" />
              <MiniStat icon={<Bot />} label="Uso de IA" value={formatCount(k.totals.aiMonth)} detail="chamadas no mês" />
              <MiniStat icon={<Building2 />} label="Escritórios no total" value={formatCount(k.organizations.total)} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Crescimento de escritórios"
                description={`${periodTotal("organizations")} novos no período · total acumulado`}
                action={<Delta value={growth(k.newOrganizations.current, k.newOrganizations.previous)} />}
              />
              <div className="px-3 pb-4">
                <TrendChart id="orgs" data={toChart(data.series, "totalOrganizations")} unit="escritórios" label="Total de escritórios por dia no período" />
              </div>
            </Panel>
            <Panel>
              <PanelHeader
                title="Crescimento de usuários"
                description={`${periodTotal("users")} novos no período · total acumulado`}
                action={<Delta value={growth(k.users.newCurrent, k.users.newPrevious)} />}
              />
              <div className="px-3 pb-4">
                <TrendChart id="users" tone="ink" data={toChart(data.series, "totalUsers")} unit="usuários" label="Total de usuários por dia no período" />
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-5">
            <Panel className="lg:col-span-3">
              <PanelHeader title="Uso da plataforma" description={`${formatCount(periodTotal(metric))} ${metricMeta.unit} criados no período`} />
              <div className="px-5 pb-1">
                <FilterTabs ariaLabel="Recurso" layoutId="usage-metric" value={metric} onChange={setMetric} options={USAGE_METRICS} />
              </div>
              <div className="px-3 pt-3 pb-4">
                <BarsChart data={toChart(data.series, metric)} unit={metricMeta.unit} label={`${metricMeta.label} criados por dia`} />
              </div>
            </Panel>
            <Panel className="lg:col-span-2">
              <PanelHeader title="Atividade por período" description={`${formatCount(periodTotal("logins"))} acessos registrados`} />
              <div className="px-3 pb-4">
                <TrendChart id="logins" tone="ink" data={toChart(data.series, "logins")} unit="acessos" label="Acessos por dia" height={232} />
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Panel>
              <PanelHeader
                title="Distribuição dos planos"
                description="Escritórios ativos, em teste ou pendentes"
                action={
                  <Link href="/admin/planos" className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                    Planos
                  </Link>
                }
              />
              <div className="px-5 pb-5">
                <BarList
                  items={data.planDistribution.map((p) => ({
                    label: p.plan,
                    value: p.count,
                    detail: p.monthlyCents ? `${formatCents(p.monthlyCents)}/mês` : "sem preço",
                  }))}
                  empty="Nenhum escritório ainda."
                />
              </div>
            </Panel>
            <Panel>
              <PanelHeader
                title="Mais perto do limite"
                description="Recurso mais pressionado de cada escritório"
                action={
                  <Link href="/admin/uso" className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                    Ver uso
                  </Link>
                }
              />
              {data.topUsage.length ? (
                <ul className="divide-y divide-border">
                  {data.topUsage.map((u) => (
                    <li key={u.id}>
                      <Link href={`/admin/escritorios/${u.id}?aba=uso`} className="flex items-center gap-3 px-5 py-2.5 outline-none hover:bg-surface-muted/50 focus-visible:bg-surface-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{u.name}</span>
                          <span className="block text-[11.5px] text-muted-foreground">
                            {LIMIT_META[u.key].label} · plano {u.plan}
                          </span>
                        </span>
                        <span className={cn("tabular text-[13px] font-semibold", u.ratio >= 0.95 ? "text-danger" : "text-warning")}>{Math.round(u.ratio * 100)}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pt-2 pb-6 text-[12.5px] text-muted-foreground">Nenhum escritório acima de 80% de algum limite.</p>
              )}
            </Panel>
            <Panel>
              <PanelHeader
                title="Atividade recente"
                description="Auditoria da plataforma"
                action={
                  <Link href="/admin/atividade" className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                    Ver tudo
                  </Link>
                }
              />
              <div className="-mt-1 pb-2">
                <AuditList entries={data.recent} empty="Os acessos e alterações aparecem aqui." />
              </div>
            </Panel>
          </section>
        </FadeIn>
      )}
    </div>
  )
}
