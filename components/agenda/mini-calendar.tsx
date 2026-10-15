"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"
import { useOfficeData } from "@/lib/store/office-store"
import { useAppointmentsRange } from "@/lib/store/on-demand"
import { addDays, addMonths, getNow, isSameDay, monthName, parse, startOfWeek } from "@/lib/core/dates"
import type { Appointment } from "@/types"

const WEEK = ["S", "T", "Q", "Q", "S", "S", "D"]
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/**
 * Minicalendário da barra lateral da Agenda: navega pelos meses por conta própria e,
 * ao clicar num dia, leva a agenda até ele. O ponto marca os dias com compromisso
 * (os do mês exibido são carregados sob demanda, como na grade).
 */
export function MiniCalendar({
  selected,
  rangeStart,
  rangeEnd,
  onPick,
  visible,
}: {
  selected: Date
  /** Período exibido na grade (destacado no minicalendário). */
  rangeStart: Date
  rangeEnd: Date
  onPick: (day: Date) => void
  /** Filtro da grade (categorias e "minha agenda") — os pontos seguem o mesmo filtro. */
  visible: (a: Appointment) => boolean
}) {
  const data = useOfficeData()
  const [month, setMonth] = React.useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  // A grade foi para outro mês (setas, "Hoje"): o minicalendário acompanha.
  const [lastSelected, setLastSelected] = React.useState(selected)
  if (!isSameDay(selected, lastSelected)) {
    setLastSelected(selected)
    if (selected.getMonth() !== month.getMonth() || selected.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
    }
  }
  const first = startOfWeek(month)
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const ready = useAppointmentsRange(ymd(days[0]), ymd(addDays(days[41], 1)))
  const busy = React.useMemo(() => {
    const set = new Set<string>()
    if (!ready) return set
    for (const a of data.appointments) if (visible(a)) set.add(ymd(parse(a.start)))
    return set
  }, [data.appointments, ready, visible])
  const today = getNow()

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between pl-1.5">
        <p className="text-[13px] font-semibold text-foreground" aria-live="polite">
          {monthName(month.getMonth()).charAt(0).toUpperCase() + monthName(month.getMonth()).slice(1)} {month.getFullYear()}
        </p>
        <div className="flex">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div role="grid" aria-label="Minicalendário" className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEK.map((d, i) => (
          <span key={i} role="columnheader" className="pb-1 text-[10.5px] font-medium text-subtle">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const out = d.getMonth() !== month.getMonth()
          const isToday = isSameDay(d, today)
          const isSelected = isSameDay(d, selected)
          const inRange = d >= rangeStart && d < rangeEnd
          const dot = busy.has(ymd(d))
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${d.getDate()} de ${monthName(d.getMonth())}${dot ? ", com compromissos" : ""}`}
              onClick={() => onPick(d)}
              className={cn(
                "relative mx-auto flex size-8 flex-col items-center justify-center rounded-full text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                isToday
                  ? "bg-danger font-semibold text-white"
                  : isSelected
                    ? "bg-brand-soft font-semibold text-brand-strong"
                    : inRange
                      ? "bg-accent text-foreground"
                      : "hover:bg-accent",
                !isToday && !isSelected && (out ? "text-subtle/70" : "text-foreground"),
              )}
            >
              {d.getDate()}
              {dot && <span aria-hidden className={cn("absolute bottom-1 size-1 rounded-full", isToday ? "bg-white" : "bg-brand")} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
