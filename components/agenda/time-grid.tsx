"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "cn"
import { layoutDay } from "./layout-events"
import { EventBlock } from "./event-block"
import { DayChip } from "./day-chip"
import { eventTone } from "./event-style"
import { appointmentStatus, atMinutes, durationMinutes, moveAppointment, snapMinutes, type DayItem } from "@/lib/agenda/agenda"
import { getNow, fmtTime, isSameDay, parse, toLocalISO, weekdayShort } from "@/lib/core/dates"
import type { Appointment } from "@/types"

const MIN_START_HOUR = 7
const MIN_END_HOUR = 20
const HOUR_PX = 64
/** Início de cada faixa clicável dentro da hora. */
const SLOT_MINUTES = [0, 30] as const
const MIN_DURATION = 15

/** Onde o compromisso arrastado vai cair (dia + minutos do início). */
type DropPreview = { day: string; startMin: number }

const minutesOf = (iso: string) => {
  const d = parse(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Faixa de horas exibida: 7h–21h, ampliada para caber o que estiver mais cedo ou mais tarde. */
function hourRange(events: Appointment[]) {
  let start = MIN_START_HOUR
  let end = MIN_END_HOUR
  for (const e of events) {
    start = Math.min(start, Math.floor(minutesOf(e.start) / 60))
    end = Math.max(end, Math.ceil(Math.max(minutesOf(e.end), minutesOf(e.start) + MIN_DURATION) / 60) - 1)
  }
  return { startHour: Math.max(0, start), endHour: Math.min(23, end) + 1 }
}

export function TimeGrid({
  days,
  events,
  items,
  onSelect,
  onCreate,
  onMove,
  onResize,
  processLabel,
  colorOf,
  canOpenItem,
}: {
  days: Date[]
  events: Appointment[]
  /** Prazos e tarefas dos dias exibidos (faixa "Dia inteiro"). */
  items: DayItem[]
  onSelect: (a: Appointment) => void
  /** Ausente = sem permissão para criar: os horários não são clicáveis. */
  onCreate?: (date: string) => void
  /** Ausente = sem permissão para editar: os compromissos não são arrastáveis. */
  onMove?: (a: Appointment, date: string, startMinutes: number) => void
  /** Puxar a borda de baixo muda o término. */
  onResize?: (a: Appointment, endMinutes: number) => void
  processLabel: (id?: string) => string | undefined
  colorOf: (a: Appointment) => string | undefined
  canOpenItem: (item: DayItem) => boolean
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Arrastar para remarcar: o compromisso, onde foi agarrado e a posição de destino.
  const drag = React.useRef<{ event: Appointment; grabOffset: number } | null>(null)
  // Na tela (prévia, transparência): o compromisso arrastado. O ref acima é só para os eventos.
  const [dragged, setDragged] = React.useState<Appointment | null>(null)
  const [preview, setPreview] = React.useState<DropPreview | null>(null)
  // Redimensionar: o compromisso e o término provisório enquanto a borda é puxada.
  const resizing = React.useRef<{ id: string } | null>(null)
  const [resize, setResize] = React.useState<{ id: string; endMin: number } | null>(null)

  const { startHour, endHour } = React.useMemo(() => hourRange(events), [events])

  const dropMinutes = (e: React.DragEvent<HTMLElement>) => {
    const current = drag.current
    if (!current) return null
    const top = e.currentTarget.getBoundingClientRect().top
    const raw = startHour * 60 + ((e.clientY - top - current.grabOffset) / HOUR_PX) * 60
    return snapMinutes(raw, { min: startHour * 60, max: endHour * 60 - durationMinutes(current.event) })
  }
  const endDrag = () => {
    drag.current = null
    setDragged(null)
    setPreview(null)
  }
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const now = getNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (8 - startHour) * HOUR_PX - 8)
    // Só ao abrir: mudar as horas exibidas depois não deve puxar a rolagem de volta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const single = days.length === 1
  const columns = `56px ${days.map((d) => (!single && (d.getDay() === 0 || d.getDay() === 6) ? "minmax(0, 0.6fr)" : "minmax(0, 1fr)")).join(" ")}`
  const keyOf = (d: Date) => toLocalISO(d).slice(0, 10)
  const itemsOf = (d: Date) => items.filter((i) => i.date === keyOf(d))
  const hasItems = items.length > 0

  const startResize = (e: React.PointerEvent<HTMLElement>, a: Appointment) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizing.current = { id: a.id }
    setResize({ id: a.id, endMin: minutesOf(a.end) })
  }
  const moveResize = (e: React.PointerEvent<HTMLElement>, a: Appointment) => {
    const r = resizing.current
    if (!r || r.id !== a.id) return
    // A coluna do dia (avó do puxador) é a origem das horas.
    const columnTop = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect().top
    const raw = startHour * 60 + ((e.clientY - columnTop) / HOUR_PX) * 60
    setResize({ id: a.id, endMin: snapMinutes(raw, { min: minutesOf(a.start) + MIN_DURATION, max: endHour * 60 }) })
  }
  const endResize = (e: React.PointerEvent<HTMLElement>, a: Appointment, commit: boolean) => {
    const r = resizing.current
    resizing.current = null
    const result = resize
    setResize(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (commit && r && result?.id === a.id && result.endMin !== minutesOf(a.end)) onResize?.(a, result.endMin)
  }

  return (
    <div className="overflow-hidden rounded-card border border-border/90 bg-card shadow-card">
      {/* Cabeçalho dos dias */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((d) => {
          const today = isSameDay(d, now)
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
              <span className={cn("text-[12px] font-medium", today ? "text-brand-strong" : "text-muted-foreground")}>{weekdayShort(d.getDay())}</span>
              <span
                className={cn(
                  "tabular flex size-7 items-center justify-center rounded-full text-[14px] font-semibold",
                  today ? "bg-danger text-white" : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Prazos e tarefas do dia, no alto, como os eventos de "dia inteiro". */}
      {hasItems && (
        <div className="grid border-b border-border bg-surface-muted/20" style={{ gridTemplateColumns: columns }}>
          <div className="flex items-start justify-end pt-2 pr-2 text-[10.5px] leading-tight text-subtle">Dia inteiro</div>
          {days.map((d) => {
            const list = itemsOf(d)
            return (
              <div key={d.toISOString()} className="min-w-0 space-y-0.5 border-l border-border p-1">
                {list.slice(0, 2).map((item) => (
                  <DayChip key={`${item.kind}-${item.id}`} item={item} link={canOpenItem(item)} />
                ))}
                {list.length > 2 && (
                  <p
                    className="px-1 text-[10.5px] font-medium text-muted-foreground"
                    title={list
                      .slice(2)
                      .map((i) => i.label)
                      .join(" · ")}
                  >
                    +{list.length - 2} mais
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div ref={scrollRef} className="relative max-h-[min(680px,calc(100dvh-300px))] overflow-y-auto thin-scrollbar">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          {/* Coluna de horas */}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span key={h} className="tabular absolute right-2 text-[11px] text-subtle" style={{ top: i * HOUR_PX + 2 }}>
                {`${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
            {nowMin >= startHour * 60 && nowMin <= endHour * 60 && days.some((d) => isSameDay(d, now)) && (
              <span
                className="tabular pointer-events-none absolute right-1 z-20 -translate-y-1/2 rounded-[5px] bg-danger px-1 py-px text-[10.5px] font-semibold text-white"
                style={{ top: ((nowMin - startHour * 60) / 60) * HOUR_PX }}
              >
                {fmtTime(toLocalISO(now))}
              </span>
            )}
          </div>

          {days.map((d) => {
            const dayEvents = events.filter((e) => isSameDay(parse(e.start), d))
            const positioned = layoutDay(dayEvents)
            const today = isSameDay(d, now)
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const dayKey = keyOf(d)
            const showPreview = preview?.day === dayKey && dragged
            return (
              <div
                key={d.toISOString()}
                className={cn("relative border-l border-border", weekend && "bg-surface-muted/30", today && "bg-brand-soft/20")}
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
                {/* Meia em meia hora: o clique abre "Novo compromisso" já no horário clicado (ex.: 14:30). */}
                {hours.flatMap((h, i) =>
                  SLOT_MINUTES.map((m) => {
                    const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-label={`Novo compromisso em ${d.getDate()}/${d.getMonth() + 1} às ${label}`}
                        disabled={!onCreate}
                        onClick={() => {
                          const x = new Date(d)
                          x.setHours(h, m, 0, 0)
                          onCreate?.(toLocalISO(x))
                        }}
                        className={cn(
                          "group absolute inset-x-0 outline-none hover:bg-brand-soft/50 focus-visible:bg-brand-soft/60 disabled:cursor-default disabled:hover:bg-transparent",
                          m === 0 ? "border-t border-border/70" : "border-t border-dashed border-border/40",
                          i === 0 && m === 0 && "border-t-0",
                        )}
                        style={{ top: i * HOUR_PX + (m / 60) * HOUR_PX, height: HOUR_PX / SLOT_MINUTES.length }}
                      >
                        <span className="absolute top-0.5 left-2 text-[11px] font-medium text-brand-strong opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden">
                          + {label}
                        </span>
                      </button>
                    )
                  }),
                )}

                {today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{ top: ((nowMin - startHour * 60) / 60) * HOUR_PX }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}

                {showPreview && dragged && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 z-30 rounded-[8px] border-2 border-dashed border-brand bg-brand-soft/60 px-2 py-1"
                    style={{
                      top: ((preview.startMin - startHour * 60) / 60) * HOUR_PX + 1,
                      height: Math.max((durationMinutes(dragged) / 60) * HOUR_PX - 2, 22),
                    }}
                  >
                    <p className="tabular truncate text-[11px] font-semibold text-brand-strong">
                      {fmtTime(atMinutes(dayKey, preview.startMin))} – {fmtTime(moveAppointment(dragged, dayKey, preview.startMin).end)}
                    </p>
                  </div>
                )}

                {positioned.map(({ event: a, startMin, endMin, lane, lanes }) => {
                  const tone = eventTone(colorOf(a), appointmentStatus(a))
                  const liveEnd = resize?.id === a.id ? resize.endMin : endMin
                  const top = ((startMin - startHour * 60) / 60) * HOUR_PX
                  const height = Math.max(((liveEnd - startMin) / 60) * HOUR_PX - 2, 22)
                  const past = parse(a.end) < now && appointmentStatus(a) === "planejado"
                  const process = processLabel(a.processId)
                  const label = process ? `${a.title} · ${process}` : a.title
                  return (
                    // O arrastar (HTML nativo) fica no invólucro: o `motion.button` usa os eventos de drag para outra coisa.
                    <div
                      key={a.id}
                      draggable={!!onMove}
                      title={onMove ? "Arraste para remarcar" : undefined}
                      onDragStart={(e) => {
                        if (resizing.current) {
                          e.preventDefault()
                          return
                        }
                        drag.current = { event: a, grabOffset: e.clientY - e.currentTarget.getBoundingClientRect().top }
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData("text/plain", a.id)
                        setDragged(a)
                      }}
                      onDragEnd={endDrag}
                      className={cn(
                        "group/event absolute z-10",
                        dragged?.id === a.id && "opacity-40",
                        onMove && "cursor-grab active:cursor-grabbing",
                      )}
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
                          "relative size-full overflow-hidden rounded-[8px] border-l-[4px] px-2 text-left outline-none ring-1 ring-black/[0.04] transition-[box-shadow,filter] hover:shadow-raised hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-brand/50",
                          past && "opacity-70",
                          height < 40 ? "py-0.5" : "py-1.5",
                        )}
                        style={{ ...tone.card, ...tone.bar }}
                      >
                        <EventBlock a={a} height={height} label={label} textStyle={tone.text} />
                      </motion.button>
                      {onResize && (
                        <span
                          role="separator"
                          aria-orientation="horizontal"
                          aria-label="Ajustar o término"
                          title="Arraste para mudar o término"
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={(e) => startResize(e, a)}
                          onPointerMove={(e) => moveResize(e, a)}
                          onPointerUp={(e) => endResize(e, a, true)}
                          onPointerCancel={(e) => endResize(e, a, false)}
                          className="absolute inset-x-2 -bottom-0.5 z-10 h-2 cursor-ns-resize touch-none rounded-full opacity-0 transition-opacity group-hover/event:opacity-100 after:absolute after:inset-x-[30%] after:top-[3px] after:h-[2px] after:rounded-full after:bg-foreground/35"
                        />
                      )}
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
