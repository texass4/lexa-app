"use client"

import { cn } from "cn"
import { useCategoryLookup } from "./use-category"
import { addDays, getNow, fmtTime, isSameDay, parse, startOfWeek } from "@/lib/dates"
import type { Appointment } from "@/types"

const WEEK_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]

export function MonthGrid({
  anchor,
  events,
  onSelect,
  onDayClick,
}: {
  anchor: Date
  events: Appointment[]
  onSelect: (a: Appointment) => void
  onDayClick: (d: Date) => void
}) {
  const lookup = useCategoryLookup()
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const weeks = days[35].getMonth() !== anchor.getMonth() ? 5 : 6

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
      <div className="grid grid-cols-7 border-b border-border bg-surface-muted/30">
        {WEEK_LABELS.map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:px-3 sm:text-left"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.slice(0, weeks * 7).map((d, i) => {
          const inMonth = d.getMonth() === anchor.getMonth()
          const today = isSameDay(d, getNow())
          const dayEvents = events.filter((e) => isSameDay(parse(e.start), d)).sort((a, b) => a.start.localeCompare(b.start))
          const weekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "group relative min-h-[64px] border-border p-1 sm:min-h-[112px] sm:p-1.5",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !inMonth && "bg-surface-muted/40",
                weekend && inMonth && "bg-surface-muted/20",
              )}
            >
              <button
                type="button"
                onClick={() => onDayClick(d)}
                aria-label={`Ver dia ${d.getDate()}`}
                className={cn(
                  "tabular mb-1 flex size-7 items-center justify-center rounded-full text-[12.5px] font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-gold/40 max-sm:mx-auto",
                  today ? "bg-foreground text-background hover:bg-foreground" : inMonth ? "text-foreground" : "text-subtle",
                )}
              >
                {d.getDate()}
              </button>
              {/* Desktop: chips */}
              <div className="hidden space-y-0.5 sm:block">
                {dayEvents.slice(0, 3).map((a) => {
                  const { style } = lookup(a.categoryId)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onSelect(a)}
                      className={cn(
                        "flex w-full items-center gap-1.5 truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-gold/40",
                        parse(a.end) < getNow() && "opacity-60",
                      )}
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={style.dot} />
                      <span className="tabular shrink-0 text-muted-foreground">{fmtTime(a.start)}</span>
                      <span className="truncate text-foreground">{a.personName ?? a.title}</span>
                    </button>
                  )
                })}
                {dayEvents.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onDayClick(d)}
                    className="px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{dayEvents.length - 3} mais
                  </button>
                )}
              </div>
              {/* Mobile: pontos */}
              {dayEvents.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                  {dayEvents.slice(0, 4).map((a) => (
                    <span key={a.id} className="size-1 rounded-full" style={lookup(a.categoryId).style.dot} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
