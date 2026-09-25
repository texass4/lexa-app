"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getNow, fmtTime, greeting, parse } from "@/lib/dates"
import { getUser, CURRENT_USER_ID } from "@/lib/account"
import { useDemoData } from "@/lib/store/demo-store"
import { todaysAppointments } from "@/lib/selectors"

export function Greeting() {
  const data = useDemoData()
  const user = getUser(CURRENT_USER_ID)
  const next = todaysAppointments(data).find((a) => parse(a.start) > getNow())
  const minutes = next ? Math.round((parse(next.start).getTime() - getNow().getTime()) / 60000) : 0

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.01em] text-foreground sm:text-[42px]">
          {greeting()}, {user.firstName}.
        </h1>
        <p className="mt-2.5 text-[14.5px] text-muted-foreground">Aqui está o que está acontecendo no escritório hoje.</p>
      </div>
      {next && (
        <Link
          href="/agenda"
          className="group flex max-w-full items-center gap-3 self-start rounded-[12px] border border-border bg-card py-2.5 pr-3 pl-3.5 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40 lg:self-auto"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex size-2 rounded-full bg-gold" />
          </span>
          <span className="min-w-0 text-[13px]">
            <span className="text-muted-foreground">Próximo · em {minutes} min</span>
            <span className="block truncate font-medium text-foreground">
              {next.title}
              {next.personName && next.personName !== next.title ? ` com ${next.personName}` : ""} às {fmtTime(next.start)}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      )}
    </div>
  )
}
