"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { todaysAppointments } from "@/lib/store/selectors"
import { EmptyState } from "@/components/ui/empty-state"
import { PanelLink } from "./panel-link"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { getNow, fmtTime, parse, toLocalISO } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { processSubject, processTitle } from "@/lib/processos/label"
import type { Appointment } from "@/types"

function hrefFor(a: Appointment) {
  if (a.processId) return `/processos/${a.processId}`
  if (a.clientId) return `/clientes/${a.clientId}`
  return "/agenda"
}

export function TodayAgenda() {
  const data = useOfficeData()
  const lookup = useCategoryLookup()
  const items = todaysAppointments(data)
  const nowIndex = items.findIndex((a) => parse(a.start) > getNow())
  const listRef = React.useRef<HTMLOListElement>(null)

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-now]")
    if (el && listRef.current) listRef.current.scrollTop = Math.max(0, el.offsetTop - 64)
  }, [])

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Agenda de hoje"
        icon={<CalendarDays />}
        description={items.length ? `${items.length} compromisso${items.length > 1 ? "s" : ""} · escritório` : undefined}
        action={<PanelLink href="/agenda">Ver agenda</PanelLink>}
      />
      {items.length === 0 && <EmptyState compact title="Agenda livre hoje." description="Audiências, reuniões e prazos do dia aparecem aqui." />}
      <ol ref={listRef} className="relative flex-1 px-3 pb-3 thin-scrollbar lg:max-h-[436px] lg:overflow-y-auto">
        {items.map((a, i) => {
          const { category, style } = lookup(a.categoryId)
          const past = parse(a.end) <= getNow()
          const current = parse(a.start) <= getNow() && parse(a.end) > getNow()
          const process = a.processId ? byId(data.processes, a.processId) : undefined
          // Com a pessoa já citada, o processo entra só pelo assunto (sem repetir o nome).
          const processText = process && (a.personName ? processSubject(process) : processTitle(process, byId(data.clients, process.clientId)?.name))
          const detail = a.location?.split(" — ")[0] || [a.personName, processText].filter(Boolean).join(" · ")
          return (
            <li key={a.id} data-now={i === nowIndex ? "" : undefined}>
              {i === nowIndex && (
                <div className="relative my-1 flex items-center gap-2 px-3" aria-label={`Agora, ${fmtTime(toLocalISO(getNow()))}`}>
                  <span className="tabular text-[10.5px] font-semibold text-brand-strong">{fmtTime(toLocalISO(getNow()))}</span>
                  <span className="h-px flex-1 bg-brand/40" />
                </div>
              )}
              <Link
                href={hrefFor(a)}
                className={cn(
                  "group grid grid-cols-[72px_14px_minmax(0,1fr)] items-start gap-x-3 rounded-[12px] px-3 py-2.5 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-brand/40",
                  past && "opacity-55 hover:opacity-100",
                )}
              >
                <span className="flex items-center gap-2 pt-0.5">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={style.dot} />
                  <span className="tabular text-[13px] font-semibold text-foreground">{fmtTime(a.start)}</span>
                </span>
                <span aria-hidden className="relative flex h-full justify-center pt-1.5">
                  <span className="size-2 rounded-full ring-2 ring-card" style={style.dot} />
                  {i < items.length - 1 && <span className="absolute top-4 -bottom-3 w-px bg-border" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-foreground">{a.title}</span>
                    {current && (
                      <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand-strong">AGORA</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {[category?.name, detail, getUser(a.ownerId).firstName].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
