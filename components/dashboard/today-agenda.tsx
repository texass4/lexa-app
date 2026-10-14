"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarDays, CalendarPlus, MapPin, Plus, UserRound } from "lucide-react"
import { cn } from "cn"
import { Panel } from "@/components/ui/panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { todaysAppointments } from "@/lib/store/selectors"
import { useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { PanelLink } from "./panel-link"
import { ChipTabs } from "./chip-tabs"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { AppointmentDetail } from "@/components/agenda/appointment-detail"
import { addDays, fmtStartsIn, fmtTime, getNow, parse, startOfDay, toLocalISO, weekdayShort } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { processSubject, processTitle } from "@/lib/processos/label"
import type { Appointment } from "@/types"

/** Hoje e os próximos dias: a agenda do Início olha só para a frente. */
const DAYS = 5

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function dayLabel(offset: number, date: Date) {
  if (offset === 0) return "Hoje"
  if (offset === 1) return "Amanhã"
  const wd = weekdayShort(date.getDay())
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${date.getDate()}`
}

/** Situação do compromisso em relação a agora: só no dia de hoje. */
function timing(a: Appointment, now: Date, isToday: boolean) {
  if (!isToday) return undefined
  const start = parse(a.start)
  const end = parse(a.end)
  if (end <= now) return { label: "Concluído", cls: "bg-surface-muted text-muted-foreground" }
  if (start <= now) return { label: "Agora", cls: "bg-brand text-brand-foreground" }
  const minutes = (start.getTime() - now.getTime()) / 60_000
  return { label: fmtStartsIn(a.start, now), cls: minutes <= 60 ? "bg-warning-soft text-warning" : "bg-surface-muted text-muted-foreground" }
}

/**
 * A agenda como área principal do Início: uma linha do tempo por dia, com horário,
 * tipo, responsável, com quem, onde e o registro ligado (cliente ou processo).
 * Só compromissos cadastrados — o dia vazio aparece como vazio.
 */
export function TodayAgenda() {
  const data = useOfficeData()
  const lookup = useCategoryLookup()
  const { openDialog } = useUI()
  const editable = useSession().can("agenda.edit")
  const now = getNow()
  const [offset, setOffset] = React.useState("0")
  const [selected, setSelected] = React.useState<Appointment>()
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(startOfDay(now), i)
    return { value: String(i), date, label: dayLabel(i, date), items: todaysAppointments(data, date) }
  })
  const day = days[Number(offset)] ?? days[0]
  const items = day.items
  const isToday = day.value === "0"
  const nowIndex = isToday ? items.findIndex((a) => parse(a.start) > now) : -1
  const remaining = isToday ? items.filter((a) => parse(a.end) > now).length : items.length
  const listRef = React.useRef<HTMLOListElement>(null)
  const create = () => openDialog("appointment", { date: ymd(day.date) })

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-now]")
    if (el && listRef.current) listRef.current.scrollTop = Math.max(0, el.offsetTop - 96)
  }, [offset])

  const summary = !items.length
    ? undefined
    : isToday
      ? remaining
        ? `${remaining} de ${items.length} compromisso${items.length > 1 ? "s" : ""} pela frente`
        : `${items.length} compromisso${items.length > 1 ? "s" : ""} hoje · todos encerrados`
      : `${items.length} compromisso${items.length > 1 ? "s" : ""}`

  return (
    <Panel className="flex flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-foreground">
            <CalendarDays className="size-[18px] text-brand" /> Agenda do escritório
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{summary ?? (isToday ? "Nenhum compromisso hoje" : "Nenhum compromisso neste dia")}</p>
        </div>
        <div className="flex items-center gap-1">
          {editable && (
            <Button variant="ghost" size="icon-sm" aria-label="Novo compromisso" title="Novo compromisso" onClick={create}>
              <Plus />
            </Button>
          )}
          <PanelLink href="/agenda">Abrir agenda</PanelLink>
        </div>
      </header>
      <ChipTabs
        ariaLabel="Dia da agenda"
        className="px-5 pt-4 pb-3 sm:px-6"
        value={day.value}
        onChange={setOffset}
        tabs={days.map((d) => ({ value: d.value, label: d.label, count: d.items.length }))}
      />

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pt-6 pb-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand ring-8 ring-brand-soft/40">
            <CalendarPlus className="size-6" strokeWidth={1.7} />
          </span>
          <p className="mt-5 text-[15px] font-semibold text-foreground">{isToday ? "Agenda livre hoje" : `Nada marcado para ${day.label.toLowerCase()}`}</p>
          <p className="mt-1.5 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">
            Audiências, reuniões e atendimentos aparecem aqui em ordem de horário, com o responsável e o processo ligado.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {editable && (
              <Button size="sm" onClick={create}>
                <Plus /> Novo compromisso
              </Button>
            )}
            <Link href="/agenda" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Ver a semana
            </Link>
          </div>
        </div>
      ) : (
        <ol ref={listRef} aria-label={`Compromissos — ${day.label}`} className="relative flex-1 px-3 pb-4 thin-scrollbar sm:px-4 lg:max-h-[560px] lg:overflow-y-auto">
          {items.map((a, i) => {
            const { category, style } = lookup(a.categoryId)
            const status = timing(a, now, isToday)
            const past = isToday && parse(a.end) <= now
            const owner = getUser(a.ownerId)
            const process = a.processId ? byId(data.processes, a.processId) : undefined
            const client = a.clientId ? byId(data.clients, a.clientId) : process ? byId(data.clients, process.clientId) : undefined
            const record = process
              ? { href: `/processos/${process.id}`, label: client ? `${client.name} — ${processSubject(process)}` : processTitle(process), kind: "processo" }
              : client
                ? { href: `/clientes/${client.id}`, label: client.name, kind: "cliente" }
                : undefined
            const last = i === items.length - 1
            return (
              <li key={a.id} data-now={i === nowIndex ? "" : undefined}>
                {i === nowIndex && (
                  <div className="grid grid-cols-[56px_24px_minmax(0,1fr)] items-center gap-x-3 px-2 py-1.5" aria-label={`Agora, ${fmtTime(toLocalISO(now))}`}>
                    <span className="tabular text-right text-[11.5px] font-semibold text-brand">{fmtTime(toLocalISO(now))}</span>
                    <span className="flex justify-center">
                      <span className="size-2.5 rounded-full bg-brand ring-4 ring-brand/15" />
                    </span>
                    <span className="h-px bg-brand/60" />
                  </div>
                )}
                <div className={cn("group grid grid-cols-[56px_24px_minmax(0,1fr)] gap-x-3 px-2", past && "opacity-60 hover:opacity-100")}>
                  {/* Horário */}
                  <div className="pt-3.5 text-right">
                    <p className="tabular text-[14px] leading-none font-semibold text-foreground">{fmtTime(a.start)}</p>
                    <p className="tabular mt-1.5 text-[11.5px] text-subtle">{fmtTime(a.end)}</p>
                  </div>
                  {/* Trilho: marcador na cor da categoria e a linha até o próximo */}
                  <div aria-hidden className="relative flex justify-center">
                    <span className={cn("absolute top-0 w-px bg-border", i === 0 ? "top-4" : "", last ? "h-4" : "bottom-0")} />
                    <span className="relative mt-3.5 size-3 rounded-full ring-4 ring-card" style={style.dot} />
                  </div>
                  {/* Evento */}
                  <div className="min-w-0 pb-2">
                    <button
                      type="button"
                      onClick={() => setSelected(a)}
                      className="mt-1.5 w-full rounded-[10px] border border-border/80 bg-surface px-3.5 py-3 text-left outline-none transition-[border-color,box-shadow,background-color] hover:border-border-strong hover:shadow-card focus-visible:ring-2 focus-visible:ring-brand/40"
                      style={{ borderLeft: `3px solid ${String(style.dot.backgroundColor)}` }}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-[14px] leading-snug font-semibold text-foreground">{a.title}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 font-medium" style={style.text}>
                              <span aria-hidden className="size-1.5 rounded-full" style={style.dot} />
                              {category?.name ?? "Sem categoria"}
                            </span>
                            {a.location && (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <MapPin className="size-3.5 shrink-0 text-subtle" />
                                <span className="truncate">{a.location}</span>
                              </span>
                            )}
                          </span>
                        </span>
                        {status && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", status.cls)}>{status.label}</span>}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
                          <span className="inline-flex items-center gap-2 text-foreground" title={`Responsável: ${owner.name}`}>
                            <UserAvatar name={owner.name} src={owner.avatarUrl} size="sm" />
                            {owner.firstName}
                          </span>
                          {a.personName && (
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground" title={`Com ${a.personName}`}>
                              <UserRound className="size-3.5 shrink-0 text-subtle" />
                              <span className="truncate">com {a.personName}</span>
                            </span>
                          )}
                        </span>
                        {record && <span className="min-w-0 truncate text-[12px] text-muted-foreground">{record.label}</span>}
                      </span>
                    </button>
                    {record && (
                      <Link
                        href={record.href}
                        className="mt-1 ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-medium text-brand-strong opacity-80 outline-none hover:opacity-100 hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        Abrir {record.kind} <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <AppointmentDetail appointment={selected} onClose={() => setSelected(undefined)} />
    </Panel>
  )
}
