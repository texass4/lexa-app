"use client"

import Link from "next/link"
import { AlarmClock, CalendarRange, ChevronRight, CircleAlert, Flag, History, Hourglass, Receipt, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { Panel } from "@/components/ui/panel"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import { overdueInvoices } from "@/lib/dashboard/dashboard"
import { daysToPrazo, isOpenPrazo, prazoPeriod, prazoTask } from "@/lib/prazos/prazos"
import { taskBucket } from "@/lib/store/selectors"
import { formatNumber } from "@/lib/core/format"
import { getNow } from "@/lib/core/dates"

interface View {
  href: string
  label: string
  count: number
  icon: LucideIcon
  permission: Permission
  /** Contagem que pede ação: em vermelho quando maior que zero. */
  alert?: boolean
  /** Quantidade por extenso, no subtítulo ("11 vencidos"). */
  unit: (n: number) => string
  /** Cor do quadro do ícone (suave). */
  tone: "brand" | "success" | "warning" | "danger"
}

const TILE: Record<View["tone"], string> = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
}
const n = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`

/**
 * Visualizações rápidas: as listas filtradas que já existem nas telas (os filtros por
 * URL), com a contagem real de cada uma.
 */
export function QuickViews() {
  const data = useOfficeData()
  const { can } = useSession()
  const now = getNow()
  const open = data.deadlines.filter(isOpenPrazo)
  const pending = data.tasks.filter((t) => t.status === "pendente")

  const views: View[] = [
    {
      href: "/tarefas/prazos?filtro=vencidos",
      label: "Prazos vencidos",
      unit: (c) => n(c, "aberto e vencido", "abertos e vencidos"),
      tone: "danger",
      count: open.filter((p) => prazoPeriod(p, now) === "vencido").length,
      icon: CircleAlert,
      permission: "processes.view",
      alert: true,
    },
    {
      href: "/tarefas/prazos?filtro=30dias",
      label: "Prazos em 30 dias",
      unit: (c) => n(c, "prazo a cumprir", "prazos a cumprir"),
      tone: "brand",
      count: open.filter((p) => daysToPrazo(p, now) >= 0 && daysToPrazo(p, now) <= 30).length,
      icon: CalendarRange,
      permission: "processes.view",
    },
    {
      href: "/tarefas/prazos?filtro=sem-tarefa",
      label: "Prazos sem tarefa",
      unit: (c) => n(c, "sem tarefa vinculada", "sem tarefa vinculada"),
      tone: "warning",
      count: open.filter((p) => !prazoTask(p, data.tasks)).length,
      icon: Hourglass,
      permission: "processes.view",
      alert: true,
    },
    {
      href: "/tarefas?filtro=atrasadas&escopo=escritorio",
      label: "Tarefas atrasadas",
      unit: (c) => n(c, "atrasada no escritório", "atrasadas no escritório"),
      tone: "danger",
      count: pending.filter((t) => taskBucket(t, now) === "atrasadas").length,
      icon: AlarmClock,
      permission: "tasks.view",
      alert: true,
    },
    {
      href: "/tarefas?filtro=alta&escopo=escritorio",
      label: "Prioridade alta",
      unit: (c) => n(c, "tarefa pendente", "tarefas pendentes"),
      tone: "warning",
      count: pending.filter((t) => t.priority === "alta").length,
      icon: Flag,
      permission: "tasks.view",
    },
    {
      href: "/financeiro?aba=atrasados",
      label: "Parcelas em atraso",
      unit: (c) => n(c, "parcela vencida", "parcelas vencidas"),
      tone: "success",
      count: overdueInvoices(data.invoices, now).length,
      icon: Receipt,
      permission: "finance.view",
      alert: true,
    },
  ]
  const shown = views.filter((v) => can(v.permission))
  if (!shown.length) return null

  return (
    <Panel className="flex flex-col">
      <header className="flex items-start gap-2 px-5 pt-5 pb-2 sm:px-6">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-foreground">
          <span className="flex size-8 items-center justify-center rounded-[8px] bg-brand-soft text-brand">
            <History className="size-[17px]" />
          </span>
          Visualizações rápidas
        </h2>
      </header>
      <ul className="px-3 pb-3 sm:px-4">
        {shown.map((v) => {
          const Icon = v.icon
          const hot = v.alert && v.count > 0
          return (
            <li key={v.href} className="border-b border-border/70 last:border-0">
              <Link
                href={v.href}
                className="group flex items-center gap-3 rounded-[8px] px-2 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px]", TILE[v.tone])}>
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">{v.label}</span>
                  <span className={cn("block truncate text-[12px]", hot ? "font-medium text-danger" : "text-muted-foreground")}>
                    {v.unit(v.count)}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
