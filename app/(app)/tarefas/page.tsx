import { Suspense } from "react"
import type { Metadata } from "next"
import { TasksView } from "@/components/tarefas/tasks-view"

export const metadata: Metadata = { title: "Tarefas" }

export default function TarefasPage() {
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  )
}
