"use client"

import * as React from "react"
import Link from "next/link"
import { AlarmClock, CalendarCheck, ChevronDown, CircleCheck, FileText, Flag, Keyboard, ListChecks, Plus, SearchX } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { describeRelated } from "@/lib/store/selectors"
import { useUI } from "@/lib/store/ui-store"
import { createLocalStore } from "@/lib/core/hooks"
import { currentUserId } from "@/lib/auth/account"
import { activeChips, applyKpi, EMPTY_FILTERS, isKpiActive, type Kpi, type SortDir, type SortKey, type TaskView } from "@/lib/tarefas/workspace"
import type { Task } from "@/types"
import { BoardView } from "./board-view"
import { CalendarView } from "./calendar-view"
import { BulkBar, ListView } from "./list-view"
import { TaskActionsProvider, useTaskActions } from "./task-actions"
import { TaskDetailSheet } from "./task-detail-sheet"
import { TaskFormDialog } from "./task-form-dialog"
import { FilterChips, FiltersPopover, SearchBox, ViewBar } from "./task-toolbar"
import { useTaskWorkspace } from "./use-task-workspace"

const kpiStore = createLocalStore("lexa:tarefas:indicadores", "abertos")

const KPIS: { kpi: Kpi; label: string; icon: React.ReactNode; tone: "danger" | "warning" | "brand" | "success" }[] = [
  { kpi: "atrasadas", label: "Atrasadas", icon: <AlarmClock />, tone: "danger" },
  { kpi: "hoje", label: "Para hoje", icon: <CalendarCheck />, tone: "warning" },
  { kpi: "alta", label: "Prioridade alta", icon: <Flag />, tone: "brand" },
  { kpi: "concluidas", label: "Concluídas", icon: <CircleCheck />, tone: "success" },
]

const TONE: Record<(typeof KPIS)[number]["tone"], string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
}

/** Typing num campo, num menu ou com um diálogo aberto: atalhos de página não valem. */
function typingOrDialog(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el?.closest("input,textarea,select,[contenteditable=true],[role=menu],[role=listbox]")) return true
  return !!document.querySelector("[role=dialog],[role=alertdialog]")
}

export function TasksView() {
  return (
    <TaskActionsProvider>
      <Workspace />
    </TaskActionsProvider>
  )
}

