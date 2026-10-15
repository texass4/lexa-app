"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useUI } from "@/lib/store/ui-store"
import { getNow, monthName, weekdayName } from "@/lib/core/dates"
import { dayKey, dueGroup, monthWeeks, tasksByDay, type TaskFilters } from "@/lib/tarefas/workspace"
import type { Task } from "@/types"
import { PRIORITY_STYLE } from "./task-card"
import { useTaskActions } from "./task-actions"

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
const MAX_PER_DAY = 3

function Chip({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const done = task.status === "concluida"
  const late = !done && dueGroup(task, getNow()) === "atrasadas"
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      title={`${task.title}${late ? " — atrasada" : done ? " — concluída" : ""}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 py-[3px] text-left text-[11.5px] leading-tight outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
        done
          ? "text-subtle line-through decoration-subtle/60 hover:bg-accent"
          : late
            ? "bg-danger-soft text-danger hover:bg-danger-soft/80"
            : "bg-surface-muted text-foreground hover:bg-accent",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full bg-current", !done && !late && PRIORITY_STYLE[task.priority])} aria-hidden />
      <span className="truncate">{task.title}</span>
    </button>
  )
}

/**
 * Calendário de prazos: cada tarefa no dia do seu prazo (o horário guardado aparece só
 * nos detalhes; nada é inventado). Não mistura com compromissos da Agenda.
 */
export function CalendarView({ tasks, filters, onOpen }: { tasks: Task[]; filters: TaskFilters; onOpen: (id: string) => void }) {
  const a = useTaskActions()
  const { openDialog } = useUI()
  const now = getNow()
  const [cursor, setCursor] = React.useState(() => ({ year: now.getFullYear(), month: now.getMonth() }))
  const weeks = monthWeeks(cursor.year, cursor.month)
  const byDay = React.useMemo(() => tasksByDay(tasks), [tasks])
  const today = dayKey(now)
  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  const create = (date: string) =>
    openDialog("task", {
      date,
      processId: filters.processId,
      clientId: filters.clientId,
      assigneeId: filters.assignees.length === 1 ? filters.assignees[0] : undefined,
    })
  const monthDays = weeks.flat().filter((d) => d.getMonth() === cursor.month)
  const inMonth = monthDays.reduce((n, d) => n + (byDay.get(dayKey(d))?.length ?? 0), 0)

  return (
    <div className="@container/cal space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-[16px] font-semibold tracking-[-0.01em] text-foreground capitalize" aria-live="polite">
          {monthName(cursor.month)} {cursor.year}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon-sm" aria-label="Mês anterior" onClick={() => shift(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>
            Hoje
          </Button>
          <Button variant="secondary" size="icon-sm" aria-label="Próximo mês" onClick={() => shift(1)}>
            <ChevronRight />
          </Button>
        </div>
        <p className="ml-auto text-[12.5px] text-muted-foreground">
          {inMonth} tarefa{inMonth === 1 ? "" : "s"} com prazo neste mês
        </p>
      </div>

      {/* Grade do mês (telas largas) */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-card @3xl/cal:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted/60 text-[11.5px] font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} className="grid grid-cols-7">
            {week.map((d) => {
              const key = dayKey(d)
              const items = byDay.get(key) ?? []
              const outside = d.getMonth() !== cursor.month
              const isToday = key === today
              return (
                <div
                  key={key}
                  className={cn(
                    "group relative min-h-[112px] border-r border-b border-border/70 p-1.5 last:border-r-0",
                    outside && "bg-surface-muted/35",
                    w === weeks.length - 1 && "border-b-0",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "tabular flex size-6 items-center justify-center rounded-full text-[12px]",
                        isToday ? "bg-brand font-semibold text-brand-foreground" : outside ? "text-subtle" : "text-foreground",
                      )}
                      aria-label={isToday ? `Hoje, ${d.getDate()}` : undefined}
                    >
                      {d.getDate()}
                    </span>
                    {a.editable && (
                      <button
                        type="button"
                        onClick={() => create(key)}
                        aria-label={`Nova tarefa com prazo em ${d.getDate()}/${d.getMonth() + 1}`}
                        className="flex size-6 items-center justify-center rounded-[6px] text-subtle opacity-0 outline-none transition-opacity duration-150 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, MAX_PER_DAY).map((t) => (
                      <Chip key={t.id} task={t} onOpen={onOpen} />
                    ))}
                    {items.length > MAX_PER_DAY && (
                      <Popover>
                        <PopoverTrigger className="w-full rounded-[6px] px-1.5 py-0.5 text-left text-[11.5px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40">
                          +{items.length - MAX_PER_DAY} mais
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 gap-1.5 p-2">
                          <p className="px-1 pb-1 text-[12px] font-semibold text-foreground">
                            {d.getDate()}/{d.getMonth() + 1} · {items.length} tarefas
                          </p>
                          {items.map((t) => (
                            <Chip key={t.id} task={t} onOpen={onOpen} />
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Agenda do mês (celular e telas estreitas): só os dias com prazo */}
      <ol className="space-y-3 @3xl/cal:hidden">
        {monthDays
          .filter((d) => byDay.has(dayKey(d)) || dayKey(d) === today)
          .map((d) => {
            const key = dayKey(d)
            const items = byDay.get(key) ?? []
            return (
              <li key={key} className="rounded-card border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className={cn("text-[13px] font-semibold capitalize", key === today ? "text-brand-strong" : "text-foreground")}>
                    {key === today ? "Hoje · " : ""}
                    {weekdayName(d.getDay())}, {d.getDate()}
                  </p>
                  {a.editable && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Nova tarefa com prazo em ${d.getDate()}/${d.getMonth() + 1}`}
                      onClick={() => create(key)}
                    >
                      <Plus />
                    </Button>
                  )}
                </div>
                {items.length ? (
                  <div className="space-y-1">
                    {items.map((t) => (
                      <Chip key={t.id} task={t} onOpen={onOpen} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-subtle">Nenhuma tarefa com prazo hoje.</p>
                )}
              </li>
            )
          })}
        {inMonth === 0 && (
          <li className="rounded-card border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nenhuma tarefa com prazo neste mês.
          </li>
        )}
      </ol>
    </div>
  )
}
