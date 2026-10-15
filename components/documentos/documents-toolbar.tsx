"use client"

import * as React from "react"
import { Check, ChevronDown, LayoutGrid, List, Loader2, PanelLeft, PanelRight, Search, SlidersHorizontal, X } from "lucide-react"
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
import { FileTypeGlyph } from "./file-type-icon"

export type View = "lista" | "grade"

/** Trilha da localização ("Escritório / Clientes / Ana Martins / Processo 0001234-56"). */
export function Breadcrumbs({ crumbs, onNavigate }: { crumbs: Crumb[]; onNavigate: (s: LibraryState) => void }) {
  return (
    <nav aria-label="Localização" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[12.5px] text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <span className="text-subtle" aria-hidden>
                  /
                </span>
              )}
              {c.target && !last ? (
                <button
                  type="button"
                  onClick={() => onNavigate(c.target!)}
                  className="max-w-[220px] truncate rounded-[5px] px-0.5 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {c.label}
                </button>
              ) : (
                <span aria-current="location" className="max-w-[260px] truncate px-0.5 text-foreground/80">
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
  // O formato já aparece nos botões da barra: não conta aqui.
  const count = activeFilters(state).filter((f) => f.key !== "formats").length
  const inClientes = state.section === "clientes"
  const processes = data.processes.filter((p) => (state.clientId ? p.clientId === state.clientId : true))
  const members = getMembers({ includeInactive: true })
  const set = (patch: Partial<LibraryState>) => onChange({ ...state, ...patch })

  return (
    <Popover>
      <PopoverTrigger
        aria-label={count ? `Filtros (${count} ativo${count === 1 ? "" : "s"})` : "Filtros"}
        title="Filtros"
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-control border bg-surface text-muted-foreground shadow-xs outline-none transition-colors duration-150 hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40",
          count > 0 ? "border-brand/40 text-brand-strong" : "border-border",
        )}
      >
        <SlidersHorizontal className="size-4" />
        {count > 0 && (
          <span className="tabular absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-brand text-[10.5px] font-semibold text-brand-foreground">
            {count}
          </span>
        )}
      </PopoverTrigger>
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
  const filters = activeFilters(state).filter((f) => f.key !== "formats")
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

/** As ordens que a pessoa escolhe, com nome humano ("Mais recentes"). */
const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string }[] = [
  { key: "enviado", dir: "desc", label: "Mais recentes" },
  { key: "enviado", dir: "asc", label: "Mais antigos" },
  { key: "nome", dir: "asc", label: "Nome (A–Z)" },
  { key: "nome", dir: "desc", label: "Nome (Z–A)" },
  { key: "formato", dir: "asc", label: "Tipo" },
  { key: "categoria", dir: "asc", label: "Categoria" },
  { key: "tamanho", dir: "desc", label: "Maiores primeiro" },
  { key: "tamanho", dir: "asc", label: "Menores primeiro" },
]

export const sortLabel = (sort: { key: SortKey; dir: SortDir }) =>
  SORT_OPTIONS.find((o) => o.key === sort.key && o.dir === sort.dir)?.label ?? SORTS.find((s) => s.value === sort.key)?.label ?? ""

const control =
  "flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[13px] text-foreground shadow-xs outline-none transition-colors duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:border-border-strong"

