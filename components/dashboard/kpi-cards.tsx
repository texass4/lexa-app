"use client"

import { motion } from "framer-motion"
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Scale, SquareCheckBig, UsersRound } from "lucide-react"
import { cn } from "cn"
import { MetricCard, type MetricTone } from "@/components/ui/metric-card"
import { useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { dashboardKpis } from "@/lib/dashboard"
import { formatCurrency, formatNumber } from "@/lib/format"

/** "↑ 12 este mês" — a variação do período, verde quando é bom, vermelha quando pede ação. */
function Delta({ value, label, tone }: { value: React.ReactNode; label: string; tone: "up" | "down" | "alert" | "neutral" }) {
  const Icon = tone === "down" || tone === "alert" ? ArrowDownRight : ArrowUpRight
  return (
    <span className="inline-flex items-center gap-1.5">
      {tone !== "neutral" && (
        <span className={cn("inline-flex items-center gap-0.5 font-semibold", tone === "up" ? "text-success" : "text-danger")}>
          <Icon className="size-3.5" strokeWidth={2.2} />
          {value}
        </span>
      )}
      {tone === "neutral" && <span className="font-semibold text-foreground">{value}</span>}
      <span>{label}</span>
    </span>
  )
}

interface Card {
  permission: Permission
  href: string
  label: string
  icon: typeof Scale
  tone: MetricTone
  value: string
  foot: React.ReactNode
}

export function KpiCards() {
  const data = useDemoData()
  const { can } = useSession()
  const k = dashboardKpis(data)

  const all: Card[] = [
    {
      permission: "clients.view",
      href: "/clientes",
      label: "Clientes",
      icon: UsersRound,
      tone: "brand",
      value: formatNumber(k.clients.total),
      foot: k.clients.newThisMonth ? <Delta value={k.clients.newThisMonth} label="este mês" tone="up" /> : <span>nenhum novo este mês</span>,
    },
    {
      permission: "processes.view",
      href: "/processos",
      label: "Processos",
      icon: Scale,
      tone: "info",
      value: formatNumber(k.processes.active),
      foot: k.processes.newThisMonth ? <Delta value={k.processes.newThisMonth} label="este mês" tone="up" /> : <span>nenhum novo este mês</span>,
    },
    {
      permission: "tasks.view",
      href: "/tarefas",
      label: "Tarefas",
      icon: SquareCheckBig,
      tone: "warning",
      value: formatNumber(k.tasks.pending),
      foot: k.tasks.overdue ? (
        <Delta value={k.tasks.overdue} label={k.tasks.overdue === 1 ? "atrasada" : "atrasadas"} tone="alert" />
      ) : (
        <Delta value={k.tasks.thisWeek} label="esta semana" tone="neutral" />
      ),
    },
    {
      permission: "finance.view",
      href: "/financeiro",
      label: "Financeiro",
      icon: CircleDollarSign,
      tone: "success",
      value: formatCurrency(k.finance.received),
      foot:
        k.finance.growth === undefined ? (
          <span>recebido este mês</span>
        ) : (
          <Delta
            value={`${Math.abs(k.finance.growth).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            label="este mês"
            tone={k.finance.growth >= 0 ? "up" : "down"}
          />
        ),
    },
  ]
  const cards = all.filter((card) => can(card.permission))

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 xl:gap-5">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
        >
          <MetricCard href={card.href} label={card.label} icon={card.icon} tone={card.tone} value={card.value} foot={card.foot} />
        </motion.div>
      ))}
    </div>
  )
}
