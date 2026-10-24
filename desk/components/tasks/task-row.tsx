"use client"

import { CalendarClock, ListTree, Repeat } from "lucide-react"
import Link from "next/link"
import { PriorityMark } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { relativeDayLabel, type LocalDate } from "@/lib/domain/dates"
import { isOverdue, STATUS_LABEL, taskCode } from "@/lib/domain/tasks"
import type { TaskItem } from "@/lib/services/tasks"
import { TaskCheckbox } from "./task-checkbox"
import { useTaskStatus } from "./use-task-status"

export type TaskRowOptions = { hideProject?: boolean; hideDue?: boolean; compact?: boolean }

/** Linha de tarefa usada em todas as listas: a mesma tarefa, o mesmo comportamento. */
export function TaskRow({ task, today, options = {} }: { task: TaskItem; today: LocalDate; options?: TaskRowOptions }) {
  const { status, toggle, pending } = useTaskStatus(task)
  const view = { ...task, status }
  const overdue = isOverdue(view, today)
  const done = status === "done"
  return (
    <li
      className={cn(
        "group relative flex items-start gap-3 border-b border-line-soft bg-transparent px-1 transition-colors last:border-b-0 hover:bg-white/70",
        options.compact ? "py-2" : "py-2.5",
        pending && "opacity-80",
      )}
    >
      <div className="relative z-10 pt-[3px]">
        <TaskCheckbox status={status} onToggle={toggle} label={task.title} />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/tasks/${task.id}`}
          className={cn("block truncate text-[0.9375rem] leading-snug text-ink outline-none after:absolute after:inset-0 focus-visible:underline", done && "text-ink-4 line-through decoration-ink-5")}
        >
          {task.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="meta">{taskCode(task.number)}</span>
          {status === "in_progress" ? <span className="meta text-cobalt-ink">{STATUS_LABEL.in_progress}</span> : null}
          {status === "archived" ? <span className="meta">{STATUS_LABEL.archived}</span> : null}
          {!options.hideDue && task.dueDate ? (
            <span className={cn("meta inline-flex items-center gap-1", overdue ? "font-medium text-clay" : task.dueDate === today && !done ? "text-cobalt-ink" : "")}>
              <CalendarClock className="size-3" />
              {overdue ? `atrasada · ${relativeDayLabel(task.dueDate, today)}` : relativeDayLabel(task.dueDate, today)}
            </span>
          ) : null}
          {task.recurrence ? <Repeat className="size-3 text-ink-4" aria-label="Recorrente" /> : null}
          {task.subtaskTotal > 0 ? (
            <span className="meta inline-flex items-center gap-1">
              <ListTree className="size-3" />
              {task.subtaskDone}/{task.subtaskTotal}
            </span>
          ) : null}
          {!options.hideProject && task.projectTitle && task.projectId ? (
            <Link href={`/projects/${task.projectId}`} className="relative z-10 truncate text-xs text-ink-3 hover:text-ink hover:underline">
              {task.projectTitle}
            </Link>
          ) : null}
          {task.areaName ? <span className="text-xs text-ink-4">{task.areaName}</span> : null}
          {task.tags.map((t) => (
            <span key={t.id} className="text-xs text-sage-ink">
              #{t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="pt-1.5">
        <PriorityMark priority={task.priority} />
      </div>
    </li>
  )
}

export function TaskList({ tasks, today, options, empty }: { tasks: TaskItem[]; today: LocalDate; options?: TaskRowOptions; empty?: React.ReactNode }) {
  if (tasks.length === 0) return <>{empty ?? null}</>
  return (
    <ul className="border-t border-line-soft">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} today={today} options={options} />
      ))}
    </ul>
  )
}
