"use client"

import Link from "next/link"
import { CalendarDays, Hourglass, ListChecks, Wallet, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { dashboardKpis, overdueInvoices } from "@/lib/dashboard/dashboard"
import { daysToPrazo, weekPrazos } from "@/lib/prazos/prazos"
import { todaysAppointments } from "@/lib/store/selectors"
import { formatCurrency, formatNumber } from "@/lib/core/format"
import { fmtTime, getNow, parse } from "@/lib/core/dates"

type Tone = "brand" | "teal" | "amber" | "slate"

interface Kpi {
  permission: Permission
  href: string
  label: string
  value: string
  foot: string
  /** Pede ação (vencido, atrasado): o rodapé fica em vermelho. */
  alert: boolean
  icon: LucideIcon
  tone: Tone
}

const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-strong",
  teal: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  slate: "bg-surface-muted text-muted-foreground",
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Os quatro indicadores do topo do Início: só o que pede ação, cada um levando à
 * lista que o resolve. Todos são contagens dos dados do escritório (nada estimado).
 */
export function KpiCards() {
  const data = useOfficeData()
  const { can } = useSession()
  const now = getNow()
  const k = dashboardKpis(data, now)
  const week = weekPrazos(data.deadlines, now).flatMap((g) => g.prazos)
  const overduePrazos = week.filter((p) => daysToPrazo(p, now) < 0).length
  const late = overdueInvoices(data.invoices, now)
  const lateTotal = late.reduce((acc, { invoice }) => acc + invoice.amount, 0)
  const today = todaysAppointments(data, now)
  const next = today.find((a) => parse(a.start) > now)

  const all: Kpi[] = [
    {
      permission: "processes.view",
      href: overduePrazos ? "/tarefas/prazos?filtro=vencidos" : "/tarefas/prazos?filtro=semana",
      label: "Prazos até domingo",
      value: formatNumber(week.length),
      foot: overduePrazos ? plural(overduePrazos, "vencido", "vencidos") : "nenhum vencido",
      alert: overduePrazos > 0,
      icon: Hourglass,
      tone: "brand",
    },
    {
      permission: "tasks.view",
      href: k.tasks.overdue ? "/tarefas?filtro=atrasadas" : "/tarefas",
      label: "Tarefas pendentes",
      value: formatNumber(k.tasks.pending),
      foot: k.tasks.overdue ? plural(k.tasks.overdue, "atrasada", "atrasadas") : `${k.tasks.thisWeek} para esta semana`,
      alert: k.tasks.overdue > 0,
      icon: ListChecks,
      tone: "teal",
    },
    {
      permission: "agenda.view",
      href: "/agenda",
      label: "Compromissos hoje",
      value: formatNumber(today.length),
      foot: next ? `próximo às ${fmtTime(next.start)}` : today.length ? "nenhum mais hoje" : "agenda livre",
      alert: false,
      icon: CalendarDays,
      tone: "slate",
    },
    {
      permission: "finance.view",
      href: "/financeiro?aba=atrasados",
      label: "Em atraso",
      value: formatCurrency(lateTotal),
      foot: late.length ? plural(late.length, "parcela vencida", "parcelas vencidas") : "nenhuma parcela vencida",
      alert: late.length > 0,
      icon: Wallet,
      tone: "amber",
    },
  ]
  const shown = all.filter((i) => can(i.permission))
  if (!shown.length) return null

  return (
    <section
      aria-label="Indicadores do que pede ação"
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        shown.length >= 4 ? "@4xl/main:grid-cols-4" : shown.length === 3 ? "@2xl/main:grid-cols-3" : "",
      )}
    >
      {shown.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.label}
            href={item.href}
            className="group flex min-w-0 items-start gap-3 rounded-card border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/40 sm:p-5"
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px] max-sm:hidden", TONES[item.tone])}>
              <Icon className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[12.5px] font-medium text-muted-foreground">{item.label}</span>
              <span className="tabular truncate text-[24px] leading-tight font-semibold tracking-[-0.02em] text-foreground">{item.value}</span>
              <span className={cn("truncate text-[12px]", item.alert ? "font-medium text-danger" : "text-subtle")}>{item.foot}</span>
            </span>
          </Link>
        )
      })}
    </section>
  )
}
