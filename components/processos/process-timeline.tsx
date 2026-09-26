"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Activity, ArrowRight, Bell, Calendar, ChevronDown, Circle, CircleCheck, Clock, FilePen, FileText, Gavel } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { getNow, diffInDays, fmtDayLabel, fmtDayMonthParts, fmtTime, parse, weekdayShort } from "@/lib/dates"
import { RECENT_DAYS } from "@/lib/attention"
import type { LexaMovement, MovementCategory } from "@/lib/services/processes/movement-interpreter"
import { buildTimeline, type TimelineCluster, type TimelineItem } from "@/lib/services/processes/movement-timeline"
import { MovementDetailSheet } from "./movement-detail-sheet"

const CATEGORY_ICON: Record<MovementCategory, React.ElementType> = {
  documento: FileText,
  prazo: Clock,
  comunicacao: Bell,
  tramitacao: ArrowRight,
  audiencia: Calendar,
  julgamento: Gavel,
  baixa: CircleCheck,
  peticao: FilePen,
  ato: Circle,
  outros: Activity,
}

type Filter = "todas" | "documento" | "prazo" | "comunicacao" | "tramitacao" | "julgamento"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "documento", label: "Documentos" },
  { value: "prazo", label: "Prazos" },
  { value: "comunicacao", label: "Comunicações" },
  { value: "tramitacao", label: "Tramitações" },
  { value: "julgamento", label: "Julgamentos" },
]

/** Movimentações renderizadas por vez — processos antigos passam de centenas. */
const PAGE_SIZE = 60

/**
 * Timeline de movimentações do processo.
 *
 * Recebe movimentações já interpretadas (`interpretMovements`), de qualquer
 * provider. Filtro, agrupamento por dia e agrupamento visual acontecem aqui,
 * memoizados; nenhum dado é alterado.
 */
export function ProcessTimeline({ movements }: { movements: LexaMovement[] }) {
  const [filter, setFilter] = React.useState<Filter>("todas")
  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [selected, setSelected] = React.useState<LexaMovement | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const counts = React.useMemo(() => {
    const result: Record<Filter, number> = { todas: movements.length, documento: 0, prazo: 0, comunicacao: 0, tramitacao: 0, julgamento: 0 }
    for (const movement of movements) {
      if (movement.category in result) result[movement.category as Filter] += 1
    }
    return result
  }, [movements])

  const filtered = React.useMemo(
    () => (filter === "todas" ? movements : movements.filter((movement) => movement.category === filter)),
    [movements, filter],
  )
  const days = React.useMemo(() => buildTimeline(filtered.slice(0, limit)), [filtered, limit])
  const remaining = filtered.length - Math.min(limit, filtered.length)
  const newestId = movements[0]?.id
  // Destaque "Nova" só quando a mais recente é mesmo recente.
  const fresh = !!movements[0] && diffInDays(getNow(), parse(movements[0].at)) <= RECENT_DAYS

  const open = React.useCallback((movement: LexaMovement) => {
    setSelected(movement)
    setSheetOpen(true)
  }, [])

  if (!movements.length) {
    return <EmptyState compact title="Nenhuma movimentação registrada." description="As movimentações aparecem aqui quando a fonte informar." />
  }

  return (
    <>
      <FilterTabs
        ariaLabel="Filtrar movimentações"
        layoutId="movement-filter"
        value={filter}
        onChange={(value) => {
          setFilter(value)
          setLimit(PAGE_SIZE)
        }}
        options={FILTERS.filter((f) => f.value === "todas" || counts[f.value] > 0 || f.value === filter).map((f) => ({
          ...f,
          count: counts[f.value],
        }))}
        className="mb-6"
      />

      {days.length ? (
        <ol className="relative">
          {days.map((day, gi) => (
            <TimelineDayGroup
              key={day.date}
              date={day.date}
              items={day.items}
              last={gi === days.length - 1}
              delay={gi < 8 ? gi * 0.04 : 0}
              newestId={newestId}
              fresh={fresh}
              onOpen={open}
            />
          ))}
        </ol>
      ) : (
        <EmptyState compact title="Nenhuma movimentação nesta categoria." />
      )}

      {remaining > 0 && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            Mostrar mais {Math.min(PAGE_SIZE, remaining)} de {remaining}
          </Button>
        </div>
      )}

      <MovementDetailSheet movement={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}

/* ---------------------------------- dia ----------------------------------- */

function TimelineDayGroup({
  date,
  items,
  last,
  delay,
  newestId,
  fresh,
  onOpen,
}: {
  date: string
  items: TimelineItem[]
  last: boolean
  delay: number
  newestId?: string
  fresh: boolean
  onOpen: (movement: LexaMovement) => void
}) {
  const { day, month } = fmtDayMonthParts(date)
  const parsed = parse(date)
  const label = fmtDayLabel(date)
  // Processos atravessam anos: fora do ano corrente, o ano substitui o dia da semana.
  const caption =
    parsed.getFullYear() !== getNow().getFullYear()
      ? String(parsed.getFullYear())
      : label === "Hoje" || label === "Ontem"
        ? label
        : weekdayShort(parsed.getDay())

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-[56px_1fr] gap-x-4 sm:grid-cols-[76px_1fr] sm:gap-x-6"
    >
      <div className="relative pt-1 text-right">
        <div className="sticky top-20">
          <p className="font-serif text-[26px] leading-none text-foreground sm:text-[30px]">{day}</p>
          <p className="mt-1 text-[10.5px] font-semibold tracking-[0.14em] text-gold-dark">{month}</p>
          <p className="tabular mt-0.5 text-[11px] capitalize text-subtle">{caption}</p>
        </div>
      </div>
      <ol className={cn("relative min-w-0 border-l border-border pl-6 sm:pl-7", last ? "pb-2" : "pb-8")}>
        {items.map((item) =>
          item.type === "single" ? (
            <SingleEntry key={item.key} movement={item.movement} emphasis={item.movement.id === newestId} fresh={fresh} onOpen={onOpen} />
          ) : (
            <ClusterEntry key={item.key} cluster={item} emphasis={item.movements[0]?.id === newestId} fresh={fresh} onOpen={onOpen} />
          ),
        )}
      </ol>
    </motion.li>
  )
}

