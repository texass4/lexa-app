"use client"

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  CloudUpload,
  LayoutGrid,
  List,
  ListFilter,
  Loader2,
  PanelRight,
  Search,
  X,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getMembers, getUser } from "@/lib/auth/account"
import { processSubject, processTitle } from "@/lib/processos/label"
import {
  activeFilters,
  CATEGORIES,
  FORMATS,
  PERIODS,
  SORTS,
  type Crumb,
  type LibraryState,
  type Period,
  type SortDir,
  type SortKey,
} from "@/lib/documentos/library"
import type { Client, DocumentKind } from "@/types"

export type View = "lista" | "grade"

/** Trilha da localização: cada segmento leva ao lugar correspondente. */
export function Breadcrumbs({ crumbs, onNavigate }: { crumbs: Crumb[]; onNavigate: (s: LibraryState) => void }) {
  return (
    <nav aria-label="Localização" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-[15px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${i}-${c.label}`} className={cn("flex min-w-0 items-center gap-1", !last && i > 0 && "@max-3xl/files:hidden")}>
              {i > 0 && <ChevronRight className={cn("size-4 shrink-0 text-subtle", !last && "@max-3xl/files:hidden")} aria-hidden />}
              {c.target && !last ? (
                <button
                  type="button"
                  onClick={() => onNavigate(c.target!)}
                  className="truncate rounded-[6px] px-1 py-0.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {c.label}
                </button>
              ) : (
                <span aria-current="location" className="truncate px-1 text-[17px] font-semibold tracking-[-0.015em] text-foreground">
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function FilterGroup({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[11.5px] font-semibold tracking-[0.04em] text-subtle uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Painel de filtros: só campos que o documento realmente guarda. Tudo combina. */
function FiltersPopover({ state, onChange, clients }: { state: LibraryState; onChange: (next: LibraryState) => void; clients: Client[] }) {
  const data = useOfficeData()
  const count = activeFilters(state).length
  const inClientes = state.section === "clientes"
  const processes = data.processes.filter((p) => (state.clientId ? p.clientId === state.clientId : true))
  const members = getMembers({ includeInactive: true })
  const set = (patch: Partial<LibraryState>) => onChange({ ...state, ...patch })
  const toggleFormat = (value: string) =>
    set({ formats: state.formats.includes(value) ? state.formats.filter((f) => f !== value) : [...state.formats, value] })

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
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] gap-4 p-4">
        <FilterGroup label="Categoria" htmlFor="filtro-categoria">
          <NativeSelect
            id="filtro-categoria"
            value={state.kind ?? ""}
            onChange={(e) => set({ kind: (e.target.value || undefined) as DocumentKind | undefined })}
            className="h-9 text-[13px]"
          >
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </FilterGroup>
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-subtle uppercase">Formato</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {FORMATS.map((f) => {
              const on = state.formats.includes(f.value)
              return (
                <label
                  key={f.value}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2 rounded-control border px-2.5 text-[12.5px] transition-colors duration-150",
                    on ? "border-brand/40 bg-brand-soft/60 text-brand-strong" : "border-border hover:border-border-strong",
                  )}
                >
                  <input type="checkbox" checked={on} onChange={() => toggleFormat(f.value)} className="size-3.5 accent-[var(--brand)]" />
                  <span className="truncate">{f.label.replace(/ \(.*\)$/, "")}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        {!inClientes && (
          <>
            <FilterGroup label="Cliente" htmlFor="filtro-cliente">
              <NativeSelect
                id="filtro-cliente"
                value={state.clientId ?? ""}
                onChange={(e) => set({ clientId: e.target.value || undefined, processId: undefined })}
                className="h-9 text-[13px]"
              >
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterGroup>
            <FilterGroup label="Processo" htmlFor="filtro-processo">
              <NativeSelect
                id="filtro-processo"
                value={state.processId ?? ""}
                onChange={(e) => {
                  const process = byId(data.processes, e.target.value)
                  set({ processId: e.target.value || undefined, clientId: process?.clientId ?? state.clientId })
                }}
                className="h-9 text-[13px]"
              >
                <option value="">Todos os processos</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {processTitle(p)} — {p.code}
                  </option>
                ))}
              </NativeSelect>
            </FilterGroup>
          </>
        )}
        <FilterGroup label="Enviado por" htmlFor="filtro-responsavel">
          <NativeSelect
            id="filtro-responsavel"
            value={state.uploadedById ?? ""}
            onChange={(e) => set({ uploadedById: e.target.value || undefined })}
            className="h-9 text-[13px]"
          >
            <option value="">Qualquer pessoa</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.active ? "" : " (inativo)"}
              </option>
            ))}
          </NativeSelect>
        </FilterGroup>
        <FilterGroup label="Enviado em" htmlFor="filtro-periodo">
          <NativeSelect
            id="filtro-periodo"
            value={state.period ?? ""}
            onChange={(e) => set({ period: (e.target.value || undefined) as Period | undefined })}
            className="h-9 text-[13px]"
          >
            <option value="">Qualquer data</option>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </FilterGroup>
        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              onChange({
                ...state,
                kind: undefined,
                formats: [],
                uploadedById: undefined,
                period: undefined,
                ...(inClientes ? {} : { clientId: undefined, processId: undefined }),
              })
            }
          >
            Limpar filtros
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Chips dos filtros ativos, removíveis um a um. */
export function FilterChips({ state, onChange }: { state: LibraryState; onChange: (next: LibraryState) => void }) {
  const data = useOfficeData()
  const reduce = useReducedMotion()
  const filters = activeFilters(state)
  if (!filters.length) return null
  const label = (f: (typeof filters)[number]) => {
    switch (f.key) {
      case "kind":
        return `Categoria: ${CATEGORIES.find((c) => c.value === state.kind)?.label ?? state.kind}`
      case "formats":
        return `Formato: ${FORMATS.find((x) => x.value === f.value)?.label.replace(/ \(.*\)$/, "")}`
      case "clientId":
        return `Cliente: ${byId(data.clients, state.clientId)?.name ?? "—"}`
      case "processId": {
        const p = byId(data.processes, state.processId)
        return `Processo: ${p ? processSubject(p) : "—"}`
      }
      case "uploadedById":
        return `Enviado por: ${getUser(state.uploadedById!).firstName}`
      case "period":
        return `Enviado: ${PERIODS.find((p) => p.value === state.period)?.label.toLowerCase()}`
    }
  }
  const remove = (f: (typeof filters)[number]): LibraryState => {
    switch (f.key) {
      case "formats":
        return { ...state, formats: state.formats.filter((x) => x !== f.value) }
      case "clientId":
        return { ...state, clientId: undefined, processId: undefined }
      default:
        return { ...state, [f.key]: undefined }
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
      <AnimatePresence initial={false}>
        {filters.map((f) => (
          <motion.span
            key={`${f.key}:${f.value ?? ""}`}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-brand/25 bg-brand-soft/60 pr-1 pl-2.5 text-[12px] text-brand-strong"
          >
            <span className="max-w-[220px] truncate">{label(f)}</span>
            <button
              type="button"
              onClick={() => onChange(remove(f))}
              aria-label={`Remover filtro ${label(f)}`}
              className="flex size-5 items-center justify-center rounded-full outline-none hover:bg-brand/15 focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <X className="size-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      {filters.length > 1 && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...state,
              kind: undefined,
              formats: [],
              uploadedById: undefined,
              period: undefined,
              ...(state.section === "clientes" ? {} : { clientId: undefined, processId: undefined }),
            })
          }
          className="rounded-[6px] px-1.5 text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Limpar todos
        </button>
      )}
    </div>
  )
}

function SortMenu({ sort, onSort }: { sort: { key: SortKey; dir: SortDir }; onSort: (s: { key: SortKey; dir: SortDir }) => void }) {
  const current = SORTS.find((s) => s.value === sort.key)!
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            className="shrink-0"
            aria-label={`Ordenar: ${current.label}, ${sort.dir === "asc" ? "crescente" : "decrescente"}`}
          >
            <ArrowUpDown />
            <span className="@max-xl/files:hidden">{current.label}</span>
            <Arrow className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
          {SORTS.map((s) => (
            <DropdownMenuItem
              key={s.value}
              className="h-8 px-2"
              onClick={() => onSort({ key: s.value, dir: s.value === sort.key ? sort.dir : s.defaultDir })}
            >
              <Check className={cn("size-4", s.value === sort.key ? "opacity-100" : "opacity-0")} /> {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Direção</DropdownMenuLabel>
          <DropdownMenuItem className="h-8 px-2" onClick={() => onSort({ ...sort, dir: "asc" })}>
            <Check className={cn("size-4", sort.dir === "asc" ? "opacity-100" : "opacity-0")} />
            {sort.key === "enviado" ? "Mais antigos primeiro" : sort.key === "tamanho" ? "Menores primeiro" : "A → Z"}
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => onSort({ ...sort, dir: "desc" })}>
            <Check className={cn("size-4", sort.dir === "desc" ? "opacity-100" : "opacity-0")} />
            {sort.key === "enviado" ? "Mais recentes primeiro" : sort.key === "tamanho" ? "Maiores primeiro" : "Z → A"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DocumentsToolbar({
  state,
  onChange,
  search,
  onSearch,
  searching,
  sort,
  onSort,
  view,
  onView,
  clients,
  detailsOpen,
  onToggleDetails,
  canEdit,
  onUpload,
  onOpenNav,
}: {
  state: LibraryState
  onChange: (next: LibraryState) => void
  search: string
  onSearch: (q: string) => void
  searching: boolean
  sort: { key: SortKey; dir: SortDir }
  onSort: (s: { key: SortKey; dir: SortDir }) => void
  view: View
  onView: (v: View) => void
  clients: Client[]
  detailsOpen: boolean
  onToggleDetails?: () => void
  canEdit: boolean
  onUpload: () => void
  onOpenNav: () => void
}) {
  const atClientes = state.section === "clientes" && !state.clientId
  const placeholder = atClientes ? "Buscar cliente…" : "Buscar por nome, categoria, cliente ou processo…"
  return (
    <div className="flex flex-col gap-2.5 @3xl/files:flex-row @3xl/files:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button variant="secondary" size="icon" className="shrink-0 @5xl/main:hidden" aria-label="Abrir navegação de documentos" onClick={onOpenNav}>
          <List />
        </Button>
        <div role="search" className="relative min-w-0 flex-1 @3xl/files:max-w-[440px]">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && search && onSearch("")}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-9 w-full rounded-control border border-border bg-surface pr-16 pl-9.5 text-[13px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-border-strong focus:border-brand/60 focus:ring-4 focus:ring-brand/10 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {searching && <Loader2 className="size-3.5 animate-spin text-subtle motion-reduce:animate-none" aria-label="Buscando" />}
            {search && (
              <button
                type="button"
                onClick={() => onSearch("")}
                aria-label="Limpar busca"
                className="flex size-6 items-center justify-center rounded-md text-subtle outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FiltersPopover state={state} onChange={onChange} clients={clients} />
        <SortMenu sort={sort} onSort={onSort} />
        <div role="group" aria-label="Exibição" className="flex shrink-0 rounded-control border border-border bg-surface p-0.5 shadow-xs">
          {(
            [
              ["lista", List, "Lista"],
              ["grade", LayoutGrid, "Grade"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={`Ver em ${label.toLowerCase()}`}
              title={label}
              onClick={() => onView(v)}
              className={cn(
                "flex size-8 items-center justify-center rounded-[6px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
                view === v ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        {onToggleDetails && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("hidden shrink-0 @xl/files:flex", detailsOpen && "bg-brand-soft text-brand-strong")}
            aria-pressed={detailsOpen}
            aria-label={detailsOpen ? "Fechar painel de detalhes" : "Abrir painel de detalhes"}
            title="Detalhes"
            onClick={onToggleDetails}
          >
            <PanelRight />
          </Button>
        )}
        {canEdit && (
          <Button className="shrink-0 @5xl/main:hidden" onClick={onUpload} aria-label="Enviar arquivos">
            <CloudUpload />
            <span className="@max-xl/files:hidden">Enviar</span>
          </Button>
        )}
      </div>
    </div>
  )
}
