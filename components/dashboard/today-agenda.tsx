"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, MapPin } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { useDemoData } from "@/lib/store/demo-store"
import { todaysAppointments } from "@/lib/selectors"
import { EmptyState } from "@/components/ui/empty-state"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { getNow, fmtTime, parse, toLocalISO } from "@/lib/dates"
import { getUser } from "@/lib/account"
import type { Appointment } from "@/types"

function hrefFor(a: Appointment) {
  if (a.processId) return `/processos/${a.processId}`
  if (a.clientId) return `/clientes/${a.clientId}`
  return "/agenda"
}

export function TodayAgenda() {
  const data = useDemoData()
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
        description={`${items.length} compromissos · escritório`}
        action={
          <Link
            href="/agenda"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            Agenda <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {items.length === 0 && <EmptyState compact title="Nenhum compromisso hoje." />}
      <ol ref={listRef} className="relative flex-1 px-3 pb-3 thin-scrollbar lg:max-h-[436px] lg:overflow-y-auto">
        {items.map((a, i) => {
          const { category, style } = lookup(a.categoryId)
          const past = parse(a.end) <= getNow()
          const current = parse(a.start) <= getNow() && parse(a.end) > getNow()
          const processCode = a.processId ? data.processes.find((p) => p.id === a.processId)?.code : undefined
          return (
            <li key={a.id} data-now={i === nowIndex ? "" : undefined}>
              {i === nowIndex && (
                <div className="relative my-1.5 flex items-center gap-2 px-2" aria-label={`Agora, ${fmtTime(toLocalISO(getNow()))}`}>
                  <span className="tabular text-[10.5px] font-semibold text-gold-dark">{fmtTime(toLocalISO(getNow()))}</span>
                  <span className="size-1.5 rounded-full bg-gold" />
                  <span className="h-px flex-1 bg-gold/50" />
                </div>
              )}
              <Link
                href={hrefFor(a)}
                className={cn(
                  "group flex items-stretch gap-3 rounded-[10px] px-2 py-2 outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                  past && "opacity-55 hover:opacity-100",
                )}
              >
                <span className="tabular w-11 shrink-0 pt-0.5 text-[12.5px] font-medium text-foreground">{fmtTime(a.start)}</span>
                <span className="w-[3px] shrink-0 rounded-full" style={style.dot} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {category && (
                      <span className="text-[11px] font-medium uppercase tracking-[0.06em]" style={style.text}>
                        {category.name}
                      </span>
                    )}
                    {current && <span className="rounded-[4px] bg-gold-soft px-1 text-[10px] font-semibold text-gold-dark">AGORA</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13.5px] font-medium text-foreground">{a.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                    {[a.personName, processCode && `Processo ${processCode}`, a.area].filter(Boolean).join(" · ")}
                    {(a.personName || processCode || a.area) && <span className="text-subtle">·</span>}
                    {getUser(a.ownerId).firstName}
                  </span>
                </span>
                {a.location && (
                  <span className="hidden shrink-0 items-start gap-1 pt-0.5 text-[11.5px] text-subtle min-[1600px]:flex" title={a.location}>
                    <MapPin className="mt-px size-3" />
                    <span className="max-w-[88px] truncate">{a.location.split(" — ")[0]}</span>
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
