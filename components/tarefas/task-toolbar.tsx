"use client"

import * as React from "react"
import { CalendarDays, Kanban, ListFilter, ListTodo, Loader2, Search, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/field"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getMembers, getUser } from "@/lib/auth/account"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { processNumberLabel, processSubject, processTitle } from "@/lib/processos/label"
import {
  activeChips,
  DUE_FILTERS,
  EMPTY_FILTERS,
  PRIORITIES,
  removeChip,
  SITUATIONS,
  type DueFilter,
  type FilterChip,
  type Situation,
  type TaskFilters,
  type TaskScope,
  type TaskView,
} from "@/lib/tarefas/workspace"
import type { TaskColumn } from "@/types"

const VIEW_ICONS: Record<TaskView, React.ReactNode> = {
  quadro: <Kanban className="size-4" />,
  lista: <ListTodo className="size-4" />,
  calendario: <CalendarDays className="size-4" />,
}

/** Barra de visões (padrão Notion): a visão e o escopo são filtros reais sobre os mesmos dados. */
export function ViewBar({
  view,
  scope,
  onView,
  onScope,
}: {
  view: TaskView
  scope: TaskScope
  onView: (v: TaskView) => void
  onScope: (s: TaskScope) => void
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border">
      <div role="tablist" aria-label="Visualização" className="flex items-center">
        {(["quadro", "lista", "calendario"] as TaskView[]).map((v, i) => {
          const active = view === v
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onView(v)}
              title={`${v === "quadro" ? "Quadro" : v === "lista" ? "Lista" : "Calendário"} (${i + 1})`}
              className={cn(
                "relative flex h-10 items-center gap-1.5 px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_ICONS[v]}
              {v === "quadro" ? "Quadro" : v === "lista" ? "Lista" : "Calendário"}
              {active && (
                <motion.span
                  layoutId={reduce ? undefined : "tarefas-visao"}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>
      <span className="mx-2 hidden h-5 w-px bg-border sm:block" aria-hidden />
      <div role="radiogroup" aria-label="De quem" className="mb-1.5 flex rounded-control border border-border bg-surface p-0.5 sm:mb-0">
        {(["minhas", "escritorio"] as TaskScope[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scope === s}
            onClick={() => onScope(s)}
            className={cn(
              "h-7 rounded-[7px] px-3 text-[12.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
              scope === s ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "minhas" ? "Minhas tarefas" : "Escritório"}
          </button>
        ))}
      </div>
    </div>
  )
}

export const SearchBox = React.forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; searching: boolean }>(function SearchBox(
  { value, onChange, searching },
  ref,
) {
  return (
    <div role="search" className="relative min-w-0 flex-1 max-sm:basis-full sm:max-w-[360px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (value) onChange("")
            else e.currentTarget.blur()
          }
        }}
        placeholder="Buscar tarefa, cliente ou processo…"
        aria-label="Buscar tarefa, cliente ou processo"
        className="h-9 w-full rounded-control border border-border bg-surface pr-9 pl-9 text-[13px] sm:pr-16 text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-border-strong focus:border-brand/60 focus:ring-4 focus:ring-brand/10 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {searching && <Loader2 className="size-3.5 animate-spin text-subtle motion-reduce:animate-none" aria-label="Buscando" />}
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Limpar busca"
            className="flex size-6 items-center justify-center rounded-md text-subtle hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <Kbd className="max-sm:hidden">/</Kbd>
        )}
      </span>
    </div>
  )
})

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-subtle uppercase">{label}</legend>
      {children}
    </fieldset>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-[12.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
        on ? "border-brand/40 bg-brand-soft/60 text-brand-strong" : "border-border text-foreground hover:border-border-strong",
      )}
    >
      {children}
    </button>
  )
}

