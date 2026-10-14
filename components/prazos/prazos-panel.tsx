"use client"

import * as React from "react"
import Link from "next/link"
import { CircleCheck, CircleX, Ellipsis, ExternalLink, Hourglass, ListChecks, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Can } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { PRAZO_ORIGIN, PRAZO_STATUS } from "@/lib/core/config"
import { fmtDayMonthParts, fmtDueIn, fmtNumericDate } from "@/lib/core/dates"
import { PRAZO_ALERT_DAYS } from "@/lib/dashboard/attention"
import { daysToPrazo, prazoTask, prazosOfProcess } from "@/lib/prazos/prazos"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useUI } from "@/lib/store/ui-store"
import type { Prazo, Process } from "@/types"
import { processTitle } from "@/lib/processos/label"

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
  const process = showProcess ? byId(data.processes, prazo.processId) : undefined
  const client = process ? byId(data.clients, process.clientId) : undefined

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
              className="mt-0.5 block truncate rounded-sm text-[12px] pointer-coarse:-my-2 pointer-coarse:py-2 text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {processTitle(process, client?.name)}
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

/**
 * Linha da tela Prazos: data fatal em destaque à esquerda (cor pela urgência), o prazo e o
 * processo, quem responde e a tarefa, e as ações — cumprir à vista, o resto no menu.
 * Mesmas regras e ações de `PrazoRow`.
 */
export function PrazoListRow({ prazo }: { prazo: Prazo }) {
  const data = useOfficeData()
  const { setPrazoStatus } = useOfficeActions()
  const [confirmLost, setConfirmLost] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const isOpen = prazo.status === "aberto"
  const days = daysToPrazo(prazo)
  const overdue = isOpen && days < 0
  const urgent = isOpen && days <= PRAZO_ALERT_DAYS.soon
  const task = prazoTask(prazo, data.tasks)
  const status = PRAZO_STATUS[prazo.status]
  const process = byId(data.processes, prazo.processId)
  const client = process ? byId(data.clients, process.clientId) : undefined
  const owner = prazo.responsibleId ? getUser(prazo.responsibleId) : undefined
  const { day, month } = fmtDayMonthParts(prazo.fatalDate)

  const close = async (next: "cumprido" | "perdido") => {
    setBusy(true)
    const result = await setPrazoStatus(prazo.id, next)
    setBusy(false)
    if (result.status === "saved") {
      toast.success(next === "cumprido" ? "Prazo cumprido." : "Prazo marcado como perdido.", { description: prazo.description })
    }
  }

  return (
    <li className="group flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-accent/40 sm:flex-nowrap sm:px-5">
      <span
        aria-hidden
        className={cn(
          "flex w-12 shrink-0 flex-col items-center rounded-[10px] border py-1.5 leading-none",
          !isOpen
            ? "border-border bg-surface-muted text-muted-foreground"
            : overdue
              ? "border-danger/25 bg-danger-soft text-danger"
              : urgent
                ? "border-warning/25 bg-warning-soft text-warning"
                : "border-border bg-surface text-foreground",
        )}
      >
        <span className="tabular text-[17px] font-semibold">{day}</span>
        <span className="mt-1 text-[10px] font-semibold tracking-[0.06em]">{month}</span>
      </span>

      <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-64px)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-[14px] font-medium", isOpen ? "text-foreground" : "text-muted-foreground")}>{prazo.description}</p>
          {!isOpen && (
            <StatusBadge tone={status.tone} size="sm">
              {status.label}
            </StatusBadge>
          )}
        </div>
        {process && (
          <Link
            href={`/processos/${process.id}`}
            className="mt-0.5 block truncate rounded-sm text-[12.5px] text-muted-foreground outline-none pointer-coarse:-my-2 pointer-coarse:py-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {processTitle(process, client?.name)}
          </Link>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {owner ? <UserAvatar name={owner.name} src={owner.avatarUrl} size="xs" /> : null}
            {owner ? owner.firstName : "Sem responsável"}
          </span>
          <span className="text-subtle">·</span>
          <span>{PRAZO_ORIGIN[prazo.origin]}</span>
          <span className="text-subtle">·</span>
          <span className="tabular">interna {fmtNumericDate(prazo.internalDate)}</span>
          {isOpen && (
            <>
              <span className="text-subtle">·</span>
              {task ? (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-3" /> tarefa {task.status === "concluida" ? "concluída" : "pendente"}
                </span>
              ) : (
                <span className="font-medium text-warning">sem tarefa</span>
              )}
            </>
          )}
        </p>
        {prazo.internalDateReason && <p className="mt-0.5 text-[12px] text-muted-foreground">Data interna: {prazo.internalDateReason}</p>}
      </div>

      {/* Celular: prazo e ações numa linha própria, alinhada ao texto. */}
      <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:justify-between max-sm:pl-16">
        <span className={cn("tabular text-right text-[12.5px] whitespace-nowrap", overdue ? "font-medium text-danger" : urgent ? "font-medium text-warning" : "text-muted-foreground")}>
          {isOpen ? fmtDueIn(prazo.fatalDate) : `fatal ${fmtNumericDate(prazo.fatalDate)}`}
        </span>
        <div className="flex items-center gap-1">
          {isOpen && (
            <Can permission="processes.edit">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => close("cumprido")}>
                <CircleCheck /> Cumprir
              </Button>
            </Can>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Mais ações para ${prazo.description}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
              <DropdownMenuGroup>
                {process && (
                  <DropdownMenuItem className="h-8 px-2" render={<Link href={`/processos/${process.id}`} />}>
                    <ExternalLink /> Abrir processo
                  </DropdownMenuItem>
                )}
                {isOpen && (
                  <Can permission="processes.edit">
                    <DropdownMenuItem className="h-8 px-2" variant="destructive" disabled={busy} onClick={() => setConfirmLost(true)}>
                      <CircleX /> Marcar como perdido
                    </DropdownMenuItem>
                  </Can>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
