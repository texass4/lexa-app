"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "cn"
import { layoutDay } from "./layout-events"
import { atMinutes, durationMinutes, moveAppointment, snapMinutes } from "@/lib/agenda"
import { useCategoryLookup } from "./use-category"
import { getNow, fmtTime, isSameDay, parse, toLocalISO, weekdayShort } from "@/lib/dates"
import type { Appointment } from "@/types"

const START_HOUR = 7
const END_HOUR = 21
const HOUR_PX = 60

/** Onde o compromisso arrastado vai cair (dia + minutos do início). */
type DropPreview = { day: string; startMin: number }

export function TimeGrid({
  days,
  events,
  onSelect,
  onCreate,
  onMove,
  processCode,
}: {
  days: Date[]
  events: Appointment[]
  onSelect: (a: Appointment) => void
  /** Ausente = sem permissão para criar: os horários não são clicáveis. */
  onCreate?: (date: string) => void
  /** Ausente = sem permissão para editar: os compromissos não são arrastáveis. */
  onMove?: (a: Appointment, date: string, startMinutes: number) => void
  processCode: (id?: string) => string | undefined
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Arrastar para remarcar: o compromisso, onde foi agarrado e a posição de destino.
  const drag = React.useRef<{ event: Appointment; grabOffset: number } | null>(null)
  // Na tela (prévia, transparência): o compromisso arrastado. O ref acima é só para os eventos.
  const [dragged, setDragged] = React.useState<Appointment | null>(null)
  const [preview, setPreview] = React.useState<DropPreview | null>(null)

  const dropMinutes = (e: React.DragEvent<HTMLElement>) => {
    const current = drag.current
    if (!current) return null
    const top = e.currentTarget.getBoundingClientRect().top
    const raw = START_HOUR * 60 + ((e.clientY - top - current.grabOffset) / HOUR_PX) * 60
    return snapMinutes(raw, { min: START_HOUR * 60, max: END_HOUR * 60 - durationMinutes(current.event) })
  }
  const endDrag = () => {
    drag.current = null
    setDragged(null)
    setPreview(null)
  }
  const lookup = useCategoryLookup()
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const nowMin = getNow().getHours() * 60 + getNow().getMinutes()

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_PX - 8
  }, [])

  const single = days.length === 1
  const columns = `56px ${days.map((d) => (!single && (d.getDay() === 0 || d.getDay() === 6) ? "minmax(0, 0.55fr)" : "minmax(0, 1fr)")).join(" ")}`

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
      {/* Cabeçalho dos dias */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((d) => {
          const today = isSameDay(d, getNow())
          const weekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "flex items-center gap-2 border-l border-border px-3 py-2.5",
                single && "justify-start",
                weekend && "bg-surface-muted/30",
              )}
            >
              <span className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", today ? "text-brand-strong" : "text-muted-foreground")}>
                {weekdayShort(d.getDay())}
              </span>
              <span
                className={cn(
                  "tabular flex size-7 items-center justify-center rounded-full text-[14px] font-semibold",
                  today ? "bg-foreground text-background" : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      <div ref={scrollRef} className="relative max-h-[min(640px,calc(100dvh-300px))] overflow-y-auto thin-scrollbar">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          {/* Coluna de horas */}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span key={h} className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-subtle" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>

          {days.map((d) => {
            const dayEvents = events.filter((e) => isSameDay(parse(e.start), d))
            const positioned = layoutDay(dayEvents)
            const today = isSameDay(d, getNow())
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const dayKey = toLocalISO(d).slice(0, 10)
            const showPreview = preview?.day === dayKey && dragged
            return (
              <div
                key={d.toISOString()}
                className={cn("relative border-l border-border", weekend && "bg-surface-muted/30")}
                style={{ height: hours.length * HOUR_PX }}
                onDragOver={(e) => {
                  const startMin = dropMinutes(e)
                  if (startMin === null) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                  if (preview?.day !== dayKey || preview.startMin !== startMin) setPreview({ day: dayKey, startMin })
                }}
                onDrop={(e) => {
                  const startMin = dropMinutes(e)
                  const current = drag.current
                  if (startMin === null || !current) return
                  e.preventDefault()
                  endDrag()
                  onMove?.(current.event, dayKey, startMin)
                }}
              >
                {hours.map((h, i) => (
                  <button
                    key={h}
                    type="button"
                    aria-label={`Novo compromisso em ${d.getDate()}/${d.getMonth() + 1} às ${h}:00`}
                    disabled={!onCreate}
                    onClick={() => {
                      const x = new Date(d)
                      x.setHours(h, 0, 0, 0)
                      onCreate?.(toLocalISO(x))
                    }}
                    className="group absolute inset-x-0 border-t border-border/70 outline-none first:border-t-0 hover:bg-brand-soft/40 focus-visible:bg-brand-soft/50 disabled:cursor-default disabled:hover:bg-transparent"
                    style={{ top: i * HOUR_PX, height: HOUR_PX }}
                  >
                    <span className="absolute top-1 left-2 text-[11px] font-medium text-brand-strong opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden">
                      + {String(h).padStart(2, "0")}:00
                    </span>
                  </button>
                ))}

                {today && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{ top: ((nowMin - START_HOUR * 60) / 60) * HOUR_PX }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-brand" />
                    <span className="h-px flex-1 bg-brand" />
                  </div>
                )}

                {showPreview && dragged && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 z-30 rounded-[7px] border-2 border-dashed border-brand bg-brand-soft/60 px-2 py-1"
                    style={{
                      top: ((preview.startMin - START_HOUR * 60) / 60) * HOUR_PX + 1,
                      height: Math.max((durationMinutes(dragged) / 60) * HOUR_PX - 2, 22),
                    }}
                  >
                    <p className="tabular truncate text-[11px] font-semibold text-brand-strong">
                      {fmtTime(atMinutes(dayKey, preview.startMin))} – {fmtTime(moveAppointment(dragged, dayKey, preview.startMin).end)}
                    </p>
                  </div>
                )}

                {positioned.map(({ event: a, startMin, endMin, lane, lanes }) => {
                  const { style } = lookup(a.categoryId)
                  const top = ((startMin - START_HOUR * 60) / 60) * HOUR_PX
                  const height = Math.max(((endMin - startMin) / 60) * HOUR_PX - 2, 22)
                  const compact = height < 40
                  const past = parse(a.end) < getNow()
                  const code = processCode(a.processId)
                  const label = code ? `${a.title} · ${code}` : a.title
                  return (
                    // O arrastar (HTML nativo) fica no invólucro: o `motion.button` usa os eventos de drag para outra coisa.
                    <div
                      key={a.id}
                      draggable={!!onMove}
                      title={onMove ? "Arraste para remarcar" : undefined}
                      onDragStart={(e) => {
                        drag.current = { event: a, grabOffset: e.clientY - e.currentTarget.getBoundingClientRect().top }
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData("text/plain", a.id)
                        setDragged(a)
                      }}
                      onDragEnd={endDrag}
                      className={cn("absolute z-10", dragged?.id === a.id && "opacity-40", onMove && "cursor-grab active:cursor-grabbing")}
                      style={{
                        top: top + 1,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 3px)`,
                        width: `calc(${100 / lanes}% - 6px)`,
                      }}
                    >
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => onSelect(a)}
                        className={cn(
                          "size-full overflow-hidden rounded-[7px] border-l-[3px] px-2 text-left outline-none ring-1 ring-inset ring-black/[0.03] transition-[box-shadow,filter] hover:shadow-[0_6px_16px_-8px_rgb(15_23_42/0.35)] hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-brand/50",
                          past && "opacity-60",
                          compact ? "py-0.5" : "py-1.5",
                        )}
                        style={{
                          ...style.soft,
                          ...style.bar,
                        }}
                      >
                        <p className="truncate text-[11.5px] font-semibold leading-tight" style={style.text}>
                          {compact ? `${fmtTime(a.start)} ${a.personName ?? label}` : label}
                        </p>
                        {!compact && (
                          <>
                            <p className="truncate text-[11.5px] leading-tight text-foreground/80">{a.personName}</p>
                            {height > 58 && (
                              <p className="tabular mt-0.5 truncate text-[10.5px] text-muted-foreground">
                                {fmtTime(a.start)} – {fmtTime(a.end)}
                              </p>
                            )}
                          </>
                        )}
                      </motion.button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
