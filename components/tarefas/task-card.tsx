"use client"

import * as React from "react"
import { Briefcase, Check, Ellipsis, Eye, Flag, Gavel, ListChecks, RotateCcw, Trash2, UserRound } from "lucide-react"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/ui/user-avatar"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { fmtDayMonth, fmtTime, getNow } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { checklistProgress, dueGroup } from "@/lib/tarefas/workspace"
import type { Task, TaskColumn } from "@/types"
import { useTaskActions } from "./task-actions"

/** "25 set" */
export const dayMonth = (iso: string) => fmtDayMonth(iso).toLowerCase()

export const PRIORITY_STYLE: Record<Task["priority"], string> = {
  alta: "text-danger",
  media: "text-warning",
  baixa: "text-subtle",
}

/** Prazo com a urgência: atrasada (vermelho), hoje (âmbar), amanhã; concluída, discreta. */
export function DueChip({ task, className }: { task: Task; className?: string }) {
  const done = task.status === "concluida"
  const group = done ? undefined : dueGroup(task, getNow())
  const label = group === "hoje" ? `Hoje, ${fmtTime(task.dueAt)}` : group === "amanha" ? "Amanhã" : dayMonth(task.dueAt)
  return (
    <span
      title={`Prazo: ${dayMonth(task.dueAt)}, ${fmtTime(task.dueAt)}${group === "atrasadas" ? " — atrasada" : ""}`}
      className={cn(
        "tabular inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-medium whitespace-nowrap",
        done
          ? "text-subtle"
          : group === "atrasadas"
            ? "bg-danger-soft text-danger"
            : group === "hoje"
              ? "bg-warning-soft text-warning"
              : "bg-surface-muted text-muted-foreground",
        className,
      )}
    >
      {group === "atrasadas" && <span className="sr-only">Atrasada: </span>}
      {label}
    </span>
  )
}

export function RelatedLine({ related, className }: { related?: { label: string; kind: string; href: string }; className?: string }) {
  if (!related) return null
  const Icon = related.kind === "Cliente" ? UserRound : Briefcase
  return (
    <p
      className={cn("flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground", className)}
      title={`${related.label} · ${related.kind}`}
    >
      <Icon className="size-3 shrink-0 text-subtle" aria-hidden />
      <span className="truncate">{related.label}</span>
    </p>
  )
}

/** Cartão do quadro: arrastável; "Mover para" no menu cobre teclado, leitores de tela e toque. */
export const TaskCard = React.memo(function TaskCard({
  task,
  related,
  columns,
  currentColumnId,
  showAssignee,
  isPrazo,
  active,
  onOpen,
  onDragState,
}: {
  task: Task
  related?: { label: string; kind: string; href: string }
  columns: TaskColumn[]
  currentColumnId?: string
  showAssignee: boolean
  /** Tarefa de um prazo processual (vínculo real com o prazo). */
  isPrazo: boolean
  active: boolean
  onOpen: (id: string) => void
  onDragState: (id: string | null) => void
}) {
  const a = useTaskActions()
  const done = task.status === "concluida"
  const priority = PRIORITY_CONFIG[task.priority]
  const progress = checklistProgress(task)
  const assignee = getUser(task.assigneeId)
  const [dragging, setDragging] = React.useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${task.title}${done ? " (concluída)" : ""}`}
      draggable={a.editable}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-integra-task", task.id)
        e.dataTransfer.effectAllowed = "move"
        setDragging(true)
        onDragState(task.id)
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragState(null)
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,[role=menuitem]")) return
        onOpen(task.id)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(task.id)
      }}
      data-task-card={task.id}
      className={cn(
        "group relative rounded-[10px] border bg-card px-3 pt-2.5 pb-2 text-left outline-none transition-[border-color,box-shadow,opacity,transform] duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
        a.editable && "cursor-grab active:cursor-grabbing",
        active ? "border-brand/50 ring-2 ring-brand/15" : "border-border hover:border-border-strong hover:shadow-card",
        dragging && "scale-[0.98] opacity-50 motion-reduce:scale-100",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={!a.editable}
          onClick={() => void a.setDone(task, !done)}
          aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
          title={done ? "Reabrir" : "Concluir"}
          className={cn(
            "touch-target relative mt-[1px] flex size-[15px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 disabled:cursor-default",
            done ? "border-success bg-success text-white" : "border-border-strong hover:border-success hover:bg-success-soft",
          )}
        >
          {done && <Check className="size-2.5" strokeWidth={3} />}
        </button>
        <p
          className={cn(
            "line-clamp-3 min-w-0 flex-1 text-[13px] leading-snug font-medium break-words",
            done ? "text-subtle line-through decoration-subtle/60" : "text-foreground",
          )}
        >
          {task.title}
        </p>
        <CardMenu task={task} columns={columns} currentColumnId={currentColumnId} onOpen={() => onOpen(task.id)} />
      </div>

      {related && <RelatedLine related={related} className="mt-1.5 pl-[23px]" />}

      <div className="mt-2 flex items-center gap-1.5 pl-[23px]">
        <DueChip task={task} />
        {isPrazo && (
          <span
            title="Tarefa de um prazo processual"
            className="inline-flex h-5 items-center gap-1 rounded-[5px] bg-brand-soft px-1.5 text-[10.5px] font-medium text-brand-strong"
          >
            <Gavel className="size-3" aria-hidden /> Prazo
          </span>
        )}
        {progress.total > 0 && (
          <span
            title={`Checklist: ${progress.done} de ${progress.total}`}
            className={cn(
              "tabular inline-flex h-5 items-center gap-1 text-[11px]",
              progress.done === progress.total ? "text-success" : "text-muted-foreground",
            )}
          >
            <ListChecks className="size-3" aria-hidden />
            {progress.done}/{progress.total}
          </span>
        )}
        <span className="flex-1" />
        <Flag
          className={cn("size-3.5 shrink-0", PRIORITY_STYLE[task.priority], done && "opacity-40")}
          aria-label={`Prioridade ${priority.label.toLowerCase()}`}
        />
        {showAssignee && (
          <span title={`Responsável: ${assignee.name}`}>
            <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="xs" />
          </span>
        )}
      </div>
    </div>
  )
})

function CardMenu({ task, columns, currentColumnId, onOpen }: { task: Task; columns: TaskColumn[]; currentColumnId?: string; onOpen: () => void }) {
  const a = useTaskActions()
  const done = task.status === "concluida"
  const item = "h-8 gap-2.5 px-2 text-[13px]"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Ações para ${task.title}`}
        onClick={(e) => e.stopPropagation()}
        className="-mt-1 -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-subtle opacity-0 outline-none transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Ellipsis className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuGroup>
          <DropdownMenuItem className={item} onClick={onOpen}>
            <Eye /> Abrir detalhes
          </DropdownMenuItem>
          {a.editable && (
            <DropdownMenuItem className={item} onClick={() => void a.setDone(task, !done)}>
              {done ? <RotateCcw /> : <Check />} {done ? "Reabrir" : "Concluir"}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {a.editable && columns.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Mover para</DropdownMenuLabel>
              {columns
                .filter((c) => c.id !== currentColumnId)
                .map((c) => (
                  <DropdownMenuItem key={c.id} className={item} onClick={() => void a.move(task, c.id)}>
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden /> {c.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className={item} variant="destructive" onClick={() => a.remove([task])}>
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
