"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { TimeGrid } from "./time-grid"
import { MonthGrid } from "./month-grid"
import { AgendaList } from "./agenda-list"
import { AppointmentDetail } from "./appointment-detail"
import { AgendaAside } from "./agenda-aside"
import { AgendaSidebar, type SidebarLegendItem } from "./agenda-sidebar"
import { MiniCalendar } from "./mini-calendar"
import { useAgendaView, useAsidePref, useColorBy, useLayers, type AgendaView as View } from "./agenda-prefs"
import { useEventColor } from "./use-event-color"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useAppointmentsRange } from "@/lib/store/on-demand"
import { atMinutes, dayItems, fmtSlot, moveAppointment, moveToDay, participantsOf, type DayItem } from "@/lib/agenda/agenda"
import { useUI } from "@/lib/store/ui-store"
import { categoryStyle } from "@/lib/core/config"
import {
  addDays,
  addMonths,
  getNow,
  isSameDay,
  monthName,
  monthShort,
  parse,
  startOfDay,
  startOfWeek,
  toLocalISO,
  weekdayName,
} from "@/lib/core/dates"
import { currentUserId, getMembers } from "@/lib/auth/account"
import type { Appointment } from "@/types"
import { useSession } from "@/lib/auth/session"
import { processTitle } from "@/lib/processos/label"

/** Chave da legenda para compromissos sem categoria (ou de categoria excluída). */
const NONE = "__sem_categoria__"
/** A visão Lista mostra este tanto de dias a partir do dia em foco. */
const LIST_DAYS = 14

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const ymd = (d: Date) => toLocalISO(d).slice(0, 10)

