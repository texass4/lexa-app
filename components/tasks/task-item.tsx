"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CircleCheck, Ellipsis, Eye, Pencil, RotateCcw } from "lucide-react"
import { cn } from "cn"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { DueLabel } from "./task-row"
import { PRIORITY_CONFIG } from "@/lib/config"
import { getUser } from "@/lib/account"
import type { Task } from "@/types"

export function TaskItem({
  task,
  related,
  onToggle,
  onEdit,
  onOpen,
}: {
  task: Task
  related?: { label: string; kind: string; href: string }
  onToggle: () => void
  onEdit: () => void
  onOpen: () => void
}) {
  const done = task.status === "concluida"
  const priority = PRIORITY_CONFIG[task.priority]
  const assignee = getUser(task.assigneeId)

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="group relative border-b border-border last:border-0"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen()
        }}
        className="flex cursor-pointer items-start gap-3.5 px-4 py-3.5 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent sm:items-center sm:px-5"
      >
        <AnimatedCheckbox
          checked={done}
          onChange={onToggle}
          label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
          className="mt-0.5 sm:mt-0"
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13.5px] font-medium transition-colors",
              done ? "text-subtle line-through decoration-subtle/60" : "text-foreground",
            )}
          >
            {task.title}
          </p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted-foreground">
            {related && (
              <>
                <Link
                  href={related.href}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[240px] truncate outline-none hover:text-foreground hover:underline focus-visible:underline"
                >
                  {related.label}
                </Link>
                {related.kind !== related.label && <span className="hidden truncate text-subtle sm:inline">· {related.kind}</span>}
              </>
            )}
            <span className="sm:hidden">
              <span className="text-subtle">· </span>
              <DueLabel task={task} />
            </span>
          </div>
        </div>
        <div className={cn("flex shrink-0 items-center gap-4", done && "opacity-50")}>
          <span className="hidden w-[118px] sm:block">
            <DueLabel task={task} />
          </span>
          <span className="hidden w-[64px] md:block">
            <StatusBadge tone={priority.tone} size="sm">
              {priority.label}
            </StatusBadge>
          </span>
          <span className="hidden w-[92px] items-center gap-1.5 text-[12px] text-muted-foreground lg:flex">
            <UserAvatar name={assignee.name} size="xs" />
            <span className="truncate">{assignee.firstName}</span>
          </span>
          <span
            className={cn(
              "size-1.5 rounded-full md:hidden",
              task.priority === "alta" ? "bg-danger" : task.priority === "media" ? "bg-warning" : "bg-subtle",
            )}
            aria-label={`Prioridade ${priority.label}`}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Ações para ${task.title}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="-my-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
          >
            <Ellipsis className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuGroup>
              <DropdownMenuItem className="h-8 px-2" onClick={onToggle}>
                {done ? <RotateCcw /> : <CircleCheck />}
                {done ? "Reabrir" : "Marcar concluída"}
              </DropdownMenuItem>
              <DropdownMenuItem className="h-8 px-2" onClick={onEdit}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem className="h-8 px-2" onClick={onOpen}>
                <Eye /> Abrir detalhes
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.li>
  )
}
