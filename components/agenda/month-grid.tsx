"use client"

import * as React from "react"
import { cn } from "cn"
import { AvatarStack } from "./avatar-stack"
import { DayChip } from "./day-chip"
import { EventMarks } from "./event-block"
import { eventTone } from "./event-style"
import { appointmentStatus, participantsOf, type DayItem } from "@/lib/agenda/agenda"
import { addDays, getNow, fmtTime, isSameDay, parse, startOfWeek, toLocalISO } from "@/lib/core/dates"
import type { Appointment } from "@/types"

const WEEK_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]

export function MonthGrid({
  anchor,
  events,
  items,
  onSelect,
  onDayClick,
  onMove,
  colorOf,
  canOpenItem,
}: {
  anchor: Date
  events: Appointment[]
  items: DayItem[]
  colorOf: (a: Appointment) => string | undefined
  canOpenItem: (item: DayItem) => boolean
  onSelect: (a: Appointment) => void
  onDayClick: (d: Date) => void
  /** Arrastar para outro dia (mesmo horário). Ausente = sem permissão para editar. */
  onMove?: (a: Appointment, date: string) => void
}) {
  const dragged = React.useRef<Appointment | null>(null)
  const [target, setTarget] = React.useState<string | null>(null)
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const weeks = days[35].getMonth() !== anchor.getMonth() ? 5 : 6

  return (
    <div className="overflow-hidden rounded-card border border-border/90 bg-card shadow-card">
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
          const dayKey = toLocalISO(d).slice(0, 10)
          const dayItems = items.filter((i) => i.date === dayKey)
          // Compromissos primeiro; prazos e tarefas ocupam o que sobrar das 3 linhas.
          const shownEvents = dayEvents.slice(0, 3)
          const shownItems = dayItems.slice(0, 3 - shownEvents.length)
          const hiddenCount = dayEvents.length - shownEvents.length + dayItems.length - shownItems.length
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "group/day @container/day relative min-h-[64px] border-border p-1 sm:min-h-[118px] sm:p-1.5",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !inMonth && "bg-surface-muted/40",
                weekend && inMonth && "bg-surface-muted/20",
                target === dayKey && "bg-brand-soft/60 ring-2 ring-inset ring-brand/50",
              )}
              onDragOver={(e) => {
                if (!dragged.current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                if (target !== dayKey) setTarget(dayKey)
              }}
              onDrop={(e) => {
                const a = dragged.current
                if (!a) return
                e.preventDefault()
                dragged.current = null
                setTarget(null)
                if (a.start.slice(0, 10) !== dayKey) onMove?.(a, dayKey)
              }}
            >
              <button
                type="button"
                onClick={() => onDayClick(d)}
                aria-label={`Ver dia ${d.getDate()}`}
                className={cn(
                  "touch-target relative tabular mb-1 flex size-7 items-center justify-center rounded-full text-[12.5px] font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40 max-sm:mx-auto",
                  today ? "bg-danger text-white hover:bg-danger/90" : inMonth ? "text-foreground" : "text-subtle",
                )}
              >
                {d.getDate()}
              </button>
              {/* Desktop: chips coloridos, com a foto de quem participa */}
              <div className="hidden space-y-0.5 sm:block">
                {shownEvents.map((a) => {
                  const status = appointmentStatus(a)
                  const tone = eventTone(colorOf(a), status)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      draggable={!!onMove}
                      onDragStart={(e) => {
                        dragged.current = a
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData("text/plain", a.id)
                      }}
                      onDragEnd={() => {
                        dragged.current = null
                        setTarget(null)
                      }}
                      onClick={() => onSelect(a)}
                      style={{ ...tone.card, ...tone.bar }}
                      className={cn(
                        "flex w-full items-center gap-1.5 truncate rounded-[6px] border-l-[3px] px-1.5 py-[3px] text-left text-[11px] outline-none pointer-coarse:-my-1.5 pointer-coarse:py-2 transition-[filter] hover:brightness-[0.96] focus-visible:ring-2 focus-visible:ring-brand/40",
                        parse(a.end) < getNow() && status === "planejado" && "opacity-70",
                      )}
                    >
                      <span className="tabular shrink-0 font-medium" style={tone.text}>
                        {fmtTime(a.start)}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate font-medium", status === "cancelado" && "line-through")} style={tone.text}>
                        {a.title}
                      </span>
                      <EventMarks a={a} />
                      {/* Foto só quando a célula é larga: senão o título some. */}
                      <AvatarStack ids={participantsOf(a)} size="xs" max={1} className="hidden shrink-0 @[9.5rem]/day:inline-flex" />
                    </button>
                  )
                })}
                {shownItems.map((item) => (
                  <DayChip key={`${item.kind}-${item.id}`} item={item} link={canOpenItem(item)} />
                ))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onDayClick(d)}
                    className="touch-target relative px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{hiddenCount} mais
                  </button>
                )}
              </div>
              {/* Mobile: pontos */}
              {dayEvents.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                  {dayEvents.slice(0, 4).map((a) => (
                    <span key={a.id} className="size-1.5 rounded-full" style={eventTone(colorOf(a)).dot} />
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
