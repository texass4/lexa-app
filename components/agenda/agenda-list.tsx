"use client"

import { cn } from "cn"
import { useCategoryLookup } from "./use-category"
import { getNow, fmtTime, isSameDay, parse, weekdayName } from "@/lib/dates"
import { getUser } from "@/lib/account"
import type { Appointment } from "@/types"

/** Lista por dia usada na visão semanal em telas pequenas. */
export function AgendaList({ days, events, onSelect }: { days: Date[]; events: Appointment[]; onSelect: (a: Appointment) => void }) {
  const lookup = useCategoryLookup()
  return (
    <div className="space-y-5">
      {days.map((d) => {
        const items = events.filter((e) => isSameDay(parse(e.start), d)).sort((a, b) => a.start.localeCompare(b.start))
        const today = isSameDay(d, getNow())
        return (
          <section key={d.toISOString()}>
            <header className="mb-2 flex items-center gap-2.5 px-1">
              <span
                className={cn(
                  "tabular flex size-8 items-center justify-center rounded-full text-[14px] font-semibold",
                  today ? "bg-foreground text-background" : "bg-surface-muted text-foreground",
                )}
              >
                {d.getDate()}
              </span>
              <span className="text-[13px] font-semibold capitalize">{today ? "Hoje" : weekdayName(d.getDay())}</span>
              <span className="text-[12px] text-subtle">{items.length ? `${items.length} compromissos` : "Livre"}</span>
            </header>
            {items.length > 0 && (
              <ul className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
                {items.map((a) => {
                  const { category, style } = lookup(a.categoryId)
                  return (
                    <li key={a.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left outline-none active:bg-accent/60",
                          parse(a.end) < getNow() && "opacity-60",
                        )}
                      >
                        <span className="tabular w-11 shrink-0 text-[12.5px] font-medium">{fmtTime(a.start)}</span>
                        <span className="h-9 w-[3px] shrink-0 rounded-full" style={style.dot} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{a.personName ?? a.title}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {category ? `${category.name} · ` : ""}
                            {a.title !== a.personName ? `${a.title} · ` : ""}
                            {getUser(a.ownerId).firstName}
                          </span>
                        </span>
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