function Workspace() {
  const data = useOfficeData()
  const { retryLoad, deleteTask, confirmSaved } = useOfficeActions()
  const { openDialog } = useUI()
  const a = useTaskActions()
  const w = useTaskWorkspace()
  const { state, setState } = w
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set())
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({ key: "status", dir: "asc" })
  const [editing, setEditing] = React.useState<{ task?: Task; open: boolean }>({ open: false })
  const kpisOpen = React.useSyncExternalStore(kpiStore.subscribe, kpiStore.get, kpiStore.getServer) !== "recolhidos"
  const me = currentUserId()

  // Trocar de visão, escopo ou filtro limpa a seleção (o que estava marcado pode não estar mais à vista).
  const selectionKey = `${state.view}|${state.scope}|${JSON.stringify(state.filters)}|${w.search}`
  const [lastKey, setLastKey] = React.useState(selectionKey)
  if (lastKey !== selectionKey) {
    setLastKey(selectionKey)
    if (selected.size) setSelected(new Set())
  }

  const newTask = React.useCallback(
    (extra?: { date?: string }) =>
      openDialog("task", {
        processId: state.filters.processId,
        clientId: state.filters.clientId,
        assigneeId: state.filters.assignees.length === 1 ? state.filters.assignees[0] : undefined,
        ...extra,
      }),
    [openDialog, state.filters],
  )
  const setView = React.useCallback((view: TaskView) => setState({ ...state, view }), [setState, state])

  // Atalhos (padrão Linear): C nova tarefa · / buscar · 1/2/3 visões · Esc limpa a seleção.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingOrDialog(e)) return
      if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if ((e.key === "c" || e.key === "C") && a.editable) {
        e.preventDefault()
        newTask()
      } else if (e.key === "1" || e.key === "2" || e.key === "3") {
        setView((["quadro", "lista", "calendario"] as TaskView[])[Number(e.key) - 1])
      } else if (e.key === "Escape" && selected.size) setSelected(new Set())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [a.editable, newTask, setView, selected.size])

  const openTask = w.openId ? byId(data.tasks, w.openId) : undefined
  const selectedTasks = data.tasks.filter((t) => selected.has(t.id))
  const filtered = activeChips(state.filters).length > 0 || !!w.search.trim()
  const pendingMine = data.tasks.filter((t) => t.assigneeId === me && t.status === "pendente").length

  let content: React.ReactNode
  if (w.loadError) {
    content = (
      <div className="rounded-card border border-border bg-card">
        <ErrorState title="Não foi possível carregar as tarefas." onRetry={retryLoad} />
      </div>
    )
  } else if (!w.ready) {
    content =
      state.view === "quadro" ? (
        <div className="flex gap-3 overflow-hidden" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80 w-[288px] shrink-0 rounded-[14px]" />
          ))}
        </div>
      ) : (
        <Skeleton className="h-96 w-full rounded-card" />
      )
  } else if (!w.visible.length && (state.view !== "quadro" || filtered)) {
    content = (
      <div className="rounded-card border border-border bg-card">
        {filtered ? (
          <EmptyState
            icon={<SearchX />}
            title={w.search.trim() ? `Nenhuma tarefa encontrada para “${w.search.trim()}”.` : "Nenhuma tarefa com estes filtros."}
            description="A busca procura no título, na descrição, no cliente e no processo — inclusive nas concluídas antigas."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {w.search.trim() && (
                  <Button size="sm" variant="secondary" onClick={() => w.setQuery("")}>
                    Limpar busca
                  </Button>
                )}
                {activeChips(state.filters).length > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => setState({ ...state, filters: EMPTY_FILTERS })}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<ListChecks />}
            title={state.scope === "minhas" ? "Nenhuma tarefa com você." : "Nenhuma tarefa no escritório ainda."}
            description={
              state.scope === "minhas"
                ? "Crie uma tarefa ou veja as do escritório."
                : "Crie a primeira tarefa — com prazo, responsável e o processo ou cliente ligado."
            }
            action={
              a.editable ? (
                <Button size="sm" onClick={() => newTask()}>
                  <Plus /> Nova tarefa
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    )
  } else if (state.view === "quadro") {
    content = (
      <BoardView
        tasks={w.visible}
        columns={w.columns}
        columnOf={w.columnOf}
        columnTotal={w.columnTotal}
        history={w.history}
        listKey={w.listKey}
        activeId={openTask?.id}
        showAssignee={(t) => state.scope === "escritorio" || t.assigneeId !== me}
        filters={state.filters}
        onOpen={(id) => w.openTask(id)}
      />
    )
  } else if (state.view === "lista") {
    content = (
      <>
        <ListView
          tasks={w.visible}
          columns={w.columns}
          columnOf={w.columnOf}
          history={state.filters.situation === "pendentes" ? undefined : w.history}
          listKey={w.listKey}
          activeId={openTask?.id}
          selected={selected}
          onSelected={setSelected}
          onOpen={(id) => w.openTask(id)}
          sort={sort}
          onSort={setSort}
        />
        <BulkBar tasks={selectedTasks} columns={w.columns} onClear={() => setSelected(new Set())} />
      </>
    )
  } else {
    content = <CalendarView tasks={w.visible} filters={state.filters} onOpen={(id) => w.openTask(id)} />
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground">Tarefas</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {state.scope === "minhas"
              ? pendingMine
                ? `${pendingMine} pendente${pendingMine === 1 ? "" : "s"} com você. Arraste entre as colunas, filtre e abra para editar.`
                : "Nenhuma pendente com você. Veja as do escritório ou crie uma."
              : "Tudo o que a equipe precisa entregar, por coluna, prazo e responsável."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShortcutsHelp />
          <Link href="/tarefas/paginas" className={buttonVariants({ variant: "secondary" })}>
            <FileText /> Páginas
          </Link>
          {a.editable && (
            <Button onClick={() => newTask()}>
              <Plus /> Nova tarefa <Kbd className="ml-1 border-white/30 bg-white/15 text-brand-foreground shadow-none max-sm:hidden">C</Kbd>
            </Button>
          )}
        </div>
      </header>

      {/* Indicadores do escopo atual: cada um aplica o filtro correspondente (visível nos chips). */}
      <section aria-label="Indicadores">
        <button
          type="button"
          onClick={() => kpiStore.set(kpisOpen ? "recolhidos" : "abertos")}
          aria-expanded={kpisOpen}
          className="mb-2 flex items-center gap-1 text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
        >
          <ChevronDown className={cn("size-3.5 transition-transform duration-150", !kpisOpen && "-rotate-90")} /> Resumo{" "}
          {state.scope === "minhas" ? "das suas tarefas" : "do escritório"}
        </button>
        {kpisOpen && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KPIS.map(({ kpi, label, icon, tone }) => {
              const value = w.kpis[kpi]
              const active = isKpiActive(state.filters, kpi)
              return (
                <button
                  key={kpi}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setState({ ...state, filters: active ? EMPTY_FILTERS : applyKpi(state.filters, kpi) })}
                  className={cn(
                    "flex items-center gap-3 rounded-[12px] border bg-card px-3 py-2.5 text-left outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
                    active ? "border-brand/50 ring-2 ring-brand/15" : "border-border hover:border-border-strong hover:shadow-card",
                  )}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px] [&_svg]:size-4", TONE[tone])}>{icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-muted-foreground">{label}</span>
                    <span
                      className={cn(
                        "tabular block text-[19px] leading-tight font-semibold",
                        kpi === "atrasadas" && value ? "text-danger" : "text-foreground",
                      )}
                    >
                      {value === undefined ? "—" : value}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div className="space-y-3">
        <ViewBar
          view={state.view}
          scope={state.scope}
          onView={setView}
          onScope={(scope) =>
            setState({ ...state, scope, filters: { ...state.filters, assignees: scope === "minhas" ? [] : state.filters.assignees } })
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox ref={searchRef} value={w.query} onChange={w.setQuery} searching={w.searching} />
          <FiltersPopover filters={state.filters} onChange={(filters) => setState({ ...state, filters })} columns={w.columns} scope={state.scope} />
          {w.ready && (
            <p className="ml-auto text-[12.5px] text-muted-foreground" aria-live="polite">
              {w.visible.length} tarefa{w.visible.length === 1 ? "" : "s"}
              {filtered ? " com estes filtros" : ""}
            </p>
          )}
        </div>
        <FilterChips filters={state.filters} onChange={(filters) => setState({ ...state, filters })} columns={w.columns} />
      </div>

      <div className="min-w-0">{content}</div>

      <TaskDetailSheet
        task={openTask}
        related={openTask ? describeRelated(data, openTask.related) : undefined}
        open={!!openTask}
        onOpenChange={(o) => !o && w.openTask()}
        onToggle={(t) => void a.setDone(t, t.status !== "concluida")}
        onEdit={(t) => {
          w.openTask()
          window.setTimeout(() => setEditing({ task: t, open: true }), 180)
        }}
        onDelete={async (t) => {
          w.openTask()
          deleteTask(t.id)
          if (await confirmSaved("tasks", t.id)) toast.success("Tarefa excluída.", { description: t.title })
        }}
      />
      <TaskFormDialog open={editing.open} onOpenChange={(o) => !o && setEditing((s) => ({ ...s, open: false }))} task={editing.task} />
    </div>
  )
}

function ShortcutsHelp() {
  const rows: [string, string][] = [
    ["C", "Nova tarefa"],
    ["/", "Buscar"],
    ["1 · 2 · 3", "Quadro · Lista · Calendário"],
    ["↑ ↓ ou J K", "Percorrer a lista"],
    ["Enter", "Abrir a tarefa"],
    ["X", "Selecionar na lista"],
    ["Esc", "Limpar seleção · fechar"],
    ["Ctrl K", "Busca global do Íntegra"],
  ]
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" aria-label="Atalhos de teclado" title="Atalhos de teclado" className="max-sm:hidden" />}
      >
        <Keyboard />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2 p-3">
        <p className="text-[12.5px] font-semibold text-foreground">Atalhos</p>
        <dl className="space-y-1.5">
          {rows.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-[12.5px]">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <Kbd>{k}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
