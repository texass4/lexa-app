"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ListChecks, Plus } from "lucide-react"
import { cn } from "cn"
import { Panel } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useToggleTask } from "@/components/tarefas/task-row"
import { useOfficeData } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import { Can, useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { describeRelated, taskBucket, type TaskBucket } from "@/lib/store/selectors"
import { fmtNumericDate, getNow } from "@/lib/core/dates"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { inTaskTab, type TaskTab } from "@/lib/dashboard/dashboard"
import { ChipTabs } from "./chip-tabs"
import type { Task } from "@/types"
import { PanelLink } from "./panel-link"

const TABS: { value: TaskTab; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "hoje", label: "Hoje" },
  { value: "amanha", label: "Amanhã" },
  { value: "semana", label: "Semana" },
]
const VISIBLE = 5

/** Prazo à direita, como texto colorido (vencida e hoje em vermelho). */
function dueLabel(bucket: TaskBucket, dueAt: string) {
  if (bucket === "atrasadas") return { label: fmtNumericShort(dueAt), cls: "text-danger", title: "Atrasada" }
  if (bucket === "hoje") return { label: "Hoje", cls: "text-danger" }
  if (bucket === "amanha") return { label: "Amanhã", cls: "text-warning" }
  return { label: fmtNumericShort(dueAt), cls: "text-muted-foreground" }
}

const fmtNumericShort = (iso: string) => fmtNumericDate(iso).slice(0, 5)

const PRIORITY_STYLE: Record<Task["priority"], string> = {
  alta: "bg-danger-soft text-danger",
  media: "bg-warning-soft text-warning",
  baixa: "bg-success-soft text-success",
}

/** `mineOnly`: só as da pessoa — o avatar do responsável fica de fora (é sempre ela). */
function OpenTaskRow({ task, mineOnly }: { task: Task; mineOnly: boolean }) {
  const data = useOfficeData()
  const toggle = useToggleTask()
  const editable = useSession().can("tasks.edit")
  const related = describeRelated(data, task.related)
  const done = task.status === "concluida"
  const assignee = getUser(task.assigneeId)
  const due = dueLabel(taskBucket({ ...task, status: "pendente" }), task.dueAt)
  return (
    <motion.li
      layout="position"
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex items-start gap-3 border-b border-border/70 px-2 py-3 transition-colors last:border-0 hover:bg-accent/50"
    >
      <AnimatedCheckbox
        checked={done}
        onChange={() => toggle(task)}
        disabled={!editable}
        label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13.5px] leading-snug font-medium max-sm:line-clamp-2 sm:truncate",
            done ? "text-subtle line-through" : "text-foreground",
          )}
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
      <span className="flex shrink-0 items-center gap-3 pt-0.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_STYLE[task.priority], done && "opacity-40")}>
          {PRIORITY_CONFIG[task.priority].label}
        </span>
        <span
          className={cn("tabular w-12 text-right text-[12px] font-medium", due.cls, done && "opacity-40")}
          title={due.title ?? `Prazo: ${fmtNumericDate(task.dueAt)}`}
        >
          {due.label}
        </span>
        {!mineOnly && (
          <span title={assignee.name} className="max-sm:hidden">
            <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="xs" />
          </span>
        )}
      </span>
    </motion.li>
  )
}

/** Tarefas pendentes do escritório (ou só as suas), por prazo. */
export function OpenTasks() {
  const { tasks } = useOfficeData()
  const { user } = useSession()
  const { openDialog } = useUI()
  const [tab, setTab] = React.useState<TaskTab>("todas")
  // Começa nas tarefas da pessoa (como o indicador e o selo da barra lateral); "Só minhas" desligado mostra o escritório.
  const [mine, setMine] = React.useState(true)
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
      <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-foreground">
          <span className="flex size-8 items-center justify-center rounded-[8px] bg-brand text-brand-foreground">
            <ListChecks className="size-[17px]" />
          </span>
          Tarefas
        </h2>
        <div className="flex items-center gap-1">
          <Can permission="tasks.edit">
            <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" title="Nova tarefa" onClick={() => openDialog("task")}>
              <Plus />
            </Button>
          </Can>
          <PanelLink href="/tarefas">Ver todas</PanelLink>
        </div>
      </header>
      <div className="px-4 pt-4 pb-1">
        <ChipTabs
          ariaLabel="Filtrar tarefas"
          variant="segmented"
          value={tab}
          onChange={setTab}
          // Contagem só nas atrasadas (o que pede ação); as demais ficam no título da aba.
          tabs={TABS.map((t) => {
            const count = pendingCount(byTab[t.value])
            return {
              ...t,
              title: `${t.value === "semana" ? "Esta semana" : t.label}: ${count} pendente${count === 1 ? "" : "s"}`,
              count: t.value === "atrasadas" && count ? count : undefined,
              alert: t.value === "atrasadas",
            }
          })}
        />
      </div>
      {shown.length ? (
        <ul className="px-3 pb-2 sm:px-4">
          {shown.map((t) => (
            <OpenTaskRow key={t.id} task={t} mineOnly={mine} />
          ))}
        </ul>
      ) : (
        <p className="px-5 pt-2 pb-6 text-[13px] text-muted-foreground sm:px-6">
          {["Nenhuma tarefa em aberto", tab !== "todas" && "nesta aba", mine && "para você"].filter(Boolean).join(" ")}.
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/80 px-5 py-2.5 text-[12px] text-muted-foreground sm:px-6">
        {byTab[tab].length > VISIBLE ? (
          <p>
            Mais {byTab[tab].length - VISIBLE} em{" "}
            <Link href="/tarefas" className="font-medium text-foreground hover:underline">
              Tarefas
            </Link>
          </p>
        ) : (
          <span />
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium whitespace-nowrap">
          <input type="checkbox" checked={mine} onChange={() => setMine((v) => !v)} className="size-3.5 cursor-pointer accent-[var(--brand)]" />
          Só minhas
        </label>
      </div>
    </Panel>
  )
}
