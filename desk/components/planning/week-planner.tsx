"use client"

import { BookOpen, FolderKanban, Plus } from "lucide-react"
import Link from "next/link"
import { DayDrop, NO_DATE, ScheduleDnd, TaskChip, useTasksOn } from "@/components/tasks/schedule"
import { useShell } from "@/components/shell/shell-context"
import { cn } from "@/lib/cn"
import { formatLocalDate, weekdayName, type LocalDate } from "@/lib/domain/dates"
import { formatEstimate } from "@/lib/domain/tasks"
import type { TaskItem } from "@/lib/services/tasks"

type Milestone = { id: string; title: string; date: LocalDate }

/** Semana em colunas. Arraste tarefas entre dias (ou da lista "Sem data") para planejar. */
export function WeekPlanner({ days, tasks, today, milestones, journalDays }: { days: LocalDate[]; tasks: TaskItem[]; today: LocalDate; milestones: Milestone[]; journalDays: LocalDate[] }) {
  return (
    <ScheduleDnd tasks={tasks} today={today}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[840px] grid-cols-7 gap-2">
            {days.map((d) => (
              <DayColumn key={d} date={d} today={today} milestones={milestones.filter((m) => m.date === d)} hasJournal={journalDays.includes(d)} />
            ))}
          </div>
        </div>
        <Backlog />
      </div>
    </ScheduleDnd>
  )
}

function DayColumn({ date, today, milestones, hasJournal }: { date: LocalDate; today: LocalDate; milestones: Milestone[]; hasJournal: boolean }) {
  const tasks = useTasksOn(date)
  const { openQuickTask } = useShell()
  const isToday = date === today
  const past = date < today
  const minutes = tasks.filter((t) => t.status !== "done").reduce((s, t) => s + (t.estimateMinutes ?? 0), 0)
  return (
    <DayDrop date={date} label={formatLocalDate(date, { weekday: "long", day: "numeric", month: "long" })} className={cn("flex min-h-72 flex-col rounded-md border bg-white", isToday ? "border-cobalt" : "border-line", past && "bg-paper/60")}>
      <header className={cn("flex items-start justify-between border-b px-2.5 pt-2 pb-1.5", isToday ? "border-cobalt/30" : "border-line-soft")}>
        <div>
          <p className={cn("eyebrow", isToday && "text-cobalt-ink")}>{weekdayName(date, "short").replace(".", "")}</p>
          <p className={cn("font-serif text-2xl leading-none", past ? "text-ink-4" : "text-ink")}>{Number(date.slice(8))}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <Link href={`/journal/${date}`} className={cn("rounded-xs p-1 hover:bg-paper", hasJournal ? "text-cobalt" : "text-ink-5 hover:text-ink")} aria-label={`Diário de ${formatLocalDate(date, { day: "numeric", month: "long" })}`} title={hasJournal ? "Abrir diário do dia" : "Escrever no diário do dia"}>
            <BookOpen className="size-3.5" />
          </Link>
          <button onClick={() => openQuickTask({ dueDate: date })} className="rounded-xs p-1 text-ink-4 hover:bg-paper hover:text-ink" aria-label={`Nova tarefa em ${formatLocalDate(date, { day: "numeric", month: "long" })}`}>
            <Plus className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        {milestones.map((m) => (
          <Link key={m.id} href={`/projects/${m.id}`} className="flex items-center gap-1.5 rounded-xs bg-ink px-1.5 py-1 text-xs text-paper">
            <FolderKanban className="size-3 shrink-0" />
            <span className="truncate">Meta: {m.title}</span>
          </Link>
        ))}
        {tasks.map((t) => (
          <TaskChip key={t.id} task={t} />
        ))}
      </div>
      {minutes ? <p className="meta border-t border-line-soft px-2.5 py-1">≈ {formatEstimate(minutes)}</p> : null}
    </DayDrop>
  )
}

function Backlog() {
  const tasks = useTasksOn(NO_DATE)
  return (
    <DayDrop date={NO_DATE} label="Sem data" className="flex h-fit flex-col rounded-md border border-dashed border-line-strong bg-paper-2/40">
      <header className="border-b border-line-soft px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-ink uppercase">Sem data</p>
        <p className="mt-0.5 text-xs text-ink-4">Arraste para um dia para dar prazo; solte aqui para tirar o prazo.</p>
      </header>
      <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-2">
        {tasks.map((t) => (
          <TaskChip key={t.id} task={t} />
        ))}
        {tasks.length === 0 ? <p className="px-1 py-4 text-center text-xs text-ink-4">Todas as tarefas abertas têm prazo.</p> : null}
      </div>
    </DayDrop>
  )
}
