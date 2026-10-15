"use client"

import Link from "next/link"
import { ArrowRight, ArrowUp, CalendarDays, Hourglass, ListChecks, Wallet, type LucideIcon } from "lucide-react"
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
  brand: "bg-brand-soft text-brand",
  teal: "bg-brand-soft text-brand",
  amber: "bg-brand-soft text-brand",
  slate: "bg-brand-soft text-brand",
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

  // Quatro cartões compactos numa linha (dois no celular): ícone em quadro suave, valor, situação e "Ver".
  return (
    <section
      aria-label="Indicadores do que pede ação"
      className={cn("grid grid-cols-2 gap-3", shown.length >= 4 ? "@2xl/main:grid-cols-4" : shown.length === 3 ? "@2xl/main:grid-cols-3" : "")}
    >
      {shown.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.label}
            href={item.href}
            className="group flex min-w-0 flex-col rounded-card border border-border bg-card px-4 pt-4 pb-3 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="flex items-center gap-3">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px]", TONES[item.tone])}>
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 text-[13px] leading-snug font-semibold text-foreground">{item.label}</span>
            </span>
            <span className="tabular mt-3 truncate text-[22px] leading-none sm:text-[26px] font-semibold tracking-[-0.02em] text-foreground">
              {item.value}
            </span>
            <span
              className={cn(
                "mt-2 flex min-w-0 items-start gap-1 text-[12px] leading-snug",
                item.alert ? "font-medium text-danger" : "text-muted-foreground",
              )}
            >
              {item.alert && <ArrowUp className="mt-px size-3 shrink-0" aria-hidden />}
              <span className="line-clamp-2">{item.foot}</span>
            </span>
            <span className="mt-auto self-end pt-2 text-[12px] font-medium text-brand-strong opacity-90 transition-opacity group-hover:opacity-100">
              Ver todos <ArrowRight className="inline size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )
      })}
    </section>
  )
}
