"use client"

import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { RevenueAreaChart } from "@/components/financeiro/revenue-chart"
import { formatCurrency } from "@/lib/format"
import { useDemoData } from "@/lib/store/demo-store"
import { financeSummary, monthlyRevenue } from "@/lib/selectors"

export function RevenuePanel() {
  const { invoices } = useDemoData()
  const summary = financeSummary(invoices)
  const series = monthlyRevenue(invoices)
  const growth = summary.growth

  return (
    <Panel>
      <PanelHeader
        title="Receita"
        description="Honorários recebidos nos últimos meses"
        action={
          <Link
            href="/financeiro"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            Financeiro <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="px-5 pb-4">
        <div className="flex items-end gap-3">
          <p className="tabular text-[24px] font-semibold leading-none tracking-[-0.03em]">{formatCurrency(summary.received)}</p>
          {growth !== undefined && (
            <span className={`mb-0.5 inline-flex items-center gap-0.5 text-[12px] font-medium ${growth >= 0 ? "text-success" : "text-danger"}`}>
              <ArrowUpRight className={growth >= 0 ? "size-3.5" : "size-3.5 rotate-90"} />
              {growth.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          {summary.month} · previsto {formatCurrency(summary.expected)}
        </p>
        <div className="mt-3 -mx-1">
          <RevenueAreaChart data={series} height={150} />
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-gold" /> Recebida
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-border-strong" /> Prevista
          </span>
        </div>
      </div>
    </Panel>
  )
}
