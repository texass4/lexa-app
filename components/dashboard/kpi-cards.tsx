"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CalendarDays, CircleDollarSign, ListChecks, Scale, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useDemoData } from "@/lib/store/demo-store"
import { invoiceStatus, isOverdue, openReceivables, taskBucket, todaysAppointments } from "@/lib/selectors"
import { getNow, fmtTime, parse } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { isStale, movedRecently, recentMovementNeedsReview, STALE_DAYS } from "@/lib/attention"

interface KpiCard {
  permission: Permission
  href: string
  label: string
  icon: LucideIcon
  /** A leitura: o que o número significa agora. */
  lead: string
  /** O que fazer com essa leitura. */
  insight: string
  /** O dado de apoio, em segundo plano. */
  support?: string
}

const countLabel = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function KpiCards() {
  const data = useDemoData()
  const { can } = useSession()
  const activeProcesses = data.processes.filter((p) => p.status !== "concluido")
  const moved = activeProcesses.filter((p) => movedRecently(p))
  const review = moved.filter((p) => recentMovementNeedsReview(p)).length
  const stale = activeProcesses.filter((p) => isStale(p)).length
  const todays = todaysAppointments(data)
  const nextToday = todays.find((a) => parse(a.start) > getNow())
  const pending = data.tasks.filter((t) => t.status === "pendente")
  const overdue = pending.filter((t) => isOverdue(t)).length
  const today = pending.filter((t) => taskBucket(t) === "hoje").length
  const open = openReceivables(data)
  const late = data.invoices.filter((i) => invoiceStatus(i) === "atrasado").reduce((a, i) => a + i.amount, 0)

  const processLead = !data.processes.length
    ? "Nenhum processo ainda"
    : moved.length
      ? countLabel(moved.length, "movimentação recente", "movimentações recentes")
      : stale
        ? countLabel(stale, "processo parado", "processos parados")
        : countLabel(activeProcesses.length, "processo ativo", "processos ativos")

  const processInsight = !data.processes.length
    ? "Consulte pelo número CNJ para começar a acompanhar"
    : moved.length
      ? review
        ? `${countLabel(review, "pode exigir atenção", "podem exigir atenção")}`
        : "Nenhuma pede revisão agora"
      : stale
        ? `Sem movimentação há mais de ${STALE_DAYS} dias`
        : "Sem movimentação nos últimos 7 dias"

  const taskLead = overdue
    ? countLabel(overdue, "tarefa atrasada", "tarefas atrasadas")
    : today
      ? countLabel(today, "tarefa para hoje", "tarefas para hoje")
      : pending.length
        ? countLabel(pending.length, "tarefa pendente", "tarefas pendentes")
        : "Nada pendente"

  const taskInsight = overdue
    ? today
      ? `${countLabel(today, "também vence hoje", "também vencem hoje")}`
      : "Merecem atenção agora"
    : today
      ? "Vencem ainda hoje"
      : "Nenhuma atrasada"

  const all: KpiCard[] = [
    {
      permission: "processes.view",
      href: "/processos",
      label: "Processos",
      icon: Scale,
      lead: processLead,
      insight: processInsight,
      support: data.processes.length ? countLabel(activeProcesses.length, "processo ativo", "processos ativos") : undefined,
    },
    {
      permission: "agenda.view",
      href: "/agenda",
      label: "Agenda",
      icon: CalendarDays,
      lead: todays.length ? countLabel(todays.length, "compromisso hoje", "compromissos hoje") : "Agenda livre hoje",
      insight: nextToday ? `Próximo às ${fmtTime(nextToday.start)}` : "Nenhum compromisso restante",
    },
    {
      permission: "tasks.view",
      href: "/tarefas",
      label: "Tarefas",
      icon: ListChecks,
      lead: taskLead,
      insight: taskInsight,
      support: overdue || today ? (pending.length ? countLabel(pending.length, "em aberto", "em aberto") : undefined) : undefined,
    },
    {
      permission: "finance.view",
      href: "/financeiro",
      label: "Honorários",
      icon: CircleDollarSign,
      lead: late > 0 ? `${formatCurrency(late)} em atraso` : open > 0 ? `${formatCurrency(open)} em aberto` : "Nada em aberto",
      insight: late > 0 ? (open > late ? `${formatCurrency(open)} no total em aberto` : "Valor que já venceu") : "Nenhum valor em atraso",
    },
  ]
  const cards = all.filter((card) => can(card.permission))

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            href={card.href}
            aria-label={`${card.label}: ${card.lead}. ${card.insight}`}
            className={cn(
              "group relative flex h-full flex-col rounded-[14px] border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-[0_8px_24px_-14px_rgb(15_23_42/0.22)] focus-visible:ring-2 focus-visible:ring-brand/40 sm:p-5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium tracking-[0.06em] text-subtle uppercase">{card.label}</span>
              <card.icon className="size-4 shrink-0 text-subtle transition-colors duration-200 group-hover:text-brand" strokeWidth={1.8} />
            </div>
            <p className="mt-3 text-[15px] leading-snug font-semibold tracking-[-0.02em] text-foreground sm:text-[16px]">{card.lead}</p>
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{card.insight}</p>
            {card.support && <p className="mt-3 text-[12px] text-subtle">{card.support}</p>}
          </Link>
        </motion.div>
      ))}
    </div>
  )
}