/** Teclas de atalho não valem enquanto se digita ou há uma janela aberta. */
function typingOrDialog(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (el?.isContentEditable || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT") return true
  // Caixas de seleção e botões não recebem texto: as teclas continuam valendo depois de clicar num filtro.
  if (el?.tagName === "INPUT" && !/^(checkbox|radio|button|range)$/.test((el as HTMLInputElement).type)) return true
  return !!document.querySelector('[role="dialog"], [role="menu"], [data-slot="popover-content"]')
}

export function AgendaView() {
  const data = useOfficeData()
  const { updateAppointment, versionOf } = useOfficeActions()
  const { openDialog } = useUI()
  const { can } = useSession()
  const editable = can("agenda.edit")
  const canSeeDeadlines = can("processes.view")
  const canSeeTasks = can("tasks.view")
  const [view, setView] = useAgendaView()
  const [colorBy, setColorBy] = useColorBy()
  const [asidePref, setAsidePref] = useAsidePref()
  const layers = useLayers()
  const colorOf = useEventColor(colorBy)
  const [anchor, setAnchor] = React.useState(() => startOfDay(getNow()))
  // A abertura traz os compromissos a partir de 45 dias atrás; meses anteriores vêm quando a Agenda chega neles.
  const monthEnd = addDays(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1), 8)
  const listEnd = addDays(anchor, LIST_DAYS + 1)
  const periodReady = useAppointmentsRange(
    ymd(addDays(new Date(anchor.getFullYear(), anchor.getMonth(), 1), -7)),
    ymd(listEnd > monthEnd ? listEnd : monthEnd),
  )
  const ready = data.hydrated && periodReady
  const [hiddenCategories, setHiddenCategories] = React.useState<Set<string>>(new Set())
  const [hiddenPeople, setHiddenPeople] = React.useState<Set<string>>(new Set())
  const [onlyMine, setOnlyMine] = React.useState(false)
  const [selected, setSelected] = React.useState<Appointment | undefined>()
  const [direction, setDirection] = React.useState(0)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const categoryIds = React.useMemo(() => new Set(data.appointmentCategories.map((c) => c.id)), [data.appointmentCategories])
  const legendKey = React.useCallback(
    (a: Pick<Appointment, "categoryId">) => (a.categoryId && categoryIds.has(a.categoryId) ? a.categoryId : NONE),
    [categoryIds],
  )

  /** Pessoas: com "somente meus", só quem está no compromisso; senão, esconde o que só tem pessoas desmarcadas. */
  const passPeople = React.useCallback(
    (ids: string[]) => (onlyMine ? ids.includes(currentUserId()) : hiddenPeople.size === 0 || ids.some((id) => !hiddenPeople.has(id))),
    [onlyMine, hiddenPeople],
  )
  const passCategory = React.useCallback((a: Pick<Appointment, "categoryId">) => !hiddenCategories.has(legendKey(a)), [hiddenCategories, legendKey])
  const visible = React.useCallback((a: Appointment) => passCategory(a) && passPeople(participantsOf(a)), [passCategory, passPeople])
  const events = data.appointments.filter(visible)

  const weekStart = startOfWeek(anchor)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const listDays = Array.from({ length: LIST_DAYS }, (_, i) => addDays(anchor, i))

  const move = React.useCallback(
    (dir: number) => {
      setDirection(dir)
      setAnchor((a) =>
        view === "dia"
          ? addDays(a, dir)
          : view === "semana"
            ? addDays(a, dir * 7)
            : view === "lista"
              ? addDays(a, dir * LIST_DAYS)
              : addMonths(a, dir),
      )
    },
    [view],
  )
  const goToday = React.useCallback(() => {
    setDirection(0)
    setAnchor(startOfDay(getNow()))
  }, [])

  const title =
    view === "mes"
      ? `${cap(monthName(anchor.getMonth()))} ${anchor.getFullYear()}`
      : view === "semana"
        ? weekDays[0].getMonth() === weekDays[6].getMonth()
          ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} de ${monthName(weekDays[6].getMonth())}`
          : `${weekDays[0].getDate()} ${monthShort(weekDays[0].getMonth())} – ${weekDays[6].getDate()} ${monthShort(weekDays[6].getMonth())}`
        : view === "lista"
          ? `${anchor.getDate()} ${monthShort(anchor.getMonth())} – ${listDays[LIST_DAYS - 1].getDate()} ${monthShort(listDays[LIST_DAYS - 1].getMonth())}`
          : `${cap(weekdayName(anchor.getDay()))}, ${anchor.getDate()} de ${monthName(anchor.getMonth())}`

  const range =
    view === "dia"
      ? { start: anchor, end: addDays(anchor, 1) }
      : view === "semana"
        ? { start: weekStart, end: addDays(weekStart, 7) }
        : view === "lista"
          ? { start: anchor, end: addDays(anchor, LIST_DAYS) }
          : { start: new Date(anchor.getFullYear(), anchor.getMonth(), 1), end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) }

  const inRange = (a: Pick<Appointment, "start">) => {
    const d = parse(a.start)
    return d >= range.start && d < range.end
  }

  const isCurrent =
    view === "mes"
      ? anchor.getMonth() === getNow().getMonth() && anchor.getFullYear() === getNow().getFullYear()
      : range.start <= getNow() && getNow() < range.end && (view !== "lista" || isSameDay(anchor, getNow()))

  /** Prazos e tarefas do período (camadas ligadas, com os mesmos filtros de pessoa). */
  const gridStart = view === "mes" ? startOfWeek(range.start) : range.start
  const gridEnd = view === "mes" ? addDays(startOfWeek(range.start), 42) : range.end
  const items: DayItem[] =
    layers.prazos || layers.tarefas
      ? dayItems(
          layers.prazos && canSeeDeadlines ? data.deadlines : [],
          layers.tarefas && canSeeTasks ? data.tasks : [],
          ymd(gridStart),
          ymd(addDays(gridEnd, -1)),
        ).filter((i) => passPeople([i.userId]))
      : []
  const canOpenItem = React.useCallback((item: DayItem) => (item.kind === "prazo" ? canSeeDeadlines : canSeeTasks), [canSeeDeadlines, canSeeTasks])

  /** "João da Silva — Ação de cobrança" no bloco do compromisso (nunca só o número). */
  const processLabel = (id?: string) => {
    const process = byId(data.processes, id)
    return process ? processTitle(process, byId(data.clients, process.clientId)?.name) : undefined
  }

  /** Arrastar ou esticar na agenda: grava o novo horário e oferece desfazer. */
  const reschedule = async (a: Appointment, next: { start: string; end: string }) => {
    if (next.start === a.start && next.end === a.end) return
    const result = await updateAppointment(a.id, next, { baseVersion: versionOf("appointments", a.id) })
    if (result.status !== "saved") return
    toast.success(next.start === a.start ? "Término alterado." : "Compromisso remarcado.", {
      description:
        next.start === a.start ? `${a.title} — até ${next.end.slice(11, 16)}` : `${a.title} — ${fmtSlot(a.start)} → ${fmtSlot(next.start)}`,
      action: {
        label: "Desfazer",
        onClick: () => void updateAppointment(a.id, { start: a.start, end: a.end }, { baseVersion: versionOf("appointments", a.id) }),
      },
    })
  }
  const moveInGrid = editable ? (a: Appointment, date: string, startMin: number) => reschedule(a, moveAppointment(a, date, startMin)) : undefined
  const moveInMonth = editable ? (a: Appointment, date: string) => reschedule(a, moveToDay(a, date)) : undefined
  const resizeInGrid = editable
    ? (a: Appointment, endMin: number) => reschedule(a, { start: a.start, end: atMinutes(a.start.slice(0, 10), Math.min(endMin, 24 * 60 - 1)) })
    : undefined

  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  // Legenda: categorias do escritório + "Sem categoria" quando houver compromisso assim. Contagem do período, respeitando as pessoas.
  const periodEvents = data.appointments.filter((a) => inRange(a) && passPeople(participantsOf(a)))
  const legend: SidebarLegendItem[] = [
    ...data.appointmentCategories.map((c) => ({
      key: c.id,
      name: c.name,
      color: c.color,
      count: periodEvents.filter((e) => legendKey(e) === c.id).length,
    })),
    ...(data.appointments.some((a) => legendKey(a) === NONE)
      ? [{ key: NONE, name: "Sem categoria", color: undefined, count: periodEvents.filter((e) => legendKey(e) === NONE).length }]
      : []),
  ]
  const peopleCounts = getMembers().map((m) => ({
    id: m.id,
    count: data.appointments.filter((a) => inRange(a) && passCategory(a) && participantsOf(a).includes(m.id)).length,
  }))

  /** Sem `iso`: o dia em foco, no horário padrão. Com `iso` de um horário da grade: data e hora clicadas. */
  const create = React.useCallback(
    (iso?: string) =>
      openDialog("appointment", {
        date: (iso ?? ymd(anchor)).slice(0, 10),
        time: iso && iso.length >= 16 ? iso.slice(11, 16) : undefined,
      }),
    [openDialog, anchor],
  )

  const changeView = React.useCallback(
    (v: View) => {
      setDirection(0)
      setView(v)
    },
    [setView],
  )

  // Atalhos: T hoje, D/S/M/L visões, N novo, setas para navegar.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingOrDialog(e.target)) return
      const key = e.key.toLowerCase()
      if (key === "t") goToday()
      else if (key === "d") changeView("dia")
      else if (key === "s") changeView("semana")
      else if (key === "m") changeView("mes")
      else if (key === "l") changeView("lista")
      else if (key === "n" && editable) create()
      else if (e.key === "ArrowLeft") move(-1)
      else if (e.key === "ArrowRight") move(1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goToday, changeView, create, editable, move])

  const asideClass = asidePref === "aberto" ? "@6xl/main:block" : asidePref === "" ? "@7xl/main:block" : ""
  const columns =
    asidePref === "aberto"
      ? "@5xl/main:grid-cols-[232px_minmax(0,1fr)] @6xl/main:grid-cols-[232px_minmax(0,1fr)_272px]"
      : asidePref === ""
        ? "@5xl/main:grid-cols-[232px_minmax(0,1fr)] @7xl/main:grid-cols-[232px_minmax(0,1fr)_272px]"
        : "@5xl/main:grid-cols-[232px_minmax(0,1fr)]"

  const navButton =
    "touch-target relative flex h-9 w-9 items-center justify-center text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"

  return (
    <div className={cn("grid gap-6", columns)}>
      <AgendaSidebar
        selected={anchor}
        rangeStart={range.start}
        rangeEnd={range.end}
        visible={visible}
        onPick={(d) => {
          setDirection(0)
          setAnchor(startOfDay(d))
        }}
        onlyMine={onlyMine}
        onOnlyMine={() => setOnlyMine((v) => !v)}
        people={peopleCounts}
        hiddenPeople={hiddenPeople}
        onTogglePerson={(id) => setHiddenPeople((s) => toggleIn(s, id))}
        legend={legend}
        hiddenCategories={hiddenCategories}
        onToggleCategory={(key) => setHiddenCategories((s) => toggleIn(s, key))}
        layers={layers}
        canSeeDeadlines={canSeeDeadlines}
        canSeeTasks={canSeeTasks}
        colorBy={colorBy}
        onColorBy={setColorBy}
      />

      <div className="min-w-0 space-y-4">
        <h1 className="sr-only">Agenda</h1>

        {/* Cabeçalho: novo compromisso, navegação em pílula, período e modo de exibição. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          {editable && (
            <Button
              className="h-10 rounded-full bg-foreground px-5 text-[13.5px] text-background shadow-raised hover:bg-foreground/90"
              onClick={() => create()}
            >
              <Plus /> Novo compromisso
            </Button>
          )}
          <div className="inline-flex items-center divide-x divide-border overflow-hidden rounded-full border border-border bg-card shadow-xs">
            <button type="button" aria-label="Período anterior" onClick={() => move(-1)} className={navButton}>
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Ir para hoje"
              title="Hoje (T)"
              onClick={goToday}
              className={cn(navButton, "w-11", isCurrent && "text-brand")}
            >
              <CalendarDays className="size-4" />
            </button>
            <button type="button" aria-label="Próximo período" onClick={() => move(1)} className={navButton}>
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              className="touch-target relative inline-flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-1 text-[20px] font-semibold tracking-[-0.02em] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label={`Período: ${title}. Escolher uma data`}
            >
              <span className="truncate" aria-live="polite">
                {title}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[272px]">
              <MiniCalendar
                selected={anchor}
                rangeStart={range.start}
                rangeEnd={range.end}
                visible={visible}
                onPick={(d) => {
                  setDirection(0)
                  setAnchor(startOfDay(d))
                  setPickerOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={onlyMine}
              onClick={() => setOnlyMine((v) => !v)}
              className={cn(
                "h-8 rounded-control border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 @5xl/main:hidden",
                onlyMine ? "border-brand/30 bg-brand-soft text-brand-strong" : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              Somente meus
            </button>
            <FilterTabs
              ariaLabel="Visualização"
              layoutId="agenda-view"
              value={view}
              onChange={changeView}
              className="mx-0 px-0"
              options={[
                { value: "dia", label: "Dia" },
                { value: "semana", label: "Semana" },
                { value: "mes", label: "Mês" },
                { value: "lista", label: "Lista" },
              ]}
            />
            <button
              type="button"
              aria-label="Mostrar ou esconder o painel lateral"
              aria-pressed={asidePref !== "fechado"}
              title="Painel lateral"
              onClick={() => setAsidePref(asidePref === "fechado" ? "aberto" : "fechado")}
              className={cn(
                "touch-target relative hidden size-8 items-center justify-center rounded-control border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 @6xl/main:flex",
                asidePref !== "fechado" && "bg-surface-muted text-foreground",
              )}
            >
              <PanelRight className="size-4" />
            </button>
          </div>
        </div>

        <div
          className="-mx-4 -my-1.5 flex gap-1.5 overflow-x-auto px-4 py-1.5 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0 @5xl/main:hidden"
          role="group"
          aria-label="Categorias"
        >
          {legend.map((item) => {
            const off = hiddenCategories.has(item.key)
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={!off}
                onClick={() => setHiddenCategories((s) => toggleIn(s, item.key))}
                className={cn(
                  "touch-target relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium outline-none transition-all pointer-coarse:h-8 focus-visible:ring-2 focus-visible:ring-brand/40",
                  off ? "border-dashed border-border-strong text-subtle" : "border-border bg-surface text-foreground shadow-xs",
                )}
              >
                <span className={cn("size-2 rounded-full transition-opacity", off && "opacity-30")} style={categoryStyle(item.color).dot} />
                {item.name}
                {!off && <span className="tabular text-[11px] text-subtle">{item.count}</span>}
              </button>
            )
          })}
        </div>

        {!ready ? (
          <Skeleton className="h-[620px] w-full rounded-[14px]" />
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
                      items={items}
                      onSelect={setSelected}
                      onCreate={editable ? create : undefined}
                      onMove={moveInGrid}
                      onResize={resizeInGrid}
                      processLabel={processLabel}
                      colorOf={colorOf}
                      canOpenItem={canOpenItem}
                    />
                  </div>
                  <div className="md:hidden">
                    <AgendaList days={weekDays} events={events} items={items} onSelect={setSelected} colorOf={colorOf} canOpenItem={canOpenItem} />
                  </div>
                </>
              )}
              {view === "dia" && (
                <TimeGrid
                  days={[anchor]}
                  events={events}
                  items={items}
                  onSelect={setSelected}
                  onCreate={editable ? create : undefined}
                  onMove={moveInGrid}
                  onResize={resizeInGrid}
                  processLabel={processLabel}
                  colorOf={colorOf}
                  canOpenItem={canOpenItem}
                />
              )}
              {view === "mes" && (
                <MonthGrid
                  anchor={anchor}
                  events={events}
                  items={items}
                  onSelect={setSelected}
                  onDayClick={(d) => {
                    setDirection(0)
                    setAnchor(startOfDay(d))
                    changeView("dia")
                  }}
                  onMove={moveInMonth}
                  colorOf={colorOf}
                  canOpenItem={canOpenItem}
                />
              )}
              {view === "lista" && (
                <AgendaList
                  days={listDays}
                  events={events}
                  items={items}
                  onSelect={setSelected}
                  colorOf={colorOf}
                  canOpenItem={canOpenItem}
                  hideEmpty
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {ready && <AgendaAside editable={editable} colorOf={colorOf} className={asideClass} />}
      <AppointmentDetail appointment={selected} onClose={() => setSelected(undefined)} />
    </div>
  )
}
