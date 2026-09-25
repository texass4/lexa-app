"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { cn } from "cn"
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { describeRelated, isOverdue } from "@/lib/selectors"
import { PRIORITY_CONFIG } from "@/lib/config"
import { fmtDayLabel, fmtTime } from "@/lib/dates"
import { getUser } from "@/lib/account"
import type { Task } from "@/types"

export function useToggleTask() {
  const { toggleTask } = useDemoActions()
  return (task: Task) => {
    const updated = toggleTask(task.id)
    if (updated?.status === "concluida") {
      toast.success("Tarefa concluída.", {
        description: task.title,
        action: { label: "Desfazer", onClick: () => toggleTask(task.id) },
      })
    }
  }
}

export function DueLabel({ task, className }: { task: Task; className?: string }) {
  const overdue = isOverdue(task)
  return (
    <span className={cn("tabular whitespace-nowrap text-[12px]", overdue ? "font-medium text-danger" : "text-muted-foreground", className)}>
      {fmtDayLabel(task.dueAt)}, {fmtTime(task.dueAt)}
    </span>
  )
}

/** Linha compacta usada no dashboard e em listas de contexto (cliente/processo). */
export function TaskRow({ task, showAssignee = false }: { task: Task; showAssignee?: boolean }) {
  const data = useDemoData()
  const toggle = useToggleTask()
  const related = describeRelated(data, task.related)
  const done = task.status === "concluida"
  const priority = PRIORITY_CONFIG[task.priority]

  return (
    <motion.li
      layout="position"
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex items-start gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-accent/60"
    >
      <AnimatedCheckbox
        checked={done}
        onChange={() => toggle(task)}
        label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "relative w-fit max-w-full truncate text-[13.5px] font-medium transition-colors duration-200",
            done ? "text-subtle" : "text-foreground",
          )}
        >
          {task.title}
          <motion.span
            aria-hidden
            initial={false}
            animate={{ scaleX: done ? 1 : 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute top-1/2 left-0 h-px w-full origin-left bg-subtle"
          />
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {related && (
            <>
              <Link href={related.href} className="truncate outline-none hover:text-foreground hover:underline focus-visible:underline">
                {related.label}
              </Link>
              <span className="text-subtle">·</span>
            </>
          )}
          <DueLabel task={task} className="text-[12px]" />
        </div>
      </div>
      <div className={cn("flex shrink-0 items-center gap-2 pt-0.5 transition-opacity", done && "opacity-40")}>
        {task.priority === "alta" && (
          <StatusBadge tone={priority.tone} size="sm">
            {priority.label}
          </StatusBadge>
        )}
        {showAssignee && <UserAvatar name={getUser(task.assigneeId).name} size="xs" />}
      </div>
    </motion.li>
  )
}
