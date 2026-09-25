"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowUpRight, CircleDollarSign, Download, Send, TrendingUp, TriangleAlert, Wallet, Percent } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { FadeIn } from "@/components/ui/motion"
import { RevenueBarChart } from "./revenue-chart"
import { useDemoData } from "@/lib/store/demo-store"
import { INVOICE_STATUS } from "@/lib/config"
import { fmtDayMonthParts, fmtDueIn, fmtNumericDate, getNow } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import { financeSummary, monthlyRevenue, openReceivables, revenueByArea } from "@/lib/selectors"

export function FinanceView() {
  const data = useDemoData()
  const ready = data.hydrated
  const open = openReceivables(data)
  const overdue = data.invoices.filter((i) => i.status === "atrasado")
  const overdueTotal = overdue.reduce((a, i) => a + i.amount, 0)
  const upcoming = data.invoices.filter((i) => i.status !== "pago").sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const summary = financeSummary(data.invoices)
  const series = monthlyRevenue(data.invoices)
  const byArea = revenueByArea(data.invoices, data.clients)
  const maxArea = byArea[0]?.amount ?? 0
  const pct = summary.expected > 0 ? Math.round((summary.received / summary.expected) * 100) : undefined
  const growth = summary.growth

  const kpis = [
    { label: "Receita prevista", value: formatCurrency(summary.expected), hint: summary.month, icon: TrendingUp },
    {
      label: "Receita recebida",
      value: formatCurrency(summary.received),
      hint:
        growth === undefined && pct === undefined ? (
          summary.month
        ) : (
          <span>
            {growth !== undefined && (
              <>
                <span className={cn("font-medium", growth >= 0 ? "text-success" : "text-danger")}>
                  {growth >= 0 ? "+" : ""}
                  {growth.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>{" "}
                vs. {summary.previousMonth.split(" ")[0].toLowerCase()}
              </>
            )}
            {growth !== undefined && pct !== undefined && " · "}
            {pct !== undefined && <>{pct}% do previsto</>}
          </span>
        ),
      icon: Wallet,
    },
    { label: "Em aberto", value: formatCurrency(open), hint: `${upcoming.length} parcelas a receber`, icon: CircleDollarSign },
    {
      label: "Inadimplência",
      value: `${summary.defaultRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      hint: <span className="text-danger">{formatCurrency(overdueTotal)} vencidos</span>,
      icon: Percent,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Honorários previstos, recebidos e em aberto do escritório."
        actions={
          <Button variant="secondary" onClick={() => toast.success("Relatório exportado.", { description: `financeiro-${series[series.length - 1].key}.xlsx` })}>
            <Download /> Exportar relatório
          </Button>
        }
      />

      {!ready ? (
        <>
          <SkeletonStats />
          <div className="grid gap-5 lg:grid-cols-12">
            <SkeletonCard className="lg:col-span-8" lines={5} />
            <SkeletonCard className="lg:col-span-4" lines={5} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
                className="rounded-[14px] border border-border bg-card p-4 shadow-card sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium text-muted-foreground">{k.label}</span>
                  <k.icon className="size-4 shrink-0 text-subtle" />
                </div>
                <p className="tabular mt-3 truncate text-[21px] font-semibold leading-none tracking-[-0.03em] min-[390px]:text-[24px] sm:mt-4 sm:text-[28px]">
                  {k.value}
                </p>
                <p className="mt-2.5 truncate text-[12px] text-muted-foreground">{k.hint}</p>
              </motion.div>
            ))}
          </div>

          {overdueTotal > 0 && (
            <FadeIn className="flex flex-col gap-3 rounded-[14px] border border-danger/20 bg-danger-soft/60 p-4 sm:flex-row sm:items-center">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-danger ring-1 ring-danger/15">
                <TriangleAlert className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">
                  {overdue.length} parcelas em atraso somam {formatCurrency(overdueTotal)}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {data.clients.find((c) => c.id === overdue[0].clientId)?.name} · vencidas desde {fmtNumericDate(overdue[0].dueDate)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toast.success("Lembrete de cobrança enviado.", { description: "Mensagem enviada por e-mail e WhatsApp." })}
              >
                <Send /> Enviar cobrança
              </Button>
            </FadeIn>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-8">
              <PanelHeader
                title="Receita mensal"
                description={`${series[0].label} a ${series[series.length - 1].label}`}
                action={
                  <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[3px] bg-foreground" /> Recebida
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[3px] bg-border-strong" /> Prevista
                    </span>
                  </div>
                }
              />
              <div className="px-3 pb-4 sm:px-5">
                <RevenueBarChart data={series} height={280} />
              </div>
            </Panel>

            <Panel className="lg:col-span-4">
              <PanelHeader title="Receita por área" description={`Recebido em ${getNow().getFullYear()}`} />
              {byArea.length === 0 && <EmptyState compact title="Nenhum recebimento neste ano." />}
              <ul className="space-y-3.5 px-5 pb-5">
                {byArea.map((a, i) => (
                  <li key={a.area}>
                    <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                      <span className="text-foreground">{a.area}</span>
                      <span className="tabular font-medium">{a.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${maxArea ? (a.amount / maxArea) * 100 : 0}%` }}
                        transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        className={cn("h-full rounded-full", i === 0 ? "bg-gold" : "bg-foreground/75")}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel>
            <PanelHeader title="Próximos recebimentos" description={`${upcoming.length} parcelas · ${formatCurrency(open)}`} />
            {upcoming.length === 0 && <EmptyState compact title="Nenhuma parcela a receber." />}
            <ul className={cn("divide-y divide-border", upcoming.length > 0 && "border-t border-border")}>
              {upcoming.map((inv) => {
                const client = data.clients.find((c) => c.id === inv.clientId)
                const status = INVOICE_STATUS[inv.status]
                const { day, month } = fmtDayMonthParts(inv.dueDate)
                return (
                  <li key={inv.id} className="flex items-center gap-3.5 px-4 py-3 sm:px-5">
                    <span
                      className={cn(
                        "flex w-11 shrink-0 flex-col items-center rounded-[8px] border py-1",
                        inv.status === "atrasado" ? "border-danger/25 bg-danger-soft" : "border-border bg-surface",
                      )}
                    >
                      <span
                        className={cn("text-[9.5px] font-semibold tracking-[0.1em]", inv.status === "atrasado" ? "text-danger" : "text-gold-dark")}
                      >
                        {month}
                      </span>
                      <span className="tabular text-[15px] font-semibold leading-tight">{day}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clientes/${inv.clientId}?tab=financeiro`}
                        className="flex items-center gap-2 truncate text-[13.5px] font-medium hover:underline"
                      >
                        {client && <UserAvatar name={client.name} size="xs" className="max-sm:hidden" />}
                        <span className="truncate">{client?.name}</span>
                      </Link>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {inv.description} · {inv.method} · {fmtDueIn(inv.dueDate)}
                      </p>
                    </div>
                    <span className="hidden sm:block">
                      <StatusBadge tone={status.tone} size="sm">
                        {status.label}
                      </StatusBadge>
                    </span>
                    <span className={cn("tabular w-24 shrink-0 text-right text-[13.5px] font-semibold", inv.status === "atrasado" && "text-danger")}>
                      {formatCurrency(inv.amount)}
                    </span>
                    <Link
                      href={`/clientes/${inv.clientId}?tab=financeiro`}
                      aria-label={`Abrir financeiro de ${client?.name}`}
                      className="hidden size-8 items-center justify-center rounded-[8px] text-subtle hover:bg-accent hover:text-foreground md:flex"
                    >
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}
