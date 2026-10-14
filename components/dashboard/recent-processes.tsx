"use client"

import Link from "next/link"
import { ChevronRight, Scale } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getUser } from "@/lib/auth/account"
import { PROCESS_STATUS } from "@/lib/core/config"
import { isActiveProcess, PRAZO_ALERT_DAYS } from "@/lib/dashboard/attention"
import { shortAgo } from "@/lib/dashboard/dashboard"
import { daysToPrazo, nextPrazo } from "@/lib/prazos/prazos"
import { processNumberLabel, processTitle } from "@/lib/processos/label"
import { fmtDayMonth, getNow } from "@/lib/core/dates"
import { PanelLink } from "./panel-link"

const LIMIT = 6

/**
 * Processos ativos com movimentação mais recente — situação, responsável, próximo
 * prazo e há quanto tempo mudou. Tabela no desktop; no celular, uma linha por processo.
 */
export function RecentProcesses() {
  const data = useOfficeData()
  const now = getNow()
  const rows = data.processes
    .filter(isActiveProcess)
    .sort((a, b) => (b.lastMovementAt ?? "").localeCompare(a.lastMovementAt ?? ""))
    .slice(0, LIMIT)

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Processos recentes" icon={<Scale />} action={<PanelLink href="/processos">Ver todos</PanelLink>} />
      {rows.length === 0 ? (
        <EmptyState compact title="Nenhum processo ativo." description="Os processos com movimentação recente aparecem aqui." />
      ) : (
        <div className="px-3 pb-3">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[13px] max-md:block">
            <thead className="max-md:sr-only">
              <tr className="text-[11.5px] font-medium text-subtle">
                <th scope="col" className="px-3 pb-2 font-medium">
                  Processo
                </th>
                <th scope="col" className="w-[170px] px-3 pb-2 font-medium">
                  Situação
                </th>
                <th scope="col" className="w-[92px] px-3 pb-2 font-medium">
                  Prazo
                </th>
                <th scope="col" className="w-[84px] px-3 pb-2 text-right font-medium">
                  Mudou há
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {rows.map((p) => {
                const client = byId(data.clients, p.clientId)
                const status = PROCESS_STATUS[p.status]
                const owner = getUser(p.ownerId)
                const prazo = nextPrazo(data.deadlines, p.id)
                const due = prazo ? daysToPrazo(prazo, now) : undefined
                const urgent = due !== undefined && due <= PRAZO_ALERT_DAYS.soon
                const href = `/processos/${p.id}`
                return (
                  <tr
                    key={p.id}
                    className="group relative max-md:flex max-md:border-t max-md:border-border/70 max-md:first:border-t-0 max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:py-2.5"
                  >
                    <td className="rounded-l-[10px] border-t border-border/70 px-3 py-2.5 group-first:border-t-0 group-hover:bg-accent/60 max-md:w-full max-md:border-0 max-md:p-0 max-md:px-3">
                      <Link
                        href={href}
                        className="block min-w-0 outline-none after:absolute after:inset-0 after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-brand/40"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span title={owner.name} className="shrink-0">
                            <UserAvatar name={owner.name} src={owner.avatarUrl} size="sm" />
                            <span className="sr-only">Responsável: {owner.name}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{processTitle(p, client?.name)}</span>
                            <span className="tabular block truncate text-[11.5px] text-subtle">{processNumberLabel(p)}</span>
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="border-t border-border/70 px-3 py-2.5 group-first:border-t-0 group-hover:bg-accent/60 max-md:border-0 max-md:p-0 max-md:pl-[50px]">
                      <StatusBadge tone={status.tone} size="sm">
                        {status.label}
                      </StatusBadge>
                    </td>
                    <td className="border-t border-border/70 px-3 py-2.5 group-first:border-t-0 group-hover:bg-accent/60 max-md:border-0 max-md:p-0">
                      {prazo ? (
                        <span
                          className={cn("tabular text-[12.5px] whitespace-nowrap", urgent ? "font-medium text-danger" : "text-foreground")}
                          title={`${prazo.description}${due !== undefined && due < 0 ? " (vencido)" : ""}`}
                        >
                          {fmtDayMonth(prazo.fatalDate)}
                          {due !== undefined && due < 0 && <span className="sr-only"> (vencido)</span>}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-subtle">—</span>
                      )}
                    </td>
                    <td className="rounded-r-[10px] border-t border-border/70 px-3 py-2.5 text-right group-first:border-t-0 group-hover:bg-accent/60 max-md:ml-auto max-md:border-0 max-md:p-0 max-md:pr-3">
                      <span className="tabular inline-flex items-center gap-1 text-[12px] text-subtle">
                        {shortAgo(p.lastMovementAt, now)}
                        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
