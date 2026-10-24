"use client"

import { Plus } from "lucide-react"
import { useShell } from "@/components/shell/shell-context"
import { cn } from "@/lib/cn"
import { formatLocalDate, monthGrid, weekdayName, type LocalDate } from "@/lib/domain/dates"
import type { TaskItem } from "@/lib/services/tasks"
import { DayDrop, ScheduleDnd, TaskChip, useTasksOn } from "./schedule"

/** Calendário do mês pelos prazos. Arraste para reagendar; clique no "+" do dia para criar. */
export function MonthCalendar({ tasks, today, month, weekStartsOn }: { tasks: TaskItem[]; today: LocalDate; month: LocalDate; weekStartsOn: number }) {
  const weeks = monthGrid(month, weekStartsOn)
  const currentMonth = month.slice(0, 7)
  return (
    <ScheduleDnd tasks={tasks} today={today}>
      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-line">
            {weeks[0]!.map((d) => (
              <div key={d} className="eyebrow px-2 py-2">
                {weekdayName(d, "short").replace(".", "")}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-line-soft last:border-b-0">
              {week.map((date) => (
                <Day key={date} date={date} today={today} outside={date.slice(0, 7) !== currentMonth} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </ScheduleDnd>
  )
}

function Day({ date, today, outside }: { date: LocalDate; today: LocalDate; outside: boolean }) {
  const tasks = useTasksOn(date)
  const { openQuickTask } = useShell()
  const isToday = date === today
  return (
    <DayDrop date={date} label={formatLocalDate(date, { day: "numeric", month: "long" })} className={cn("group min-h-28 border-r border-line-soft p-1.5 last:border-r-0", outside && "bg-paper/50")}>
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("meta inline-flex size-6 items-center justify-center rounded-full", isToday ? "bg-cobalt text-white" : outside ? "text-ink-5" : "text-ink-3")}>{Number(date.slice(8))}</span>
        <button
          onClick={() => openQuickTask({ dueDate: date })}
          className="rounded-xs p-0.5 text-ink-4 opacity-0 group-hover:opacity-100 hover:bg-paper hover:text-ink focus-visible:opacity-100"
          aria-label={`Nova tarefa em ${formatLocalDate(date, { day: "numeric", month: "long" })}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {tasks.map((t) => (
          <TaskChip key={t.id} task={t} />
        ))}
      </div>
    </DayDrop>
  )
}
