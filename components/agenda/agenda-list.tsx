"use client"

import { Video } from "lucide-react"
import { cn } from "cn"
import { AvatarStack } from "./avatar-stack"
import { DayChip } from "./day-chip"
import { EventMarks } from "./event-block"
import { eventTone } from "./event-style"
import { useCategoryLookup } from "./use-category"
import { appointmentStatus, participantsOf, STATUS_LABEL, videoProvider, type DayItem } from "@/lib/agenda/agenda"
import { getNow, fmtTime, isSameDay, parse, toLocalISO, weekdayName } from "@/lib/core/dates"
import type { Appointment } from "@/types"

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Lista por dia: a visão "Lista" e a semana em telas pequenas. Cada compromisso mostra
 * horário, cor, quem participa (com foto), onde e o atalho para entrar na videochamada.
 */
export function AgendaList({
  days,
  events,
  items,
  onSelect,
  colorOf,
  canOpenItem,
  hideEmpty = false,
}: {
  days: Date[]
  events: Appointment[]
  items: DayItem[]
  onSelect: (a: Appointment) => void
  colorOf: (a: Appointment) => string | undefined
  canOpenItem: (item: DayItem) => boolean
  /** Na visão Lista, dias sem nada ficam de fora. */
  hideEmpty?: boolean
}) {
  const lookup = useCategoryLookup()
  const now = getNow()
  const shown = days
    .map((d) => ({
      d,
      list: events.filter((e) => isSameDay(parse(e.start), d)).sort((a, b) => a.start.localeCompare(b.start)),
      extras: items.filter((i) => i.date === toLocalISO(d).slice(0, 10)),
    }))
    .filter(({ list, extras }) => !hideEmpty || list.length > 0 || extras.length > 0)

  if (!shown.length) {
    return (
      <p className="rounded-card border border-dashed border-border-strong bg-card px-6 py-12 text-center text-[13.5px] text-muted-foreground">
        Nada agendado neste período.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {shown.map(({ d, list, extras }) => {
        const today = isSameDay(d, now)
        return (
          <section key={d.toISOString()}>
            <header className="mb-2 flex items-center gap-2.5 px-1">
              <span
                className={cn(
                  "tabular flex size-8 items-center justify-center rounded-full text-[14px] font-semibold",
                  today ? "bg-danger text-white" : "bg-surface-muted text-foreground",
                )}
              >
                {d.getDate()}
              </span>
              <span className="text-[13px] font-semibold">{today ? "Hoje" : cap(weekdayName(d.getDay()))}</span>
              <span className="text-[12px] text-subtle">{list.length ? `${list.length} compromisso${list.length === 1 ? "" : "s"}` : "Livre"}</span>
            </header>
            {extras.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1 px-1">
                {extras.map((item) => (
                  <DayChip key={`${item.kind}-${item.id}`} item={item} link={canOpenItem(item)} className="max-w-full" />
                ))}
              </div>
            )}
            {list.length > 0 && (
              <ul className="overflow-hidden rounded-card border border-border/90 bg-card shadow-card">
                {list.map((a) => {
                  const { category } = lookup(a.categoryId)
                  const status = appointmentStatus(a)
                  const tone = eventTone(colorOf(a), status)
                  return (
                    <li key={a.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60",
                          parse(a.end) < now && status === "planejado" && "opacity-70",
                        )}
                      >
                        <span className="w-[84px] shrink-0">
                          <span className="tabular block text-[13px] font-semibold">{fmtTime(a.start)}</span>
                          <span className="tabular block text-[11.5px] text-subtle">{fmtTime(a.end)}</span>
                        </span>
                        <span className="h-11 w-[4px] shrink-0 rounded-full" style={tone.dot} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={cn("truncate text-[13.5px] font-semibold", status === "cancelado" && "line-through")}>{a.title}</span>
                            <EventMarks a={a} />
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {[a.personName, category?.name, status !== "planejado" ? STATUS_LABEL[status] : undefined, a.location]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {a.videoUrl && (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-strong">
                              <Video className="size-3" aria-hidden /> {videoProvider(a.videoUrl)}
                            </span>
                          )}
                        </span>
                        <AvatarStack ids={participantsOf(a)} size="sm" max={3} className="shrink-0" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
