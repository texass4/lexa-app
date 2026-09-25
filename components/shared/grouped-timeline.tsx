"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { cn } from "cn"
import { fmtDayMonthParts, fmtTime, fmtDayLabel, parse, weekdayShort } from "@/lib/dates"

export interface TimelineEntry {
  id: string
  at: string
  title: React.ReactNode
  detail?: React.ReactNode
  icon: React.ReactNode
  href?: string
  emphasis?: boolean
}

/** Timeline editorial agrupada por dia, com data em destaque à esquerda. */
export function GroupedTimeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  const groups: { key: string; items: TimelineEntry[] }[] = []
  entries.forEach((e) => {
    const key = e.at.slice(0, 10)
    const g = groups.find((x) => x.key === key)
    if (g) g.items.push(e)
    else groups.push({ key, items: [e] })
  })

  return (
    <ol className={cn("relative", className)}>
      {groups.map((group, gi) => {
        const { day, month } = fmtDayMonthParts(group.key)
        const label = fmtDayLabel(group.key)
        const relative = label === "Hoje" || label === "Ontem" ? label : weekdayShort(parse(group.key).getDay())
        return (
          <motion.li
            key={group.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(gi * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-[56px_1fr] gap-x-4 sm:grid-cols-[76px_1fr] sm:gap-x-6"
          >
            <div className="relative pt-1 text-right">
              <div className="sticky top-20">
                <p className="font-serif text-[26px] leading-none text-foreground sm:text-[30px]">{day}</p>
                <p className="mt-1 text-[10.5px] font-semibold tracking-[0.14em] text-gold-dark">{month}</p>
                <p className="mt-0.5 text-[11px] capitalize text-subtle">{relative}</p>
              </div>
            </div>
            <ol className={cn("relative border-l border-border pl-6 sm:pl-7", gi === groups.length - 1 ? "pb-2" : "pb-8")}>
              {group.items.map((item) => {
                const body = (
                  <>
                    <p className="text-[13.5px] leading-snug text-foreground">{item.title}</p>
                    {item.detail && <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{item.detail}</p>}
                  </>
                )
                return (
                  <li key={item.id} className="relative pb-5 last:pb-0">
                    <span
                      className={cn(
                        "absolute top-0 -left-[39px] flex size-7 items-center justify-center rounded-full border bg-surface ring-4 ring-background sm:-left-[43px] [&_svg]:size-3.5",
                        item.emphasis ? "border-gold/50 text-gold-dark" : "border-border text-muted-foreground",
                      )}
                    >
                      {item.icon}
                    </span>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 pt-0.5">
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="block rounded-md outline-none hover:[&_p:first-child]:underline focus-visible:ring-2 focus-visible:ring-gold/40"
                          >
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </div>
                      <span className="tabular shrink-0 pt-1 text-[11.5px] text-subtle">{fmtTime(item.at)}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </motion.li>
        )
      })}
    </ol>
  )
}
