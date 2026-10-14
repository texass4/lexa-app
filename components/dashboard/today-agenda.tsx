"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { todaysAppointments } from "@/lib/store/selectors"
import { EmptyState } from "@/components/ui/empty-state"
import { PanelLink } from "./panel-link"
import { ChipTabs } from "./chip-tabs"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { addDays, getNow, fmtTime, parse, startOfDay, toLocalISO, weekdayShort } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { processSubject, processTitle } from "@/lib/processos/label"
import type { Appointment } from "@/types"

/** Hoje e os próximos dias: a agenda do Início olha só para a frente. */
const DAYS = 5

function hrefFor(a: Appointment) {
  if (a.processId) return `/processos/${a.processId}`
  if (a.clientId) return `/clientes/${a.clientId}`
  return "/agenda"
}

function dayLabel(offset: number, date: Date) {
  if (offset === 0) return "Hoje"
  if (offset === 1) return "Amanhã"
  const wd = weekdayShort(date.getDay())
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${date.getDate()}`
}

/** Agenda do escritório em linha do tempo, com os compromissos de hoje e dos próximos dias. */
export function TodayAgenda() {
  const data = useOfficeData()
  const lookup = useCategoryLookup()
  const now = getNow()
  const [offset, setOffset] = React.useState("0")
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(startOfDay(now), i)
    return { value: String(i), date, label: dayLabel(i, date), items: todaysAppointments(data, date) }
  })
  const day = days[Number(offset)] ?? days[0]
  const items = day.items
  const isToday = day.value === "0"
  const nowIndex = isToday ? items.findIndex((a) => parse(a.start) > now) : -1
  const listRef = React.useRef<HTMLOListElement>(null)

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-now]")
    if (el && listRef.current) listRef.current.scrollTop = Math.max(0, el.offsetTop - 64)
  }, [offset])

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Agenda"
        icon={<CalendarDays />}
        description={
          items.length ? `${items.length} compromisso${items.length > 1 ? "s" : ""} ${isToday ? "hoje" : "no dia"} · escritório` : undefined
        }
        action={<PanelLink href="/agenda">Ver agenda</PanelLink>}
      />
      <ChipTabs
        ariaLabel="Dia da agenda"
        className="px-5 pb-3 sm:px-6"
        value={day.value}
        onChange={setOffset}
        tabs={days.map((d) => ({ value: d.value, label: d.label, count: d.items.length }))}
      />
      {items.length === 0 && (
        <EmptyState
          compact
          title={isToday ? "Agenda livre hoje." : "Agenda livre neste dia."}
          description="Audiências, reuniões e prazos marcados aparecem aqui."
        />
      )}
      <ol ref={listRef} className="relative flex-1 px-3 pb-3 thin-scrollbar lg:max-h-[420px] lg:overflow-y-auto">
        {items.map((a, i) => {
          const { category, style } = lookup(a.categoryId)
          const past = parse(a.end) <= now
          const current = parse(a.start) <= now && parse(a.end) > now
          const owner = getUser(a.ownerId)
          const process = a.processId ? byId(data.processes, a.processId) : undefined
          // Com a pessoa já citada, o processo entra só pelo assunto (sem repetir o nome).
          const processText = process && (a.personName ? processSubject(process) : processTitle(process, byId(data.clients, process.clientId)?.name))
          const detail = a.location?.split(" — ")[0] || [a.personName, processText].filter(Boolean).join(" · ")
          return (
            <li key={a.id} data-now={i === nowIndex ? "" : undefined}>
              {i === nowIndex && (
                <div className="relative my-1 flex items-center gap-2 px-3" aria-label={`Agora, ${fmtTime(toLocalISO(now))}`}>
                  <span className="tabular w-[56px] text-[11px] font-semibold text-brand-strong">{fmtTime(toLocalISO(now))}</span>
                  <span className="size-2 rounded-full bg-brand" aria-hidden />
                  <span className="h-px flex-1 bg-brand/50" />
                </div>
              )}
              <Link
                href={hrefFor(a)}
                className={cn(
                  "group grid grid-cols-[56px_14px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-[10px] px-3 py-2.5 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-brand/40",
                  past && "opacity-60 hover:opacity-100",
                )}
              >
                <span className="flex flex-col pt-0.5">
                  <span className="tabular text-[13px] font-semibold text-foreground">{fmtTime(a.start)}</span>
                  <span className="tabular text-[11px] text-subtle">{fmtTime(a.end)}</span>
                </span>
                <span aria-hidden className="relative flex h-full justify-center pt-1.5">
                  <span className="size-2.5 rounded-full ring-[3px] ring-card" style={style.dot} />
                  {i < items.length - 1 && <span className="absolute top-5 -bottom-3 w-px bg-border" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-foreground">{a.title}</span>
                    {current && (
                      <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand-strong">AGORA</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {[category?.name, detail].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-2 pt-0.5" title={owner.name}>
                  <UserAvatar name={owner.name} src={owner.avatarUrl} size="sm" />
                  <span className="hidden max-w-[96px] truncate text-[12px] text-muted-foreground @5xl/main:inline">{owner.firstName}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
