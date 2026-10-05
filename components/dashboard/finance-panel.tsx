"use client"

import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Landmark } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { financeSummary, monthlyRevenue, openReceivables } from "@/lib/store/selectors"
import { overdueInvoices } from "@/lib/dashboard/dashboard"
import { formatCurrency } from "@/lib/core/format"
import { PanelLink } from "./panel-link"

/** Linha da receita recebida nos últimos 6 meses (SVG leve, sem a biblioteca de gráficos). */
function Sparkline({ values, labels }: { values: number[]; labels: string[] }) {
  const w = 220
  const h = 64
  const max = Math.max(...values, 1)
  const step = w / Math.max(values.length - 1, 1)
  const points = values.map((v, i) => [i * step, h - 6 - (v / max) * (h - 14)] as const)
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const area = `${line} L${w} ${h} L0 ${h} Z`
  const [lx, ly] = points[points.length - 1]
  return (
    <figure className="w-full max-w-[240px]" aria-label="Receita recebida nos últimos 6 meses">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--info)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--info)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lx} cy={ly} r="3.5" fill="var(--info)" stroke="var(--card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10.5px] text-subtle">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </figcaption>
    </figure>
  )
}

/** Receita do mês, tendência e cobranças em atraso. */
export function FinancePanel() {
  const data = useOfficeData()
  const summary = financeSummary(data.invoices)
  const series = monthlyRevenue(data.invoices)
  const late = overdueInvoices(data.invoices)
  const open = openReceivables(data)
  const growth = summary.growth

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Financeiro" icon={<Landmark />} action={<PanelLink href="/financeiro">Ver financeiro</PanelLink>} />
      <div className="flex flex-col gap-4 px-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="tabular text-[26px] font-semibold leading-none tracking-[-0.03em] text-foreground">{formatCurrency(summary.received)}</p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">Receita recebida este mês</p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            {growth === undefined ? (
              <>Previsto: {formatCurrency(summary.expected)}</>
            ) : (
              <>
                <span className={cn("inline-flex items-center gap-0.5 font-semibold", growth >= 0 ? "text-success" : "text-danger")}>
                  {growth >= 0 ? <ArrowUpRight className="size-3.5" strokeWidth={2.2} /> : <ArrowDownRight className="size-3.5" strokeWidth={2.2} />}
                  {Math.abs(growth).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>{" "}
                vs. mês anterior
              </>
            )}
          </p>
          <p className="mt-1 text-[12px] text-subtle">{formatCurrency(open)} em aberto</p>
        </div>
        <Sparkline values={series.map((m) => m.recebida)} labels={series.map((m) => m.month)} />
      </div>
      <div className="mt-auto border-t border-border/80 px-5 pt-3.5 pb-4 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            Cobranças em atraso
            {late.length > 0 && (
              <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10.5px] font-semibold text-white">
                {late.length}
              </span>
            )}
          </p>
          {late.length > 3 && <PanelLink href="/financeiro">Ver todas</PanelLink>}
        </div>
        {late.length ? (
          <ul className="mt-2 space-y-0.5">
            {late.slice(0, 3).map(({ invoice, daysLate }) => {
              const client = byId(data.clients, invoice.clientId)
              return (
                <li key={invoice.id}>
                  <Link
                    href={client ? `/clientes/${client.id}` : "/financeiro"}
                    className="touch-target relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] text-[12.5px] outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="size-2 shrink-0 rounded-full border border-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">{client?.name ?? "Cliente"}</span>
                        {/* Celular: o atraso vem abaixo do nome, para o nome não ser cortado. */}
                        <span className="tabular block text-[11px] font-medium text-danger sm:hidden">
                          {daysLate} {daysLate === 1 ? "dia" : "dias"} de atraso
                        </span>
                      </span>
                    </span>
                    <span className="tabular rounded-full bg-danger-soft px-2 py-px text-[11px] font-medium text-danger max-sm:hidden">
                      {daysLate} {daysLate === 1 ? "dia" : "dias"}
                    </span>
                    <span className="tabular w-[84px] text-right font-medium text-foreground">{formatCurrency(invoice.amount)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">Nenhuma parcela vencida.</p>
        )}
      </div>
    </Panel>
  )
}
