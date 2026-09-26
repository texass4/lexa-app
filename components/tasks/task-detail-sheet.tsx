"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarClock, CircleCheck, Flag, Pencil, RotateCcw, Sparkles, Trash2, UserRound } from "lucide-react"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Eyebrow } from "@/components/ui/panel"
import { PRIORITY_CONFIG } from "@/lib/config"
import { fmtActivityTime, fmtDayLabel, fmtDueIn, fmtTime } from "@/lib/dates"
import { getUser } from "@/lib/account"
import { isOverdue } from "@/lib/selectors"
import type { Task } from "@/types"
import { useSession } from "@/lib/auth/session"
import { useDemoData } from "@/lib/store/demo-store"
import { CLIENT_STATUS, PROCESS_STATUS } from "@/lib/config"
import { fmtRelative } from "@/lib/dates"
import { clientContext, processContext, taskPrompts } from "@/components/ai/ai-context"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"

/**
 * O que está em volta da tarefa: o processo (prazo, última movimentação) ou o
 * cliente — e perguntas da LEXA sobre ela, com os dados desse contexto.
 */
function TaskContext({ task, onBeforeAsk }: { task: Task; onBeforeAsk: () => void }) {
  const data = useDemoData()
  const lexa = useLexaAI()
  const { can } = useSession()
  const related = task.related
  const process = related?.type === "process" && can("processes.view") ? data.processes.find((p) => p.id === related.id) : undefined
  const client =
    related?.type === "client" && can("clients.view")
      ? data.clients.find((c) => c.id === related.id)
      : process && can("clients.view")
        ? data.clients.find((c) => c.id === process.clientId)
        : undefined

  if (!process && !client) {
    return (
      <p className="rounded-[12px] border border-dashed border-border px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Esta tarefa não está ligada a um processo ou cliente. Vincule em “Editar” para ver o contexto aqui e perguntar à LEXA sobre ela.
      </p>
    )
  }

  const aiContext = process ? processContext(process.id, process.code) : clientContext(client!.id, client!.name)
  const prompts = taskPrompts(task.title, process ? "process" : "client")
  const lastMovement = process?.movements.length ? process.lastMovementAt : undefined

  return (
    <section className="space-y-3">
      <Eyebrow>Contexto</Eyebrow>
      {process && (
        <Link
          href={`/processos/${process.id}`}
          className="group block rounded-[12px] border border-border bg-surface p-3.5 outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[13.5px] font-medium">
              Processo <span className="font-mono">{process.code}</span> · {process.type}
            </p>
            <StatusBadge tone={PROCESS_STATUS[process.status].tone} size="sm">
              {PROCESS_STATUS[process.status].label}
            </StatusBadge>
          </div>
          <dl className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
            {process.nextDeadline && process.status !== "concluido" && (
              <div className="flex gap-1.5">
                <dt>Próximo prazo:</dt>
                <dd className="min-w-0 truncate text-foreground">
                  {fmtDueIn(process.nextDeadline.date)} · {process.nextDeadline.title}
                </dd>
              </div>
            )}
            {lastMovement && (
              <div className="flex gap-1.5">
                <dt>Última movimentação:</dt>
                <dd className="min-w-0 truncate text-foreground">
                  {fmtRelative(lastMovement)} · {process.movements[0]?.title}
                </dd>
              </div>
            )}
          </dl>
        </Link>
      )}
      {client && (
        <Link
          href={`/clientes/${client.id}`}
          className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar name={client.name} size="xs" />
            <span className="truncate font-medium">{client.name}</span>
          </span>
          <StatusBadge tone={CLIENT_STATUS[client.status].tone} size="sm">
            {CLIENT_STATUS[client.status].label}
          </StatusBadge>
        </Link>
      )}
      <div className="rounded-[12px] border border-gold/20 bg-gold-soft/35 p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-gold-dark">
          <Sparkles className="size-3.5" /> Pergunte à LEXA sobre esta tarefa
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                onBeforeAsk()
                lexa.ask(prompt, aiContext)
              }}
              className="rounded-[8px] px-2 py-1.5 text-left text-[12.5px] text-foreground outline-none transition-colors hover:bg-surface/80 focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

