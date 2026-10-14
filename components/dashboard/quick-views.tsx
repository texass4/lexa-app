"use client"

import Link from "next/link"
import { AlarmClock, CalendarRange, ChevronRight, CircleAlert, Flag, Hourglass, Receipt, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
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
}

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
      count: open.filter((p) => prazoPeriod(p, now) === "vencido").length,
      icon: CircleAlert,
      permission: "processes.view",
      alert: true,
    },
    {
      href: "/tarefas/prazos?filtro=30dias",
      label: "Prazos em 30 dias",
      count: open.filter((p) => daysToPrazo(p, now) >= 0 && daysToPrazo(p, now) <= 30).length,
      icon: CalendarRange,
      permission: "processes.view",
    },
    {
      href: "/tarefas/prazos?filtro=sem-tarefa",
      label: "Prazos sem tarefa",
      count: open.filter((p) => !prazoTask(p, data.tasks)).length,
      icon: Hourglass,
      permission: "processes.view",
      alert: true,
    },
    {
      href: "/tarefas?filtro=atrasadas&escopo=escritorio",
      label: "Tarefas atrasadas",
      count: pending.filter((t) => taskBucket(t, now) === "atrasadas").length,
      icon: AlarmClock,
      permission: "tasks.view",
      alert: true,
    },
    {
      href: "/tarefas?filtro=alta&escopo=escritorio",
      label: "Prioridade alta",
      count: pending.filter((t) => t.priority === "alta").length,
      icon: Flag,
      permission: "tasks.view",
    },
    {
      href: "/financeiro?aba=atrasados",
      label: "Parcelas em atraso",
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
      <PanelHeader title="Visualizações rápidas" description="Listas filtradas, com a contagem de agora" />
      <ul className="divide-y divide-border/70 px-2 pb-3 sm:px-3">
        {shown.map((v) => {
          const Icon = v.icon
          const hot = v.alert && v.count > 0
          return (
            <li key={v.href}>
              <Link
                href={v.href}
                className="group flex items-center gap-3 rounded-[8px] px-3 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-[8px]",
                    hot ? "bg-danger-soft text-danger" : "bg-surface-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{v.label}</span>
                <span className={cn("tabular text-[14px] font-semibold", hot ? "text-danger" : "text-foreground")}>{formatNumber(v.count)}</span>
                <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