/** Filtros combináveis sobre os campos reais da tarefa. */
export function FiltersPopover({
  filters,
  onChange,
  columns,
  scope,
}: {
  filters: TaskFilters
  onChange: (f: TaskFilters) => void
  columns: TaskColumn[]
  scope: TaskScope
}) {
  const data = useOfficeData()
  const count = activeChips(filters).length
  const toggleIn = <K extends "columns" | "priorities" | "assignees">(key: K, value: TaskFilters[K][number]) => {
    const list = filters[key] as string[]
    onChange({ ...filters, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] })
  }
  const processes = data.processes.filter((p) => !filters.clientId || p.clientId === filters.clientId)
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" className={cn("shrink-0", count > 0 && "border-brand/40 text-brand-strong")}>
            <ListFilter /> Filtros
            {count > 0 && (
              <span className="tabular flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
                {count}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="max-h-[min(70vh,620px)] w-[min(360px,calc(100vw-2rem))] gap-4 overflow-y-auto p-4 thin-scrollbar">
        <Group label="Situação">
          <NativeSelect
            aria-label="Situação"
            value={filters.situation}
            onChange={(e) => onChange({ ...filters, situation: e.target.value as Situation })}
            className="h-9 text-[13px]"
          >
            {SITUATIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Group>
        <Group label="Status (coluna)">
          <div className="flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <Toggle key={c.id} on={filters.columns.includes(c.id)} onClick={() => toggleIn("columns", c.id)}>
                <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden /> {c.name}
              </Toggle>
            ))}
          </div>
        </Group>
        <Group label="Prioridade">
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <Toggle key={p} on={filters.priorities.includes(p)} onClick={() => toggleIn("priorities", p)}>
                {PRIORITY_CONFIG[p].label}
              </Toggle>
            ))}
          </div>
        </Group>
        <Group label="Prazo">
          <NativeSelect
            aria-label="Prazo"
            value={filters.due ?? ""}
            onChange={(e) => onChange({ ...filters, due: (e.target.value || undefined) as DueFilter | undefined })}
            className="h-9 text-[13px]"
          >
            <option value="">Qualquer prazo</option>
            {DUE_FILTERS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </NativeSelect>
        </Group>
        {scope === "escritorio" && (
          <Group label="Responsável">
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {getMembers().map((m) => (
                <Toggle key={m.id} on={filters.assignees.includes(m.id)} onClick={() => toggleIn("assignees", m.id)}>
                  {m.name}
                </Toggle>
              ))}
            </div>
          </Group>
        )}
        <Group label="Cliente">
          <NativeSelect
            aria-label="Cliente"
            value={filters.clientId ?? ""}
            onChange={(e) => onChange({ ...filters, clientId: e.target.value || undefined, processId: undefined })}
            className="h-9 text-[13px]"
          >
            <option value="">Todos os clientes</option>
            {data.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Group>
        <Group label="Processo">
          <NativeSelect
            aria-label="Processo"
            value={filters.processId ?? ""}
            onChange={(e) => {
              const p = byId(data.processes, e.target.value)
              onChange({ ...filters, processId: e.target.value || undefined, clientId: p?.clientId ?? filters.clientId })
            }}
            className="h-9 text-[13px]"
          >
            <option value="">Todos os processos</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {processTitle(p, byId(data.clients, p.clientId)?.name)} · {processNumberLabel(p)}
              </option>
            ))}
          </NativeSelect>
        </Group>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange(EMPTY_FILTERS)}>
            Limpar filtros
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function FilterChips({ filters, onChange, columns }: { filters: TaskFilters; onChange: (f: TaskFilters) => void; columns: TaskColumn[] }) {
  const data = useOfficeData()
  const reduce = useReducedMotion()
  const chips = activeChips(filters)
  if (!chips.length) return null
  const label = (c: FilterChip) => {
    switch (c.key) {
      case "columns":
        return `Status: ${columns.find((x) => x.id === c.value)?.name ?? "—"}`
      case "priorities":
        return `Prioridade ${PRIORITY_CONFIG[c.value as keyof typeof PRIORITY_CONFIG].label.toLowerCase()}`
      case "assignees":
        return `Responsável: ${getUser(c.value!).firstName}`
      case "due":
        return DUE_FILTERS.find((d) => d.value === filters.due)!.label
      case "clientId":
        return `Cliente: ${byId(data.clients, filters.clientId)?.name ?? "—"}`
      case "processId": {
        const p = byId(data.processes, filters.processId)
        return `Processo: ${p ? processSubject(p) : "—"}`
      }
      case "situation":
        return filters.situation === "pendentes" ? "Só pendentes" : "Só concluídas"
      default:
        return ""
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.span
            key={`${c.key}:${c.value ?? ""}`}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-brand/25 bg-brand-soft/60 pr-1 pl-2.5 text-[12px] text-brand-strong"
          >
            <span className="max-w-[240px] truncate">{label(c)}</span>
            <button
              type="button"
              onClick={() => onChange(removeChip(filters, c))}
              aria-label={`Remover filtro ${label(c)}`}
              className="touch-target relative flex size-5 items-center justify-center rounded-full outline-none hover:bg-brand/15 focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <X className="size-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="rounded-[6px] px-1.5 text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Limpar todos
        </button>
      )}
    </div>
  )
}