export function TaskDetailSheet({
  task,
  related,
  open,
  onOpenChange,
  onToggle,
  onEdit,
  onDelete,
}: {
  task?: Task
  related?: { label: string; kind: string; href: string }
  open: boolean
  onOpenChange: (o: boolean) => void
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const [shown, setShown] = React.useState(task)
  const [deleting, setDeleting] = React.useState(false)
  const editable = useSession().can("tasks.edit")
  if (task && task !== shown) setShown(task)
  const t = task ?? shown
  if (!t) return null

  const done = t.status === "concluida"
  const priority = PRIORITY_CONFIG[t.priority]
  const assignee = getUser(t.assigneeId)
  const overdue = isOverdue(t)

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Tarefa: ${t.title}`}
      header={
        <div className="border-b border-border px-5 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-1.5 pr-10">
            <StatusBadge tone={done ? "success" : overdue ? "danger" : "neutral"}>
              {done ? "Concluída" : overdue ? "Atrasada" : "Pendente"}
            </StatusBadge>
            <StatusBadge tone={priority.tone} dot={false}>
              Prioridade {priority.label.toLowerCase()}
            </StatusBadge>
          </div>
          <h2 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.015em]">{t.title}</h2>
          {related && (
            <Link
              href={related.href}
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {related.label}
              {related.kind !== related.label && <span className="text-subtle">· {related.kind}</span>}
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      }
      footer={
        editable && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir tarefa"
              className="text-danger hover:bg-danger-soft"
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
            </Button>
            <Button variant="secondary" onClick={() => onEdit(t)}>
              <Pencil /> Editar
            </Button>
            <Button className="ml-auto" variant={done ? "secondary" : "default"} onClick={() => onToggle(t)}>
              {done ? <RotateCcw /> : <CircleCheck />}
              {done ? "Reabrir tarefa" : "Marcar como concluída"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-6 px-5 py-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-4 text-subtle" />
            <div>
              <dt className="text-[11.5px] text-muted-foreground">Prazo</dt>
              <dd className={overdue ? "text-[13.5px] font-medium text-danger" : "text-[13.5px] font-medium"}>
                {fmtDayLabel(t.dueAt)}, {fmtTime(t.dueAt)}
                <span className="block text-[12px] font-normal text-muted-foreground">{fmtDueIn(t.dueAt)}</span>
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-4 text-subtle" />
            <div>
              <dt className="text-[11.5px] text-muted-foreground">Responsável</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 text-[13.5px] font-medium">
                <UserAvatar name={assignee.name} size="xs" /> {assignee.name}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Flag className="mt-0.5 size-4 text-subtle" />
            <div>
              <dt className="text-[11.5px] text-muted-foreground">Prioridade</dt>
              <dd className="text-[13.5px] font-medium">{priority.label}</dd>
            </div>
          </div>
          {done && t.completedAt && (
            <div className="flex items-start gap-3">
              <CircleCheck className="mt-0.5 size-4 text-success" />
              <div>
                <dt className="text-[11.5px] text-muted-foreground">Concluída</dt>
                <dd className="text-[13.5px] font-medium">{fmtActivityTime(t.completedAt)}</dd>
              </div>
            </div>
          )}
        </dl>
        <TaskContext task={t} onBeforeAsk={() => onOpenChange(false)} />
        <section>
          <Eyebrow className="mb-2">Descrição</Eyebrow>
          <p className="rounded-[12px] bg-surface-muted/60 px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-line text-foreground/90">
            {t.description ?? "Sem descrição. Use “Editar” para adicionar orientações para a equipe."}
          </p>
        </section>
        <p className="text-[11.5px] text-subtle">Criada em {fmtActivityTime(t.createdAt)}</p>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir "${t.title}"?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => onDelete(t)}
      />
    </SideSheet>
  )
}