/* --------------------------------- linhas --------------------------------- */

function EntryIcon({ category, emphasis }: { category: MovementCategory; emphasis?: boolean }) {
  const Icon = CATEGORY_ICON[category]
  return (
    <span
      className={cn(
        "absolute top-0 -left-[39px] flex size-7 items-center justify-center rounded-full border bg-surface ring-4 ring-background sm:-left-[43px] [&_svg]:size-3.5",
        emphasis ? "border-gold/50 text-gold-dark" : "border-border text-muted-foreground",
      )}
      aria-hidden
    >
      <Icon />
    </span>
  )
}

/** Título, descrição legível e órgão julgador — nessa ordem de importância. */
function EntryText({ title, description, unit, fresh }: { title: string; description?: string; unit?: string; fresh?: boolean }) {
  return (
    <>
      <p className="text-[13.5px] font-medium leading-snug break-words text-foreground">
        {title}
        {fresh && (
          <span className="ml-2 inline-block rounded-[5px] bg-gold-soft px-1.5 align-[1px] text-[10.5px] font-semibold text-gold-dark">Nova</span>
        )}
      </p>
      {description && <p className="mt-1 text-[12.5px] leading-snug break-words text-muted-foreground">{description}</p>}
      {unit && <p className="mt-0.5 text-[12px] leading-snug break-words text-subtle">{unit}</p>}
    </>
  )
}

const rowButton =
  "-mx-2 -my-1 block w-[calc(100%+1rem)] rounded-[10px] px-2 py-1 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-gold/40"

function SingleEntry({
  movement,
  emphasis,
  fresh,
  onOpen,
}: {
  movement: LexaMovement
  emphasis: boolean
  fresh: boolean
  onOpen: (m: LexaMovement) => void
}) {
  return (
    <li className="relative pb-5 last:pb-0">
      <EntryIcon category={movement.category} emphasis={emphasis} />
      <button
        type="button"
        className={rowButton}
        onClick={() => onOpen(movement)}
        aria-label={`Detalhes: ${movement.title}, ${fmtTime(movement.at)}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 pt-0.5">
            <EntryText title={movement.title} description={movement.description} unit={movement.judicialUnit?.name} fresh={emphasis && fresh} />
          </div>
          <span className="tabular shrink-0 pt-1 text-[11.5px] text-subtle">{fmtTime(movement.at)}</span>
        </div>
      </button>
    </li>
  )
}

function ClusterEntry({
  cluster,
  emphasis,
  fresh,
  onOpen,
}: {
  cluster: TimelineCluster
  emphasis: boolean
  fresh: boolean
  onOpen: (m: LexaMovement) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const listId = React.useId()
  const count = cluster.movements.length

  return (
    <li className="relative pb-5 last:pb-0">
      <EntryIcon category={cluster.category} emphasis={emphasis} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 pt-0.5">
          <EntryText title={cluster.label} description={cluster.description} unit={cluster.judicialUnit?.name} fresh={emphasis && fresh} />
        </div>
        <span className="tabular shrink-0 pt-1 text-[11.5px] text-subtle">
          {fmtTime(cluster.from)} – {fmtTime(cluster.to)}
        </span>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
      >
        {expanded ? "Ocultar" : `Ver ${count} movimentações`}
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <ul id={listId} className="mt-2 space-y-0.5 border-l border-border/70 pl-3">
          {cluster.movements.map((movement) => (
            <li key={movement.id}>
              <button
                type="button"
                onClick={() => onOpen(movement)}
                className="flex w-full items-baseline gap-3 rounded-[8px] px-2 py-1 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-gold/40"
              >
                <span className="tabular shrink-0 text-[11.5px] text-subtle">{fmtTime(movement.at)}</span>
                <span className="min-w-0 text-[12.5px] break-words text-foreground">{movement.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
