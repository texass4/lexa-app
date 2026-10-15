"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays, CalendarPlus, ChevronRight, Plus } from "lucide-react"
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
import { processNumberLabel } from "@/lib/processos/label"
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
  if (end <= now) return { label: "concluído", tone: "text-subtle" }
  if (start <= now) return { label: "agora", tone: "text-brand" }
  const minutes = (start.getTime() - now.getTime()) / 60_000
  return { label: fmtStartsIn(a.start, now), tone: minutes <= 60 ? "text-warning" : "text-subtle" }
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
      <header className="flex items-start justify-between gap-2 px-5 pt-5 sm:px-6">
        <h2 className="flex min-w-0 items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-foreground">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand">
            <CalendarDays className="size-[17px]" />
          </span>
          Agenda de hoje
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {editable && (
            <Button variant="ghost" size="icon-sm" aria-label="Novo compromisso" title="Novo compromisso" onClick={create}>
              <Plus />
            </Button>
          )}
          <PanelLink href="/agenda">
            Ver calendário<span className="max-sm:hidden"> completo</span>
          </PanelLink>
        </div>
      </header>
      <p className="pr-5 pl-[60px] text-[12.5px] text-muted-foreground sm:pl-[64px]">
        {summary ?? (isToday ? "Nenhum compromisso hoje" : "Nenhum compromisso neste dia")}
      </p>
      <ChipTabs
        ariaLabel="Dia da agenda"
        variant="solid"
        className="px-5 pt-4 pb-2 sm:px-6"
        value={day.value}
        onChange={setOffset}
        tabs={days.map((d) => ({ value: d.value, label: d.label, count: d.items.length }))}
      />

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pt-6 pb-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand ring-8 ring-brand-soft/40">
            <CalendarPlus className="size-6" strokeWidth={1.7} />
          </span>
          <p className="mt-5 text-[15px] font-semibold text-foreground">
            {isToday ? "Agenda livre hoje" : `Nada marcado para ${day.label.toLowerCase()}`}
          </p>
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
        <ol
          ref={listRef}
          aria-label={`Compromissos — ${day.label}`}
          className="relative flex-1 px-3 pb-3 thin-scrollbar sm:px-4 lg:max-h-[520px] lg:overflow-y-auto"
        >
          {items.map((a, i) => {
            const { category, style } = lookup(a.categoryId)
            const status = timing(a, now, isToday)
            const past = isToday && parse(a.end) <= now
            const owner = getUser(a.ownerId)
            const process = a.processId ? byId(data.processes, a.processId) : undefined
            const client = a.clientId ? byId(data.clients, a.clientId) : process ? byId(data.clients, process.clientId) : undefined
            const record = process ? `Processo ${processNumberLabel(process)}` : client ? `Cliente: ${client.name}` : undefined
            const secondary = [a.location, a.personName && !client ? `com ${a.personName}` : undefined, record].filter(Boolean).join(" • ")
            const color = String(style.dot.backgroundColor)
            const first = i === 0
            const last = i === items.length - 1
            return (
              <li key={a.id} data-now={i === nowIndex ? "" : undefined}>
                {i === nowIndex && (
                  <div
                    className="grid grid-cols-[48px_16px_minmax(0,1fr)] items-center gap-x-3 px-2 py-1"
                    aria-label={`Agora, ${fmtTime(toLocalISO(now))}`}
                  >
                    <span className="tabular text-[11.5px] font-semibold text-brand">{fmtTime(toLocalISO(now))}</span>
                    <span className="flex justify-center">
                      <span className="size-2 rounded-full bg-brand ring-4 ring-brand/15" />
                    </span>
                    <span className="h-px bg-brand/50" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelected(a)}
                  className={cn(
                    "group grid w-full grid-cols-[48px_16px_36px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[10px] px-2 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40",
                    past && "opacity-60 hover:opacity-100",
                  )}
                >
                  {/* Horário (e a situação, no dia de hoje) */}
                  <span className="self-start pt-1">
                    <span className="tabular block text-[13px] leading-none font-semibold text-foreground">{fmtTime(a.start)}</span>
                    {status && <span className={cn("mt-1 block text-[10.5px] font-semibold whitespace-nowrap", status.tone)}>{status.label}</span>}
                  </span>
                  {/* Trilho contínuo, na cor da categoria */}
                  <span aria-hidden className="relative flex justify-center self-stretch">
                    <span
                      className={cn("absolute w-[2px] rounded-full", first ? "top-1/2" : "-top-2.5", last ? "bottom-1/2" : "-bottom-2.5")}
                      style={{ backgroundColor: color, opacity: 0.45 }}
                    />
                    <span className="relative my-auto size-2.5 rounded-full ring-[3px] ring-card" style={{ backgroundColor: color }} />
                  </span>
                  {/* Responsável */}
                  <span title={`Responsável: ${owner.name}`}>
                    <UserAvatar name={owner.name} src={owner.avatarUrl} className="size-9 text-[11.5px]" />
                  </span>
                  {/* O que é */}
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] leading-snug font-semibold text-foreground">{a.title}</span>
                    {secondary && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{secondary}</span>}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="hidden rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap sm:inline-block"
                      style={{ ...style.soft, ...style.text }}
                    >
                      {category?.name ?? "Compromisso"}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      aria-hidden
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <AppointmentDetail appointment={selected} onClose={() => setSelected(undefined)} />
    </Panel>
  )
}
