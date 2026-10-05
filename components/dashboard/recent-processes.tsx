"use client"

import Link from "next/link"
import { ChevronRight, Scale } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { EmptyState } from "@/components/ui/empty-state"
import { useOfficeData } from "@/lib/store/office-store"
import { RECENT_STATE_LABEL, recentProcesses, shortAgo, type RecentState } from "@/lib/dashboard/dashboard"
import { PanelLink } from "./panel-link"

const STATE_STYLE: Record<RecentState, { dot: string; badge: string }> = {
  nova: { dot: "bg-brand", badge: "bg-brand-soft text-brand-strong" },
  prazo: { dot: "bg-warning", badge: "bg-warning-soft text-warning" },
  movimentacao: { dot: "bg-info", badge: "bg-surface-muted text-muted-foreground" },
  "sem-novidades": { dot: "bg-success", badge: "bg-success-soft text-success" },
}

/** Processos ativos com a movimentação mais recente, cada um com o que mudou. */
export function RecentProcesses() {
  const data = useOfficeData()
  const items = recentProcesses(data)

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Processos recentes" action={<PanelLink href="/processos">Ver todos</PanelLink>} />
      {items.length === 0 ? (
        <EmptyState compact icon={<Scale />} title="Nenhum processo ativo." description="Consulte um processo pelo número CNJ em Novo › Processo." />
      ) : (
        <ul className="px-3 pb-3">
          {items.map(({ process, state, prazo }) => {
            const client = data.clients.find((c) => c.id === process.clientId)
            const style = STATE_STYLE[state]
            return (
              <li key={process.id}>
                <Link
                  href={`/processos/${process.id}`}
                  className="group flex items-center gap-3 rounded-[12px] px-3 py-3 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="tabular block truncate text-[13.5px] font-medium text-foreground">{process.number}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {client?.name ?? "Sem cliente"}
                      {prazo && <span className="max-sm:hidden"> · {prazo.description}</span>}
                      <span className="sm:hidden"> · {RECENT_STATE_LABEL[state]}</span>
                    </span>
                  </span>
                  <span className={cn("hidden shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium sm:inline-flex", style.badge)}>
                    {RECENT_STATE_LABEL[state]}
                  </span>
                  <span className="tabular w-12 shrink-0 text-right text-[12px] text-subtle" title="Desde a última movimentação">
                    {shortAgo(process.lastMovementAt)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
