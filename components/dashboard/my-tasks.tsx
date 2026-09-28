"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Plus } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { TaskRow } from "@/components/tasks/task-row"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { currentUserId } from "@/lib/account"
import { diffInDays, getNow, parse } from "@/lib/dates"
import { Can } from "@/lib/auth/session"

export function MyTasks() {
  const { tasks } = useDemoData()
  const { openDialog } = useUI()

  // Mantém a ordem estável ao concluir para que o item não "salte" da mão do usuário.
  const [ids] = React.useState(() =>
    tasks
      .filter((t) => t.assigneeId === currentUserId() && t.status === "pendente" && diffInDays(parse(t.dueAt), getNow()) <= 0)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .map((t) => t.id),
  )
  const newOnes = tasks
    .filter((t) => t.assigneeId === currentUserId() && !ids.includes(t.id) && t.status === "pendente" && diffInDays(parse(t.dueAt), getNow()) <= 0)
    .map((t) => t.id)
  const list = [...newOnes, ...ids].map((id) => tasks.find((t) => t.id === id)!).filter(Boolean)
  const remaining = list.filter((t) => t.status === "pendente").length

  return (
    <Panel>
      <PanelHeader
        title="Minhas tarefas"
        description={
          remaining ? `${remaining} para hoje ou atrasada${remaining > 1 ? "s" : ""}` : list.length ? "Tudo concluído por hoje" : "Sem prazos hoje"
        }
        action={
          <>
            <Can permission="tasks.edit">
              <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" onClick={() => openDialog("task")}>
                <Plus />
              </Button>
            </Can>
            <Link
              href="/tarefas"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              Ver todas <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />
      {list.length ? (
        <ul className="px-3 pb-3">
          {list.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground">Nenhuma tarefa sua vence hoje. As próximas aparecem aqui no dia do prazo.</p>
      )}
    </Panel>
  )
}
