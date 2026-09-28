"use client"

import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import { todaysAppointments } from "@/lib/selectors"
import { addDays, fmtFullDate, fmtStartsIn, fmtTime, getNow, parse, startOfDay } from "@/lib/dates"
import { officeContext } from "@/components/ai/ai-context"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useCategoryLookup } from "./use-category"

/**
 * "O que tenho para fazer?" antes do calendário: o que resta hoje, o próximo
 * compromisso e com quem ele está ligado. Tudo dos compromissos cadastrados.
 */
export function AgendaToday() {
  const data = useDemoData()
  const { can } = useSession()
  const lexa = useLexaAI()
  const lookup = useCategoryLookup()
  const now = getNow()
  const remaining = todaysAppointments(data).filter((a) => parse(a.end) > now)
  const next = remaining[0]
  const weekEnd = addDays(startOfDay(now), 7)
  const linkedThisWeek = data.appointments.filter((a) => parse(a.start) >= now && parse(a.start) < weekEnd && (a.processId || a.clientId)).length
  const client = next?.clientId ? data.clients.find((c) => c.id === next.clientId) : undefined
  const process = next?.processId ? data.processes.find((p) => p.id === next.processId) : undefined
  const category = next ? lookup(next.categoryId) : undefined

  return (
    <section
      aria-label="Hoje"
      className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-4 shadow-card sm:p-5 lg:flex-row lg:items-center"
    >
      <div className="min-w-0 lg:w-[240px] lg:shrink-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-gold-dark">Hoje</p>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">{fmtFullDate(now)}</p>
        <p className="mt-2 text-[15px] font-semibold text-foreground">
          {remaining.length === 0
            ? "Agenda livre pelo resto do dia"
            : remaining.length === 1
              ? "1 compromisso restante"
              : `${remaining.length} compromissos restantes`}
        </p>
      </div>

      <div className="min-w-0 flex-1 lg:border-l lg:border-border lg:pl-5">
        {next ? (
          <div className="flex items-start gap-3">
            <span className="mt-1 h-10 w-[3px] shrink-0 rounded-full" style={category?.style.dot} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted-foreground">
                Próximo · <span className="tabular font-medium text-foreground">{fmtTime(next.start)}</span> ({fmtStartsIn(next.start, now)})
                {category?.category && <> · {category.category.name}</>}
              </p>
              <p className="mt-0.5 truncate text-[14px] font-medium text-foreground">{next.title}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                {client && can("clients.view") && (
                  <Link
                    href={`/clientes/${client.id}`}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {client.name} <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
                {process && can("processes.view") && (
                  <Link
                    href={`/processos/${process.id}`}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Processo {process.code} <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
                {next.location && <span className="truncate text-subtle">{next.location}</span>}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {linkedThisWeek
              ? `${linkedThisWeek} compromisso${linkedThisWeek > 1 ? "s" : ""} nos próximos 7 dias ligado${linkedThisWeek > 1 ? "s" : ""} a clientes ou processos.`
              : "Nenhum compromisso restante hoje. Use a semana abaixo para planejar."}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => lexa.ask("Quais compromissos exigem preparação?", officeContext("agenda"))}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-[9px] border border-gold/25 bg-gold-soft/60 px-3 text-[12.5px] font-medium text-gold-dark outline-none transition-[border-color,background-color] hover:border-gold/50 hover:bg-gold-soft focus-visible:ring-2 focus-visible:ring-gold/40 lg:self-center"
      >
        <Sparkles className="size-3.5" /> O que exige preparação?
      </button>
    </section>
  )
}
