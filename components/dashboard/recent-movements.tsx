"use client"

import Link from "next/link"
import { Activity, ChevronRight } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { EmptyState } from "@/components/ui/empty-state"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { recentMovements } from "@/lib/dashboard/dashboard"
import { RECENT_DAYS } from "@/lib/dashboard/attention"
import { processNumberLabel, processTitle } from "@/lib/processos/label"
import { interpretMovement } from "@/lib/services/processos/movement-interpreter"
import { diffInDays, fmtDayLabel, getNow, parse } from "@/lib/core/dates"
import { PanelLink } from "./panel-link"

/**
 * As movimentações mais recentes dos processos (dados reais, já salvos), cada uma
 * com o cliente e o assunto do processo — o número fica como informação secundária.
 */
export function RecentMovements() {
  const data = useOfficeData()
  const items = recentMovements(data.processes)
  const now = getNow()

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Movimentações recentes" action={<PanelLink href="/processos">Ver processos</PanelLink>} />
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<Activity />}
          title="Nenhuma movimentação registrada."
          description="As movimentações dos processos aparecem aqui assim que forem registradas."
        />
      ) : (
        <ul className="px-3 pb-3">
          {items.map(({ process, movement }) => {
            const client = byId(data.clients, process.clientId)
            const readable = interpretMovement(movement, process.id)
            const days = diffInDays(now, parse(movement.at))
            const recent = days >= 0 && days <= RECENT_DAYS
            const court = readable.judicialUnit?.name?.trim() || process.tribunal || undefined
            return (
              <li key={`${process.id}:${movement.id}`}>
                <Link
                  href={`/processos/${process.id}`}
                  className="group flex items-center gap-3 rounded-[12px] px-3 py-3 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <span aria-hidden className={cn("size-1.5 shrink-0 self-start rounded-full mt-2", recent ? "bg-brand" : "bg-border-strong")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">{readable.title}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{processTitle(process, client?.name)}</span>
                    <span className="tabular block truncate text-[11.5px] text-subtle">
                      {processNumberLabel(process)}
                      {court && ` · ${court}`}
                    </span>
                  </span>
                  <span className="shrink-0 self-start pt-0.5 text-right text-[12px] text-subtle">{fmtDayLabel(movement.at, now)}</span>
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
