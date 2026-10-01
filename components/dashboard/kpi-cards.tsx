"use client"

import { motion } from "framer-motion"
import { CalendarDays, CircleDollarSign, ListChecks, Scale, type LucideIcon } from "lucide-react"
import { MetricCard, type MetricTone } from "@/components/ui/metric-card"
import { useDemoData } from "@/lib/store/demo-store"
import { invoiceStatus, isOverdue, openReceivables, taskBucket, todaysAppointments } from "@/lib/selectors"
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
  /** Cor de identificação do card (selo do ícone e linha inferior). */
  tone: MetricTone
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
  const late = data.invoices.filter((i) => invoiceStatus(i) === "atrasado").reduce((a, i) => a + i.amount, 0)

  const all: KpiCard[] = [
    {
      permission: "processes.view",
      href: "/processos",
      label: "Processos ativos",
      short: "Processos",
      icon: Scale,
      tone: "brand",
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
      tone: "info",
      value: formatNumber(todays.length, 2),
      foot: nextToday ? <>Próximo às {fmtTime(nextToday.start)}</> : <>Nenhum compromisso restante</>,
    },
    {
      permission: "tasks.view",
      href: "/tarefas",
      label: "Tarefas pendentes",
      short: "Tarefas",
      icon: ListChecks,
      tone: "warning",
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
      tone: "success",
      value: formatCurrency(open),
      foot: late > 0 ? <span className="text-danger">{formatCurrency(late)} em atraso</span> : <>Nenhum valor em atraso</>,
    },
  ]
  const cards = all.filter((card) => can(card.permission))

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
        >
          <MetricCard
            href={card.href}
            label={card.label}
            short={card.short}
            icon={card.icon}
            tone={card.tone}
            value={card.value}
            foot={card.foot}
          />
        </motion.div>
      ))}
    </div>
  )
}
