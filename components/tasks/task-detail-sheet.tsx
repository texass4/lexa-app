"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarClock, CircleCheck, Flag, Pencil, RotateCcw, Trash2, UserRound } from "lucide-react"
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
        <section>
          <Eyebrow className="mb-2">Descrição</Eyebrow>
          <p className="rounded-[12px] bg-surface-muted/60 px-3.5 py-3 text-[13px] leading-relaxed text-foreground/90">
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
