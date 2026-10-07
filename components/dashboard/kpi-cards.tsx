"use client"

import { IndicatorStrip, type Indicator } from "@/components/ui/indicator-strip"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { dashboardKpis, overdueInvoices } from "@/lib/dashboard/dashboard"
import { daysToPrazo, weekPrazos } from "@/lib/prazos/prazos"
import { formatCurrency, formatNumber } from "@/lib/core/format"
import { getNow } from "@/lib/core/dates"

type Item = Indicator & { permission: Permission; href: string }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Indicadores do topo do Painel: só o que pede ação, cada um levando à lista que o
 * resolve. Uma faixa só (não quatro cartões) — os totais do escritório ficam nas
 * próprias telas.
 */
export function KpiStrip() {
  const data = useOfficeData()
  const { can } = useSession()
  const now = getNow()
  const k = dashboardKpis(data, now)
  const week = weekPrazos(data.deadlines, now).flatMap((g) => g.prazos)
  const overduePrazos = week.filter((p) => daysToPrazo(p, now) < 0).length
  const late = overdueInvoices(data.invoices, now)
  const lateTotal = late.reduce((acc, { invoice }) => acc + invoice.amount, 0)

  const all: Item[] = [
    {
      permission: "processes.view",
      href: overduePrazos ? "/tarefas/prazos?filtro=vencidos" : "/tarefas/prazos?filtro=semana",
      label: "Prazos até domingo",
      value: formatNumber(week.length),
      foot: overduePrazos ? plural(overduePrazos, "vencido", "vencidos") : "nenhum vencido",
      alert: overduePrazos > 0,
    },
    {
      permission: "tasks.view",
      href: k.tasks.overdue ? "/tarefas?filtro=atrasadas" : "/tarefas",
      label: "Tarefas pendentes",
      value: formatNumber(k.tasks.pending),
      foot: k.tasks.overdue ? plural(k.tasks.overdue, "atrasada", "atrasadas") : `${k.tasks.thisWeek} para esta semana`,
      alert: k.tasks.overdue > 0,
    },
    {
      permission: "finance.view",
      href: "/financeiro?aba=atrasados",
      label: "Em atraso",
      value: formatCurrency(lateTotal),
      foot: late.length ? plural(late.length, "parcela vencida", "parcelas vencidas") : "nenhuma parcela vencida",
      alert: late.length > 0,
    },
  ]
  const shown = all.filter((i) => can(i.permission))
  return <IndicatorStrip label="Indicadores do que pede ação" items={shown} />
}
