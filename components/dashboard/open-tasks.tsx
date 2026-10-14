"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronRight, ListChecks, Plus } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useToggleTask } from "@/components/tarefas/task-row"
import { useOfficeData } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import { Can, useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { describeRelated, taskBucket, type TaskBucket } from "@/lib/store/selectors"
import { fmtDayMonth, getNow } from "@/lib/core/dates"
import { inTaskTab, type TaskTab } from "@/lib/dashboard/dashboard"
import { ChipTabs } from "./chip-tabs"
import type { Task } from "@/types"
import { PanelLink } from "./panel-link"

const TABS: { value: TaskTab; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "hoje", label: "Hoje" },
  { value: "amanha", label: "Amanhã" },
  { value: "semana", label: "Esta semana" },
]
const VISIBLE = 5

function dueBadge(bucket: TaskBucket, dueAt: string) {
  if (bucket === "atrasadas") return { label: "Atrasada", cls: "bg-danger-soft text-danger" }
  if (bucket === "hoje") return { label: "Hoje", cls: "bg-danger-soft text-danger" }
  if (bucket === "amanha") return { label: "Amanhã", cls: "bg-warning-soft text-warning" }
  return { label: fmtDayMonth(dueAt), cls: "bg-surface-muted text-muted-foreground" }
}

function OpenTaskRow({ task }: { task: Task }) {
  const data = useOfficeData()
  const toggle = useToggleTask()
  const editable = useSession().can("tasks.edit")
  const related = describeRelated(data, task.related)
  const done = task.status === "concluida"
  const assignee = getUser(task.assigneeId)
  const badge = dueBadge(taskBucket({ ...task, status: "pendente" }), task.dueAt)
  return (
    <motion.li
      layout="position"
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors hover:bg-accent/70"
    >
      <AnimatedCheckbox
        checked={done}
        onChange={() => toggle(task)}
        disabled={!editable}
        label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn("block text-[13.5px] font-medium max-sm:line-clamp-2 sm:truncate", done ? "text-subtle line-through" : "text-foreground")}
        >
          {task.title}
        </span>
        {related && (
          <Link
            href={related.href}
            className="touch-target relative block truncate text-[12px] text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
          >
            {related.label}
          </Link>
        )}
      </span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", badge.cls, done && "opacity-40")}>{badge.label}</span>
      <span title={assignee.name} className="max-sm:hidden">
        <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="sm" />
      </span>
      <Link
        href={related?.href ?? "/tarefas"}
        aria-label={`Abrir ${task.title}`}
        className="touch-target relative shrink-0 rounded-md text-subtle outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ChevronRight className="size-4" />
      </Link>
    </motion.li>
  )
}

/** Tarefas pendentes do escritório (ou só as suas), por prazo. */
export function OpenTasks() {
  const { tasks } = useOfficeData()
  const { user } = useSession()
  const { openDialog } = useUI()
  const [tab, setTab] = React.useState<TaskTab>("todas")
  const [mine, setMine] = React.useState(false)
  // Lista estável: ao concluir, a tarefa fica riscada até sair da tela (não "salta" da mão).
  const [ids] = React.useState(() => tasks.filter((t) => t.status === "pendente").map((t) => t.id))
  const now = getNow()
  const fresh = tasks.filter((t) => t.status === "pendente" && !ids.includes(t.id)).map((t) => t.id)
  const list = [...fresh, ...ids]
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t && (!mine || t.assigneeId === user.id))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const byTab = Object.fromEntries(TABS.map(({ value }) => [value, list.filter((t) => inTaskTab(t, value, now))])) as Record<TaskTab, Task[]>
  const shown = byTab[tab].slice(0, VISIBLE)
  const pendingCount = (items: Task[]) => items.filter((t) => t.status === "pendente").length

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Tarefas"
        icon={<ListChecks />}
        action={
          <>
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => setMine((v) => !v)}
              className={cn(
                "touch-target relative h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                mine ? "border-brand/30 bg-brand-soft text-brand-strong" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              Só minhas
            </button>
            <Can permission="tasks.edit">
              <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" onClick={() => openDialog("task")}>
                <Plus />
              </Button>
            </Can>
            <PanelLink href="/tarefas">Ver todas</PanelLink>
          </>
        }
      />
      <div className="px-5 pb-2 sm:px-6">
        <ChipTabs
          ariaLabel="Filtrar tarefas"
          className="min-w-0"
          value={tab}
          onChange={setTab}
          tabs={TABS.map((t) => ({ ...t, count: pendingCount(byTab[t.value]) }))}
        />
      </div>
      {shown.length ? (
        <ul className="px-2 pb-3 sm:px-3">
          {shown.map((t) => (
            <OpenTaskRow key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        <p className="px-5 pt-2 pb-6 text-[13px] text-muted-foreground sm:px-6">
          {["Nenhuma tarefa em aberto", tab !== "todas" && "nesta aba", mine && "para você"].filter(Boolean).join(" ")}.
        </p>
      )}
      {byTab[tab].length > VISIBLE && (
        <p className="border-t border-border/80 px-5 py-2.5 text-[12px] text-muted-foreground sm:px-6">
          Mais {byTab[tab].length - VISIBLE} em{" "}
          <Link href="/tarefas" className="font-medium text-foreground hover:underline">
            Tarefas
          </Link>
        </p>
      )}
    </Panel>
  )
}
