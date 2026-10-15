"use client"

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Check, Flag, ListChecks, X } from "lucide-react"
import { cn } from "cn"
import { UserAvatar } from "@/components/ui/user-avatar"
import { DueChip, PRIORITY_STYLE } from "@/components/tarefas/task-card"
import { useToggleTask } from "@/components/tarefas/task-row"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getUser } from "@/lib/auth/account"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { columnOfTask } from "@/lib/tarefas/workspace"
import { usePageEditor } from "./editor-context"
import { useRemoteTask } from "./remote-task"

/**
 * Tarefa real dentro da página. Tudo o que aparece vem do registro em `tasks` (quadro,
 * lista e página mostram a mesma tarefa); remover o bloco não exclui a tarefa.
 */
export function TaskRefView({ node, deleteNode, editor, selected }: NodeViewProps) {
  const ctx = usePageEditor()
  const data = useOfficeData()
  const toggle = useToggleTask()
  const taskId = (node.attrs.taskId as string | null) ?? ""
  const local = byId(data.tasks, taskId)
  const remote = useRemoteTask(local ? null : taskId)
  const task = local ?? (remote?.status === "found" ? remote.task : undefined)
  const editable = editor.isEditable

  if (!task) {
    const loading = remote?.status === "loading"
    return (
      <NodeViewWrapper className="my-2" data-task-ref="">
        <div
          contentEditable={false}
          className={cn(
            "flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground",
            selected && "ring-2 ring-brand/30",
          )}
        >
          <ListChecks className="size-4 shrink-0 text-subtle" aria-hidden />
          {loading ? (
            <span className="h-3 w-40 animate-pulse rounded bg-surface-muted" aria-label="Carregando tarefa" />
          ) : (
            <span>Tarefa indisponível — excluída ou sem acesso.</span>
          )}
          {editable && !loading && (
            <button
              type="button"
              onClick={deleteNode}
              className="ml-auto rounded-md px-2 py-0.5 text-[12px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Remover da página
            </button>
          )}
        </div>
      </NodeViewWrapper>
    )
  }

  const done = task.status === "concluida"
  const column = local ? columnOfTask(task, data.taskColumns) : undefined
  const assignee = getUser(task.assigneeId)

  return (
    <NodeViewWrapper className="my-2" data-task-ref="">
      <div
        contentEditable={false}
        className={cn(
          "group/task flex min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-card px-3 py-2 shadow-xs transition-colors duration-150 hover:border-border-strong",
          selected && "ring-2 ring-brand/30",
        )}
      >
        <button
          type="button"
          disabled={!ctx.canEditTasks || !local}
          onClick={() => void toggle(task)}
          aria-label={done ? `Reabrir a tarefa: ${task.title}` : `Concluir a tarefa: ${task.title}`}
          className={cn(
            "touch-target relative flex size-[18px] shrink-0 items-center justify-center rounded-full border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-default",
            done ? "border-success bg-success text-white" : "border-border-strong hover:border-success hover:bg-success-soft",
          )}
        >
          {done && <Check className="size-3" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => ctx.openTask(task.id)}
            className={cn(
              "block max-w-full truncate text-left text-[14px] font-medium outline-none hover:underline focus-visible:underline",
              done ? "text-subtle line-through decoration-subtle/60" : "text-foreground",
            )}
            title="Abrir os detalhes da tarefa"
          >
            {task.title}
          </button>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Tarefa</span>
            {column && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: column.color }} aria-hidden />
                {column.name}
              </span>
            )}
            {!column && <span>{done ? "Concluída" : "Pendente"}</span>}
            <DueChip task={task} />
            <span className={cn("inline-flex items-center gap-1", PRIORITY_STYLE[task.priority])}>
              <Flag className="size-3" aria-hidden />
              <span className="sr-only">Prioridade </span>
              <span className="max-sm:sr-only">{PRIORITY_CONFIG[task.priority].label}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="xs" />
              <span className="truncate max-sm:sr-only">{assignee.firstName}</span>
            </span>
          </div>
        </div>
        {editable && (
          <button
            type="button"
            onClick={deleteNode}
            aria-label={`Remover "${task.title}" da página (a tarefa continua no quadro)`}
            title="Remover da página — a tarefa continua no quadro"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-subtle opacity-0 outline-none transition-opacity duration-150 group-hover/task:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/40 pointer-coarse:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  )
}
