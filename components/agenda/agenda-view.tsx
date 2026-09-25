"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { TimeGrid } from "./time-grid"
import { MonthGrid } from "./month-grid"
import { AgendaList } from "./agenda-list"
import { AppointmentDetail } from "./appointment-detail"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { categoryStyle } from "@/lib/config"
import { addDays, addMonths, getNow, isSameDay, monthName, monthShort, parse, startOfDay, startOfWeek, weekdayName } from "@/lib/dates"
import { currentUserId } from "@/lib/account"
import type { Appointment } from "@/types"
import { useSession } from "@/lib/auth/session"

type View = "dia" | "semana" | "mes"

/** Chave da legenda para compromissos sem categoria (ou de categoria excluída). */
const NONE = "__sem_categoria__"

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function AgendaView() {
  const data = useDemoData()
  const { openDialog } = useUI()
  const { can } = useSession()
  const editable = can("agenda.edit")
  const ready = data.hydrated
  const [view, setView] = React.useState<View>("semana")
  const [anchor, setAnchor] = React.useState(() => startOfDay(getNow()))
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const [onlyMine, setOnlyMine] = React.useState(false)
  const [selected, setSelected] = React.useState<Appointment | undefined>()
  const [direction, setDirection] = React.useState(0)

  const categoryIds = React.useMemo(() => new Set(data.appointmentCategories.map((c) => c.id)), [data.appointmentCategories])
  const legendKey = (a: Appointment) => (a.categoryId && categoryIds.has(a.categoryId) ? a.categoryId : NONE)
  const events = data.appointments.filter((a) => !hidden.has(legendKey(a)) && (!onlyMine || a.ownerId === currentUserId()))

  const weekStart = startOfWeek(anchor)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const move = (dir: number) => {
    setDirection(dir)
    setAnchor((a) => (view === "dia" ? addDays(a, dir) : view === "semana" ? addDays(a, dir * 7) : addMonths(a, dir)))
  }

  const title =
    view === "mes"
      ? `${cap(monthName(anchor.getMonth()))} ${anchor.getFullYear()}`
      : view === "semana"
        ? weekDays[0].getMonth() === weekDays[6].getMonth()
          ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} de ${monthName(weekDays[6].getMonth())}`
          : `${weekDays[0].getDate()} ${monthShort(weekDays[0].getMonth())} – ${weekDays[6].getDate()} ${monthShort(weekDays[6].getMonth())}`
        : `${cap(weekdayName(anchor.getDay()))}, ${anchor.getDate()} de ${monthName(anchor.getMonth())}`

  const rangeEvents = events.filter((e) => {
    const d = parse(e.start)
    if (view === "dia") return isSameDay(d, anchor)
    if (view === "semana") return d >= weekStart && d < addDays(weekStart, 7)
    return d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear()
  })

  const isCurrent =
    view === "dia"
      ? isSameDay(anchor, getNow())
      : view === "semana"
        ? isSameDay(weekStart, startOfWeek(getNow()))
        : anchor.getMonth() === getNow().getMonth()

  const processCode = (id?: string) => data.processes.find((p) => p.id === id)?.code

  const toggleType = (t: string) =>
    setHidden((s) => {
      const n = new Set(s)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })

  // Legenda: categorias do escritório + "Sem categoria" quando houver compromisso assim.
  const legend = [
    ...data.appointmentCategories.map((c) => ({ key: c.id, name: c.name, color: c.color })),
    ...(data.appointments.some((a) => legendKey(a) === NONE) ? [{ key: NONE, name: "Sem categoria", color: undefined }] : []),
  ]

  const create = (iso?: string) =>
    openDialog("appointment", {
      date: (iso ?? `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`).slice(
        0,
        10,
      ),
    })

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.01em] sm:text-[34px]">Agenda</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">Compromissos e prazos do escritório.</p>
        </div>
        {editable && (
          <Button onClick={() => create()}>
            <Plus /> Novo compromisso
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-[9px] border border-border bg-surface shadow-xs">
            <button
              type="button"
              aria-label="Período anterior"
              onClick={() => move(-1)}
              className="flex size-8 items-center justify-center rounded-l-[8px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="h-4 w-px bg-border" />
            <button
              type="button"
              aria-label="Próximo período"
              onClick={() => move(1)}
              className="flex size-8 items-center justify-center rounded-r-[8px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={isCurrent}
            onClick={() => {
              setDirection(0)
              setAnchor(startOfDay(getNow()))
            }}
          >
            Hoje
          </Button>
          <h2 className="ml-1 truncate text-[15px] font-semibold tracking-[-0.01em]" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={onlyMine}
            onClick={() => setOnlyMine((v) => !v)}
            className={cn(
              "h-8 rounded-[9px] border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
              onlyMine ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            Somente meus
          </button>
          <FilterTabs
            ariaLabel="Visualização"
            layoutId="agenda-view"
            value={view}
            onChange={(v) => {
              setDirection(0)
              setView(v)
            }}
            className="mx-0 px-0"
            options={[
              { value: "dia", label: "Dia" },
              { value: "semana", label: "Semana" },
              { value: "mes", label: "Mês" },
            ]}
          />
        </div>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Categorias">
        {legend.map((item) => {
          const off = hidden.has(item.key)
          const count = rangeEvents.filter((e) => legendKey(e) === item.key).length
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={!off}
              onClick={() => toggleType(item.key)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-gold/40",
                off ? "border-dashed border-border-strong text-subtle" : "border-border bg-surface text-foreground shadow-xs",
              )}
            >
              <span className={cn("size-2 rounded-full transition-opacity", off && "opacity-30")} style={categoryStyle(item.color).dot} />
              {item.name}
              {!off && <span className="tabular text-[11px] text-subtle">{count}</span>}
            </button>
          )
        })}
      </div>

      {!ready ? (
        <Skeleton className="h-[560px] w-full rounded-[14px]" />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view}-${anchor.toDateString()}-${view === "semana" ? weekStart.toDateString() : ""}`}
            initial={{ opacity: 0, x: direction * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -16 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "semana" && (
              <>
                <div className="hidden md:block">
                  <TimeGrid
                    days={weekDays}
                    events={events}
                    onSelect={setSelected}
                    onCreate={editable ? create : undefined}
                    processCode={processCode}
                  />
                </div>
                <div className="md:hidden">
                  <AgendaList days={weekDays} events={events} onSelect={setSelected} />
                </div>
              </>
            )}
            {view === "dia" && (
              <TimeGrid days={[anchor]} events={events} onSelect={setSelected} onCreate={editable ? create : undefined} processCode={processCode} />
            )}
            {view === "mes" && (
              <MonthGrid
                anchor={anchor}
                events={events}
                onSelect={setSelected}
                onDayClick={(d) => {
                  setDirection(0)
                  setAnchor(startOfDay(d))
                  setView("dia")
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <AppointmentDetail appointment={selected} onClose={() => setSelected(undefined)} />
    </div>
  )
}
