"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CalendarDays, CircleDollarSign, ListChecks, Scale, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useDemoData } from "@/lib/store/demo-store"
import { isOverdue, openReceivables, taskBucket, todaysAppointments } from "@/lib/selectors"
import { getNow, fmtTime, parse } from "@/lib/dates"
import { formatCurrency, formatNumber } from "@/lib/format"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { isStale, movedRecently, STALE_DAYS } from "@/lib/attention"

interface KpiCard {
  permission: Permission
  href: string
  label: string
  short?: string
  icon: LucideIcon
  value: string
  foot: React.ReactNode
}

export function KpiCards() {
  const data = useDemoData()
  const { can } = useSession()
  const activeProcesses = data.processes.filter((p) => p.status !== "concluido")
  const moved = activeProcesses.filter((p) => movedRecently(p)).length
  const stale = activeProcesses.filter((p) => isStale(p)).length
  const todays = todaysAppointments(data)
  const nextToday = todays.find((a) => parse(a.start) > getNow())
  const pending = data.tasks.filter((t) => t.status === "pendente")
  const overdue = pending.filter((t) => isOverdue(t)).length
  const today = pending.filter((t) => taskBucket(t) === "hoje").length
  const open = openReceivables(data)
  const late = data.invoices.filter((i) => i.status === "atrasado").reduce((a, i) => a + i.amount, 0)

  const all: KpiCard[] = [
    {
      permission: "processes.view",
      href: "/processos",
      label: "Processos ativos",
      short: "Processos",
      icon: Scale,
      value: formatNumber(activeProcesses.length, 2),
      // O número sozinho não diz nada: o rodapé diz o que mudou ou o que está parado.
      foot: !data.processes.length ? (
        <>Consulte pelo número CNJ</>
      ) : moved ? (
        <>
          <span className="font-medium text-foreground">{moved}</span> com movimentação recente
        </>
      ) : stale ? (
        <span className="text-warning">
          {stale} sem movimentação há +{STALE_DAYS} dias
        </span>
      ) : (
        <>Sem movimentação nos últimos 7 dias</>
      ),
    },
    {
      permission: "agenda.view",
      href: "/agenda",
      label: "Compromissos hoje",
      short: "Hoje",
      icon: CalendarDays,
      value: formatNumber(todays.length, 2),
      foot: nextToday ? <>Próximo às {fmtTime(nextToday.start)}</> : <>Nenhum compromisso restante</>,
    },
    {
      permission: "tasks.view",
      href: "/tarefas",
      label: "Tarefas pendentes",
      icon: ListChecks,
      value: formatNumber(pending.length, 2),
      foot: (
        <>
          {overdue > 0 && <span className="font-medium text-danger">{overdue} atrasadas</span>}
          {overdue > 0 && <span className="text-subtle"> · </span>}
          {today} para hoje
        </>
      ),
    },
    {
      permission: "finance.view",
      href: "/financeiro",
      label: "Honorários em aberto",
      short: "Em aberto",
      icon: CircleDollarSign,
      value: formatCurrency(open),
      foot: late > 0 ? <span className="text-danger">{formatCurrency(late)} em atraso</span> : <>Nenhum valor em atraso</>,
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
            className={cn(
              "group relative flex h-full flex-col rounded-[14px] border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-[0_6px_20px_-12px_rgb(23_23_23/0.18)] focus-visible:ring-2 focus-visible:ring-gold/40 sm:p-5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12.5px] font-medium text-muted-foreground">
                {card.short ? (
                  <>
                    <span className="sm:hidden">{card.short}</span>
                    <span className="max-sm:hidden">{card.label}</span>
                  </>
                ) : (
                  card.label
                )}
              </span>
              <card.icon className="size-4 shrink-0 text-subtle transition-colors group-hover:text-gold" strokeWidth={1.8} />
            </div>
            <p className="tabular mt-3 truncate text-[21px] font-semibold leading-none tracking-[-0.03em] text-foreground min-[390px]:text-[25px] sm:mt-4 sm:text-[30px]">
              {card.value}
            </p>
            <p className="mt-2.5 truncate text-[12px] text-muted-foreground sm:mt-3">{card.foot}</p>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}
