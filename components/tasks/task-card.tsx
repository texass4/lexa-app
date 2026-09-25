"use client"

import { Ellipsis, Trash2 } from "lucide-react"
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
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { DueLabel } from "./task-row"
import { PRIORITY_CONFIG } from "@/lib/config"
import { getUser } from "@/lib/account"
import type { Task, TaskColumn } from "@/types"
import { useSession } from "@/lib/auth/session"

/** Card do quadro Kanban. Arrastável (HTML5 nativo); "Mover para" no menu cobre teclado e mobile. */
export function TaskCard({
  task,
  related,
  columns,
  onOpen,
  onDelete,
  onMove,
}: {
  task: Task
  related?: { label: string; kind: string; href: string }
  columns: TaskColumn[]
  onOpen: () => void
  onDelete: () => void
  onMove: (columnId: string) => void
}) {
  const priority = PRIORITY_CONFIG[task.priority]
  const assignee = getUser(task.assigneeId)
  const done = task.status === "concluida"
  const editable = useSession().can("tasks.edit")

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen()
      }}
      className="group space-y-2 rounded-[10px] border border-border bg-card p-3 text-left shadow-card outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40 data-[draggable=true]:cursor-grab data-[draggable=true]:active:cursor-grabbing"
      data-draggable={editable}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className={cn("text-[13px] font-medium leading-snug text-foreground", done && "text-subtle line-through decoration-subtle/60")}>
          {task.title}
        </p>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Ações para ${task.title}`}
              onClick={(e) => e.stopPropagation()}
              className="-mt-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-subtle opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 group-hover:opacity-100 aria-expanded:opacity-100"
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mover para</DropdownMenuLabel>
                {columns
                  .filter((c) => c.id !== task.columnId)
                  .map((c) => (
                    <DropdownMenuItem key={c.id} className="h-8 px-2" onClick={() => onMove(c.id)}>
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} /> {c.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={onDelete}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {related && <p className="truncate text-[11.5px] text-muted-foreground">{related.label}</p>}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <StatusBadge tone={priority.tone} size="sm">
          {priority.label}
        </StatusBadge>
        <DueLabel task={task} className="text-[11px]" />
      </div>
      <div className="flex items-center gap-1.5 pt-0.5 text-[11.5px] text-muted-foreground">
        <UserAvatar name={assignee.name} size="xs" />
        {assignee.firstName}
      </div>
    </div>
  )
}
