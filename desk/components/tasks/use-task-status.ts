"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"
import { setTaskStatusAction } from "@/app/actions/tasks"
import { formatLocalDate } from "@/lib/domain/dates"
import type { TaskStatus } from "@/lib/domain/tasks"

/**
 * Concluir/reabrir com resposta imediata na tela. O servidor confirma e todas as
 * visualizações recebem o dado novo; se falhar, o estado volta e a pessoa é avisada.
 */
export function useTaskStatus(task: { id: string; status: TaskStatus }) {
  const [status, setOptimistic] = useOptimistic(task.status)
  const [pending, start] = useTransition()
  const change = (next: TaskStatus) =>
    start(async () => {
      setOptimistic(next)
      const result = await setTaskStatusAction(task.id, next)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.data.spawned?.dueDate) toast.success(`Próxima ocorrência criada para ${formatLocalDate(result.data.spawned.dueDate, { day: "numeric", month: "short" })}.`)
    })
  const toggle = () => change(status === "done" ? "todo" : "done")
  return { status, pending, toggle, change }
}