function SortMenu({ sort, onSort }: { sort: { key: SortKey; dir: SortDir }; onSort: (s: { key: SortKey; dir: SortDir }) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={control} aria-label={`Ordenar: ${sortLabel(sort)}`}>
        <span className="text-muted-foreground @max-4xl/files:hidden">Ordenar:</span>
        <span className="font-medium">{sortLabel(sort)}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
          {SORT_OPTIONS.map((o) => {
            const on = o.key === sort.key && o.dir === sort.dir
            return (
              <DropdownMenuItem key={`${o.key}:${o.dir}`} className="h-8 px-2" onClick={() => onSort({ key: o.key, dir: o.dir })}>
                <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} /> {o.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ViewMenu({ view, onView }: { view: View; onView: (v: View) => void }) {
  const Icon = view === "lista" ? List : LayoutGrid
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(control, "px-2.5")} aria-label={`Exibição: ${view === "lista" ? "lista" : "grade"}`} title="Exibição">
        <Icon className="size-4 text-muted-foreground" />
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Exibir em</DropdownMenuLabel>
          {(
            [
              ["lista", List, "Lista"],
              ["grade", LayoutGrid, "Grade"],
            ] as const
          ).map(([v, I, label]) => (
            <DropdownMenuItem key={v} className="h-8 px-2" onClick={() => onView(v)}>
              <I /> {label}
              <Check className={cn("ml-auto size-4", view === v ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Botões de formato (Todos, PDF, Word, Excel, Outros): um por vez, como no Drive. */
function FormatPills({ state, onChange }: { state: LibraryState; onChange: (next: LibraryState) => void }) {
  const current = state.formats.length === 1 ? state.formats[0] : state.formats.length ? "varios" : "todos"
  const pill =
    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40"
  const on = "border-brand/35 bg-brand-soft text-brand-strong shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_8%,transparent)]"
  const off = "border-border bg-surface text-muted-foreground shadow-xs hover:border-border-strong hover:text-foreground"
  const icon: Record<string, string> = { pdf: "pdf", word: "docx", excel: "xlsx", outros: "txt" }
  return (
    <div role="group" aria-label="Tipo de arquivo" className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar">
      <button
        type="button"
        aria-pressed={current === "todos"}
        onClick={() => onChange({ ...state, formats: [] })}
        className={cn(pill, current === "todos" ? on : off)}
      >
        <span className="flex size-4 items-center justify-center rounded-[4px] bg-brand text-brand-foreground" aria-hidden>
          <LayoutGrid className="size-2.5" strokeWidth={2.5} />
        </span>
        Todos
      </button>
      {FORMATS.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={current === f.value}
          title={f.label}
          onClick={() => onChange({ ...state, formats: current === f.value ? [] : [f.value] })}
          className={cn(pill, current === f.value ? on : off)}
        >
          <FileTypeGlyph extension={icon[f.value]} className={cn("h-4 w-[13px]", f.value === "outros" && "opacity-80")} />
          {f.short}
        </button>
      ))}
    </div>
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
  /** Ausente: as pastas já estão à vista (coluna). */
  onOpenNav?: () => void
}) {
  const atClientes = state.section === "clientes" && !state.clientId
  const placeholder = atClientes ? "Buscar cliente…" : "Buscar por nome do arquivo..."
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {onOpenNav && (
        <button type="button" className={cn(control, "px-2.5")} aria-label="Abrir as pastas de documentos" title="Pastas" onClick={onOpenNav}>
          <PanelLeft className="size-4 text-muted-foreground" />
        </button>
      )}
      <div role="search" className="relative min-w-[200px] flex-1 basis-[240px] @4xl/main:max-w-[320px]">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && search && onSearch("")}
          placeholder={placeholder}
          aria-label={atClientes ? "Buscar cliente" : "Buscar por nome do arquivo, categoria, cliente ou processo"}
          className="h-9 w-full rounded-control border border-border bg-surface pr-16 pl-10 text-[13px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-border-strong focus:border-brand/60 focus:ring-4 focus:ring-brand/10 [&::-webkit-search-cancel-button]:hidden"
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
      {!atClientes && <FormatPills state={state} onChange={onChange} />}
      <div className="ml-auto flex items-center gap-2">
        <SortMenu sort={sort} onSort={onSort} />
        <ViewMenu view={view} onView={onView} />
        <FiltersPopover state={state} onChange={onChange} clients={clients} />
        {onToggleDetails && (
          <button
            type="button"
            className={cn(control, "px-2.5", detailsOpen && "border-brand/40 bg-brand-soft text-brand-strong")}
            aria-pressed={detailsOpen}
            aria-label={detailsOpen ? "Fechar painel de detalhes" : "Abrir painel de detalhes"}
            title="Detalhes"
            onClick={onToggleDetails}
          >
            <PanelRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
