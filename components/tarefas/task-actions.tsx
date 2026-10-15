"use client"

import * as React from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { columnOfTask } from "@/lib/tarefas/workspace"
import type { NewTaskInput } from "@/lib/store/office-store"
import type { Priority, Task } from "@/types"

/**
 * Operações sobre tarefas, as mesmas no quadro, na lista, no calendário e no painel.
 * A tela muda na hora; o aviso de sucesso só aparece quando o banco confirma. Recusada
 * (sem permissão, conflito, rede), a tela volta ao que está gravado — o aviso já aparece.
 */
interface TaskActions {
  editable: boolean
  move(task: Task, columnId: string): Promise<void>
  setDone(task: Task, done: boolean): Promise<void>
  update(task: Task, patch: Partial<Task>, message?: string): Promise<boolean>
  remove(tasks: Task[], after?: () => void): void
  bulkColumn(tasks: Task[], columnId: string): Promise<void>
  bulkAssignee(tasks: Task[], assigneeId: string): Promise<void>
  bulkPriority(tasks: Task[], priority: Priority): Promise<void>
  bulkDone(tasks: Task[]): Promise<void>
  quickCreate(input: NewTaskInput): Promise<Task | null>
}

const Ctx = React.createContext<TaskActions | null>(null)

export function useTaskActions() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useTaskActions fora de TaskActionsProvider")
  return ctx
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function TaskActionsProvider({ children }: { children: React.ReactNode }) {
  const data = useOfficeData()
  const { moveTask, toggleTask, updateTask, deleteTask, confirmSaved, versionOf, saveNewTask } = useOfficeActions()
  const editable = useSession().can("tasks.edit")
  const [deleting, setDeleting] = React.useState<{ tasks: Task[]; after?: () => void }>()
  const columns = data.taskColumns

  const actions: TaskActions = {
    editable,
    async move(task, columnId) {
      const from = columnOfTask(task, columns)
      if (!editable || from?.id === columnId) return
      const updated = moveTask(task.id, columnId)
      if (!updated) return
      const ok = await confirmSaved("tasks", task.id)
      if (!ok) return
      const to = columns.find((c) => c.id === columnId)
      if (updated.status === "concluida" && task.status !== "concluida") {
        toast.success("Tarefa concluída.", {
          description: task.title,
          action: from ? { label: "Desfazer", onClick: () => void actions.move(updated, from.id) } : undefined,
        })
      } else toast.success(`Movida para ${to?.name}.`, { description: task.title })
    },
    async setDone(task, done) {
      if (!editable || (task.status === "concluida") === done) return
      const updated = toggleTask(task.id)
      if (!updated || !(await confirmSaved("tasks", task.id))) return
      if (done)
        toast.success("Tarefa concluída.", {
          description: task.title,
          action: { label: "Desfazer", onClick: () => void actions.setDone(updated, false) },
        })
      else toast("Tarefa reaberta.", { description: task.title })
    },
    async update(task, patch, message) {
      if (!editable) return false
      // Grava sobre a versão que está na tela: se outra pessoa mudou antes, é recusado e a tela atualiza.
      const result = await updateTask(task.id, patch, { baseVersion: versionOf("tasks", task.id) })
      if (result.status !== "saved") return false
      if (message) toast.success(message, { description: task.title })
      return true
    },
    remove(tasks, after) {
      if (editable && tasks.length) setDeleting({ tasks, after })
    },
    async bulkColumn(tasks, columnId) {
      const column = columns.find((c) => c.id === columnId)
      const moving = tasks.filter((t) => columnOfTask(t, columns)?.id !== columnId)
      for (const t of moving) moveTask(t.id, columnId)
      const results = await Promise.all(moving.map((t) => confirmSaved("tasks", t.id)))
      const ok = results.filter(Boolean).length
      if (ok) toast.success(`${plural(ok, "tarefa movida", "tarefas movidas")} para ${column?.name}.`)
    },
    async bulkAssignee(tasks, assigneeId) {
      const changing = tasks.filter((t) => t.assigneeId !== assigneeId)
      const results = await Promise.all(changing.map((t) => updateTask(t.id, { assigneeId }, { baseVersion: versionOf("tasks", t.id) })))
      const ok = results.filter((r) => r.status === "saved").length
      if (ok) toast.success(`${plural(ok, "tarefa passada", "tarefas passadas")} para ${getUser(assigneeId).name}.`)
    },
    async bulkPriority(tasks, priority) {
      const changing = tasks.filter((t) => t.priority !== priority)
      const results = await Promise.all(changing.map((t) => updateTask(t.id, { priority }, { baseVersion: versionOf("tasks", t.id) })))
      const ok = results.filter((r) => r.status === "saved").length
      if (ok) toast.success(`Prioridade ${PRIORITY_CONFIG[priority].label.toLowerCase()} em ${plural(ok, "tarefa", "tarefas")}.`)
    },
    async bulkDone(tasks) {
      const open = tasks.filter((t) => t.status !== "concluida")
      for (const t of open) toggleTask(t.id)
      const results = await Promise.all(open.map((t) => confirmSaved("tasks", t.id)))
      const ok = results.filter(Boolean).length
      if (ok) toast.success(`${plural(ok, "tarefa concluída", "tarefas concluídas")}.`)
    },
    quickCreate: (input) => saveNewTask(input),
  }

  const count = deleting?.tasks.length ?? 0
  return (
    <Ctx.Provider value={actions}>
      {children}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={count === 1 ? `Excluir "${deleting?.tasks[0].title}"?` : `Excluir ${count} tarefas?`}
        description={
          count === 1
            ? "A tarefa sai do quadro, da lista e do perfil do cliente e do processo. Não dá para desfazer."
            : "As tarefas saem do quadro, da lista e dos perfis de cliente e processo. Não dá para desfazer."
        }
        confirmLabel={count === 1 ? "Excluir tarefa" : `Excluir ${count}`}
        onConfirm={async () => {
          if (!deleting) return
          const { tasks, after } = deleting
          for (const t of tasks) deleteTask(t.id)
          after?.()
          const results = await Promise.all(tasks.map((t) => confirmSaved("tasks", t.id)))
          const ok = results.filter(Boolean).length
          if (ok) toast.success(ok === 1 ? "Tarefa excluída." : `${ok} tarefas excluídas.`, { description: ok === 1 ? tasks[0].title : undefined })
        }}
      />
    </Ctx.Provider>
  )
}
