"use client"

import Link from "next/link"
import { ArrowRight, CalendarDays, Hourglass, ListChecks, Wallet, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { overdueInvoices } from "@/lib/dashboard/dashboard"
import { daysToPrazo, weekPrazos } from "@/lib/prazos/prazos"
import { taskBucket, todaysAppointments } from "@/lib/store/selectors"
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
  const { can, user } = useSession()
  const now = getNow()
  const week = weekPrazos(data.deadlines, now).flatMap((g) => g.prazos)
  const overduePrazos = week.filter((p) => daysToPrazo(p, now) < 0).length
  const late = overdueInvoices(data.invoices, now)
  const lateTotal = late.reduce((acc, { invoice }) => acc + invoice.amount, 0)
  const today = todaysAppointments(data, now)
  const next = today.find((a) => parse(a.start) > now)
  // As tarefas são as da pessoa: o mesmo número do selo da barra lateral e da tela "Minhas tarefas".
  const mine = data.tasks.filter((t) => t.assigneeId === user.id && t.status === "pendente")
  const mineOverdue = mine.filter((t) => taskBucket(t, now) === "atrasadas").length
  const mineToday = mine.filter((t) => taskBucket(t, now) === "hoje").length

  const all: Kpi[] = [
    {
      permission: "processes.view",
      href: overduePrazos ? "/tarefas/prazos?filtro=vencidos" : "/tarefas/prazos?filtro=semana",
      label: "Prazos a cumprir",
      value: formatNumber(week.length),
      // Vencidos e ainda abertos + os que vencem até domingo (mesmas regras da tela Prazos).
      foot: week.length
        ? [overduePrazos && plural(overduePrazos, "vencido", "vencidos"), week.length - overduePrazos && `${week.length - overduePrazos} até domingo`]
            .filter(Boolean)
            .join(" · ")
        : "nenhum até domingo",
      alert: overduePrazos > 0,
      icon: Hourglass,
      tone: "brand",
    },
    {
      permission: "tasks.view",
      href: mineOverdue ? "/tarefas?filtro=atrasadas" : "/tarefas?filtro=hoje",
      label: "Suas tarefas",
      value: formatNumber(mine.length),
      foot: mineOverdue ? `${plural(mineOverdue, "atrasada", "atrasadas")} · ${mineToday} para hoje` : `${mineToday} para hoje`,
      alert: mineOverdue > 0,
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

  // Uma faixa só, com divisórias: os números lado a lado, sem quatro cartões grandes.
  return (
    <section
      aria-label="Indicadores do que pede ação"
      className={cn(
        "grid overflow-hidden rounded-card border border-border bg-card shadow-card",
        "grid-cols-2 [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t",
        shown.length >= 4
          ? "@4xl/main:grid-cols-4 @4xl/main:[&>*:not(:first-child)]:border-l @4xl/main:[&>*]:border-t-0"
          : shown.length === 3
            ? "@2xl/main:grid-cols-3 @2xl/main:[&>*:not(:first-child)]:border-l @2xl/main:[&>*]:border-t-0"
            : "",
      )}
    >
      {shown.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.label}
            href={item.href}
            className="group relative flex min-w-0 flex-col gap-1 border-border px-4 py-4 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset sm:px-5"
          >
            <span className="flex items-center gap-2">
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[8px]", TONES[item.tone])}>
                <Icon className="size-[15px]" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">{item.label}</span>
              <ArrowRight className="size-3.5 shrink-0 text-subtle opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100 max-sm:hidden" />
            </span>
            <span className="tabular mt-1 truncate text-[26px] leading-none font-semibold tracking-[-0.025em] text-foreground">{item.value}</span>
            <span className={cn("mt-1 truncate text-[12.5px]", item.alert ? "font-medium text-danger" : "text-muted-foreground")}>{item.foot}</span>
          </Link>
        )
      })}
    </section>
  )
}
