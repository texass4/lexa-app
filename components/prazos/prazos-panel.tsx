"use client"

import * as React from "react"
import Link from "next/link"
import { CircleCheck, CircleX, Hourglass, ListChecks, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Can } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { PRAZO_ORIGIN, PRAZO_STATUS } from "@/lib/core/config"
import { fmtDueIn, fmtNumericDate } from "@/lib/core/dates"
import { PRAZO_ALERT_DAYS } from "@/lib/dashboard/attention"
import { daysToPrazo, prazoTask, prazosOfProcess } from "@/lib/prazos/prazos"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import type { Prazo, Process } from "@/types"

/** Prazos do processo: abertos primeiro, com cumprir / marcar como perdido. */
export function PrazosPanel({ process }: { process: Process }) {
  const data = useOfficeData()
  const { openDialog } = useUI()
  const prazos = prazosOfProcess(data.deadlines, process.id)
  const open = prazos.filter((p) => p.status === "aberto").length

  return (
    <Panel>
      <PanelHeader
        title="Prazos"
        description={open === 1 ? "1 aberto" : `${open} abertos`}
        action={
          <Can permission="processes.edit">
            <Button variant="ghost" size="icon-sm" aria-label="Novo prazo" onClick={() => openDialog("prazo", { processId: process.id })}>
              <Plus />
            </Button>
          </Can>
        }
      />
      {prazos.length ? (
        <ul className="px-3 pb-3">
          {prazos.map((p) => (
            <PrazoRow key={p.id} prazo={p} />
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          title="Nenhum prazo cadastrado."
          description="Cadastre os prazos do processo para acompanhar data fatal, responsável e tarefa."
          action={
            <Can permission="processes.edit">
              <Button size="sm" variant="secondary" onClick={() => openDialog("prazo", { processId: process.id })}>
                <Plus /> Novo prazo
              </Button>
            </Can>
          }
        />
      )}
    </Panel>
  )
}

/** Um prazo, com cumprir / marcar como perdido. `showProcess`: mostra processo e cliente (fora do perfil do processo). */
export function PrazoRow({ prazo, showProcess = false }: { prazo: Prazo; showProcess?: boolean }) {
  const data = useOfficeData()
  const { setPrazoStatus } = useOfficeActions()
  const [confirmLost, setConfirmLost] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const isOpen = prazo.status === "aberto"
  const days = daysToPrazo(prazo)
  const urgent = isOpen && days <= PRAZO_ALERT_DAYS.soon
  const task = prazoTask(prazo, data.tasks)
  const status = PRAZO_STATUS[prazo.status]
  const process = showProcess ? data.processes.find((p) => p.id === prazo.processId) : undefined
  const client = process ? data.clients.find((c) => c.id === process.clientId) : undefined

  const close = async (next: "cumprido" | "perdido") => {
    setBusy(true)
    const result = await setPrazoStatus(prazo.id, next)
    setBusy(false)
    if (result.status === "saved") {
      toast.success(next === "cumprido" ? "Prazo cumprido." : "Prazo marcado como perdido.", { description: prazo.description })
    }
  }

  return (
    <li className="rounded-[10px] px-2 py-2.5">
      <div className="flex items-start gap-3">
        <Hourglass className={cn("mt-0.5 size-4 shrink-0", urgent ? "text-danger" : isOpen ? "text-subtle" : "text-muted-foreground/60")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-[13.5px] font-medium max-sm:line-clamp-2 sm:truncate", !isOpen && "text-muted-foreground")}>{prazo.description}</p>
            <StatusBadge tone={status.tone} size="sm">
              {status.label}
            </StatusBadge>
          </div>
          {process && (
            <Link
              href={`/processos/${process.id}`}
              className="mt-0.5 block truncate rounded-sm text-[12px] text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Processo {process.code}
              {client ? ` · ${client.name}` : ""}
            </Link>
          )}
          <p className={cn("mt-0.5 text-[12px]", urgent ? "font-medium text-danger" : "text-muted-foreground")}>
            Fatal em {fmtNumericDate(prazo.fatalDate)}
            {isOpen && ` · ${fmtDueIn(prazo.fatalDate)}`} · interna {fmtNumericDate(prazo.internalDate)}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground sm:truncate">
            {prazo.responsibleId ? getUser(prazo.responsibleId).name : "Sem responsável"} · {PRAZO_ORIGIN[prazo.origin]}
            {isOpen && (
              <>
                {" · "}
                {task ? (
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="inline size-3" /> tarefa {task.status === "concluida" ? "concluída" : "pendente"}
                  </span>
                ) : (
                  <span className="font-medium text-warning">sem tarefa</span>
                )}
              </>
            )}
          </p>
          {prazo.internalDateReason && <p className="mt-0.5 text-[12px] text-muted-foreground">Data interna: {prazo.internalDateReason}</p>}
          {isOpen && (
            <Can permission="processes.edit">
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => close("cumprido")}>
                  <CircleCheck /> Cumprir prazo
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => setConfirmLost(true)}>
                  <CircleX /> Marcar como perdido
                </Button>
              </div>
            </Can>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmLost}
        onOpenChange={setConfirmLost}
        title={`Marcar "${prazo.description}" como perdido?`}
        description="O prazo deixa de contar como pendente e o registro entra nas timelines do processo e do cliente."
        confirmLabel="Marcar como perdido"
        onConfirm={() => void close("perdido")}
      />
    </li>
  )
}
