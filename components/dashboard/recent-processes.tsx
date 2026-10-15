"use client"

import Link from "next/link"
import { Briefcase, FileText } from "lucide-react"
import { cn } from "cn"
import { Panel } from "@/components/ui/panel"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getUser } from "@/lib/auth/account"
import { PROCESS_STATUS } from "@/lib/core/config"
import { isActiveProcess, PRAZO_ALERT_DAYS } from "@/lib/dashboard/attention"
import { daysToPrazo, nextPrazo } from "@/lib/prazos/prazos"
import { processNumberLabel, processSubject } from "@/lib/processos/label"
import { fmtNumericDate, getNow } from "@/lib/core/dates"
import { PanelLink } from "./panel-link"

const LIMIT = 6

/**
 * Processos ativos com movimentação mais recente, para leitura rápida: número, assunto,
 * data da última movimentação e situação. O ponto vermelho marca prazo vencido ou próximo
 * (o detalhe fica no título do ponto). No celular, uma linha por processo.
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
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-foreground">
          <span className="flex size-8 items-center justify-center rounded-[8px] bg-brand-soft text-brand">
            <Briefcase className="size-[17px]" />
          </span>
          Processos recentes
        </h2>
        <PanelLink href="/processos">Ver todos</PanelLink>
      </header>
      {rows.length === 0 ? (
        <EmptyState compact title="Nenhum processo ativo." description="Os processos com movimentação recente aparecem aqui." />
      ) : (
        <div className="px-3 pb-3 sm:px-4">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[12.5px] max-md:block">
            <thead className="max-md:sr-only">
              <tr className="text-[11.5px] text-subtle">
                <th scope="col" className="rounded-l-[8px] bg-surface-muted/70 py-2 pl-9 font-medium @5xl/main:w-[40%]">
                  Processo
                </th>
                <th scope="col" className="hidden bg-surface-muted/70 px-3 py-2 font-medium @5xl/main:table-cell">
                  Assunto
                </th>
                <th scope="col" className="w-[104px] bg-surface-muted/70 px-3 py-2 font-medium whitespace-nowrap" title="Última movimentação">
                  Movimentação
                </th>
                <th scope="col" className="w-[124px] rounded-r-[8px] bg-surface-muted/70 px-3 py-2 font-medium">
                  Situação
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
                const cell = "border-b border-border/70 py-2.5 group-last:border-0 group-hover:bg-accent/50 max-md:border-0 max-md:p-0"
                return (
                  <tr
                    key={p.id}
                    className="group relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:border-b max-md:border-border/70 max-md:py-2.5"
                  >
                    <td className={cn(cell, "pl-2 max-md:w-full")}>
                      <Link
                        href={href}
                        title={`${client?.name ?? "Sem cliente"} · responsável: ${owner.name}`}
                        className="flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 after:rounded-[8px] focus-visible:after:ring-2 focus-visible:after:ring-brand/40"
                      >
                        <span
                          aria-label={urgent && prazo ? `Prazo ${due! < 0 ? "vencido" : "próximo"}: ${prazo.description}` : undefined}
                          title={
                            urgent && prazo
                              ? `Prazo ${due! < 0 ? "vencido" : "próximo"}: ${prazo.description} (${fmtNumericDate(prazo.fatalDate)})`
                              : undefined
                          }
                          className={cn("size-1.5 shrink-0 rounded-full", urgent ? "bg-danger" : "bg-transparent")}
                        />
                        <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
                        <span className="min-w-0">
                          <span className="tabular block truncate font-medium text-foreground">{processNumberLabel(p)}</span>
                          {/* Sem espaço para a coluna Assunto (assistente aberto, celular), o assunto vem logo abaixo. */}
                          <span className="block truncate text-[11.5px] text-muted-foreground @5xl/main:hidden">{processSubject(p)}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={cn(cell, "hidden px-3 text-muted-foreground @5xl/main:table-cell")}>
                      <span className="block truncate">{processSubject(p)}</span>
                    </td>
                    <td className={cn(cell, "tabular px-3 text-muted-foreground max-md:pl-[34px]")}>
                      {p.lastMovementAt ? fmtNumericDate(p.lastMovementAt) : "—"}
                    </td>
                    <td className={cn(cell, "px-3 max-md:ml-auto")}>
                      <StatusBadge tone={status.tone} size="sm" dot={false}>
                        {status.label}
                      </StatusBadge>
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
