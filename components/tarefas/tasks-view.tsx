"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { ChevronDown, Kanban, ListChecks, ListTodo, Plus } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/ui/panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TaskItem } from "./task-item"
import { TaskDetailSheet } from "./task-detail-sheet"
import { TaskFormDialog } from "./task-form-dialog"
import { BoardView } from "./board-view"
import { useToggleTask } from "./task-row"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useDebounced, useHistoryStats, usePagedHistory } from "@/lib/store/on-demand"
import { completedKey, completedTasks, taskSearch } from "@/lib/store/history-lists"
import { searchFilter } from "@/lib/store/storage"
import { LimitedList } from "@/components/ui/show-more"
import { useUI } from "@/lib/store/ui-store"
import { createLocalStore } from "@/lib/core/hooks"
import { addDays, getNow, monthShort, startOfWeek, weekdayName } from "@/lib/core/dates"
import { describeRelated, isOverdue, taskBucket, type TaskBucket } from "@/lib/store/selectors"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { matches } from "@/lib/core/format"
import { currentUserId } from "@/lib/auth/account"
import type { Task } from "@/types"
import { Can } from "@/lib/auth/session"

type Filter = "todas" | "hoje" | "atrasadas" | "alta" | "concluidas"
type Scope = "minhas" | "escritorio"
type ViewMode = "board" | "list"

const viewStore = createLocalStore("lexa:tasks-view", "board")

const FILTER_TEST: Record<Filter, (t: Task) => boolean> = {
  todas: () => true,
  hoje: (t) => t.status === "pendente" && taskBucket(t) === "hoje",
  atrasadas: (t) => isOverdue(t),
  alta: (t) => t.status === "pendente" && t.priority === "alta",
  concluidas: (t) => t.status === "concluida",
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const dayHint = (d: Date) => `${cap(weekdayName(d.getDay()))}, ${d.getDate()} ${monthShort(d.getMonth())}`

/** Grupos da lista, com a data real de hoje, amanhã e do fim da semana. */
function buckets(now: Date): { id: TaskBucket; label: string; hint?: string }[] {
  const sunday = addDays(startOfWeek(now), 6)
  return [
    { id: "atrasadas", label: "Atrasadas", hint: "Prazo vencido" },
    { id: "hoje", label: "Hoje", hint: dayHint(now) },
    { id: "amanha", label: "Amanhã", hint: dayHint(addDays(now, 1)) },
    { id: "semana", label: "Esta semana", hint: `Até ${weekdayName(0)}, ${sunday.getDate()} ${monthShort(sunday.getMonth())}` },
    { id: "proximas", label: "Próximas" },
    { id: "concluidas", label: "Concluídas" },
  ]
}

const isFilter = (value: string | null): value is Filter => !!value && value in FILTER_TEST

export function TasksView() {
  const data = useOfficeData()
  const { deleteTask, windowBounds } = useOfficeActions()
  const { openDialog } = useUI()
  const toggle = useToggleTask()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const ready = data.hydrated
  const storedView = (React.useSyncExternalStore(viewStore.subscribe, viewStore.get, viewStore.getServer) as ViewMode) || "board"
  // `?filtro=atrasadas` (links de "o que merece atenção") abre a lista já filtrada.
  const filterParam = params.get("filtro")
  const view: ViewMode = isFilter(filterParam) ? "list" : storedView
  const setView = (v: ViewMode) => {
    viewStore.set(v)
    if (filterParam) router.replace(pathname, { scroll: false })
  }

  const openId = params.get("tarefa")
  const openTask = openId ? byId(data.tasks, openId) : undefined

  const [filter, setFilter] = React.useState<Filter>(() => (isFilter(filterParam) ? filterParam : "todas"))
  const [lastFilterParam, setLastFilterParam] = React.useState(filterParam)
  if (filterParam !== lastFilterParam) {
    setLastFilterParam(filterParam)
    if (isFilter(filterParam)) setFilter(filterParam)
  }
  const [scope, setScope] = React.useState<Scope>(() => (openTask && openTask.assigneeId !== currentUserId() ? "escritorio" : "minhas"))
  const [query, setQuery] = React.useState("")
  const [editing, setEditingState] = React.useState<{ task?: Task; open: boolean }>({ open: false })
  const setEditing = (t?: Task) => setEditingState((s) => (t ? { task: t, open: true } : { ...s, open: false }))
  const [showDone, setShowDone] = React.useState(false)
  const [toDelete, setToDelete] = React.useState<Task | null>(null)

  const [lastOpenId, setLastOpenId] = React.useState(openId)
  if (openId !== lastOpenId) {
    setLastOpenId(openId)
    if (openTask && openTask.assigneeId !== currentUserId()) setScope("escritorio")
  }

  // Pendentes e concluídas há até 30 dias estão na memória; as concluídas antes disso
  // vêm do banco em páginas (e são contadas lá), e a busca procura também nelas.
  const bounds = windowBounds()
  const assignee = scope === "minhas" ? currentUserId() : undefined
  const search = React.useDeferredValue(query)
  const term = useDebounced(query.trim())
  const serverSearch = React.useMemo(() => {
    const related = [...data.clients.filter((c) => matches(term, c.name)), ...data.processes.filter((p) => matches(term, p.number, p.code))].map(
      (r) => r.id,
    )
    return searchFilter(term, [{ column: "data->related->>id", ids: related }])
  }, [term, data.clients, data.processes])
  const historyList = React.useMemo(
    () => (serverSearch ? taskSearch(term, serverSearch, assignee) : completedTasks(bounds, assignee)),
    [serverSearch, term, bounds, assignee],
  )
  const history = usePagedHistory(historyList, bounds.month, { auto: !!serverSearch })
  const stats = useHistoryStats<{ assignee_id: string | null; column_id: string | null; total: number }[]>("task_history_counts", {
    p_before: bounds.month,
  })
  const historyCount = (columnId?: string) =>
    stats?.reduce((n, r) => n + ((!assignee || r.assignee_id === assignee) && (!columnId || r.column_id === columnId) ? Number(r.total) : 0), 0)
  // Concluídas mostradas só até onde a lista está completa (mais recentes primeiro, sem buracos).
  const shown = (t: Task) => t.status === "pendente" || history.cursor === null || completedKey(t) >= history.cursor
  const inWindow = (t: Task) => t.status === "pendente" || completedKey(t) >= bounds.month

  const scoped = data.tasks.filter((t) => scope === "escritorio" || t.assigneeId === currentUserId())
  const searched = scoped.filter((t) => {
    if (!shown(t)) return false
    const r = describeRelated(data, t.related)
    return matches(search, t.title, t.description, r?.label, r?.kind)
  })
  const visible = searched.filter((t) => FILTER_TEST[filter](t))

  // Contagens: a janela (na memória) mais o histórico (contado no banco).
  const windowed = scoped.filter(inWindow)
  const doneTotal = stats ? windowed.filter((t) => t.status === "concluida").length + (historyCount() ?? 0) : undefined
  const counts = {
    ...(Object.fromEntries((Object.keys(FILTER_TEST) as Filter[]).map((f) => [f, windowed.filter(FILTER_TEST[f]).length])) as Record<Filter, number>),
    concluidas: doneTotal,
    todas: doneTotal === undefined ? undefined : windowed.filter((t) => t.status === "pendente").length + doneTotal,
  }
  // Coluna do quadro: as da janela mais as concluídas antigas daquela coluna (sem coluna = a primeira).
  const columnCount = (columnId: string, items: Task[], first: boolean) => {
    if (!stats || search) return undefined
    const extra = stats.reduce(
      (n, r) => n + ((!assignee || r.assignee_id === assignee) && (r.column_id === columnId || (first && !r.column_id)) ? Number(r.total) : 0),
      0,
    )
    return items.filter(inWindow).length + extra
  }

  const groups = buckets(getNow())
    .map((b) => ({
      ...b,
      items: visible
        .filter((t) => taskBucket(t) === b.id)
        .sort((a, c) =>
          b.id === "concluidas"
            ? (c.completedAt ?? "").localeCompare(a.completedAt ?? "")
            : a.dueAt.localeCompare(c.dueAt) || PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[c.priority].order,
        ),
    }))
    // "Concluídas" aparece mesmo sem nenhuma recente: as antigas estão no banco.
    .filter((g) => g.items.length > 0 || (g.id === "concluidas" && !search && (filter === "todas" || filter === "concluidas") && !!counts.concluidas))

  const setOpen = (id?: string) => router.replace(id ? `${pathname}?tarefa=${id}` : pathname, { scroll: false })

  const pendingMine = data.tasks.filter((t) => t.assigneeId === currentUserId() && t.status === "pendente").length
  const overdueMine = data.tasks.filter((t) => t.assigneeId === currentUserId() && isOverdue(t)).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={scope === "minhas" ? "Minhas tarefas" : "Tarefas do escritório"}
        description={
          scope === "minhas"
            ? pendingMine
              ? `Você tem ${pendingMine} tarefa${pendingMine > 1 ? "s" : ""} pendente${pendingMine > 1 ? "s" : ""}${overdueMine ? ` — ${overdueMine} atrasada${overdueMine > 1 ? "s" : ""}. Comece por elas.` : ". Priorize os prazos que vencem hoje."}`
              : "Nenhuma tarefa pendente com você. Crie uma ou veja as do escritório."
            : "Acompanhe o que cada pessoa da equipe precisa entregar."
        }
        actions={
          <>
            <div role="radiogroup" aria-label="Visualização" className="flex rounded-control border border-border bg-surface p-0.5 shadow-xs">
              {(
                [
                  { value: "board", label: "Quadro", icon: <Kanban className="size-3.5" /> },
                  { value: "list", label: "Lista", icon: <ListTodo className="size-3.5" /> },
                ] as { value: ViewMode; label: string; icon: React.ReactNode }[]
              ).map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={view === v.value}
                  onClick={() => setView(v.value)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                    view === v.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Escopo" className="flex rounded-control border border-border bg-surface p-0.5 shadow-xs">
              {(["minhas", "escritorio"] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "h-8 rounded-[7px] px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                    scope === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "minhas" ? "Minhas" : "Escritório"}
                </button>
              ))}
            </div>
            <Can permission="tasks.edit">
              <Button onClick={() => openDialog("task")}>
                <Plus /> Nova tarefa
              </Button>
            </Can>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {view === "list" ? (
          <FilterTabs
            ariaLabel="Filtrar tarefas"
            layoutId="tasks-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todas", label: "Todas", count: counts.todas },
              { value: "hoje", label: "Hoje", count: counts.hoje },
              { value: "atrasadas", label: "Atrasadas", count: counts.atrasadas },
              { value: "alta", label: "Alta prioridade", count: counts.alta },
              { value: "concluidas", label: "Concluídas", count: counts.concluidas },
            ]}
          />
        ) : (
          <div />
        )}
        <SearchField value={query} onChange={setQuery} placeholder="Buscar tarefa, cliente ou processo…" className="w-full lg:w-[300px]" />
      </div>

      {view === "board" ? (
        <BoardView tasks={searched} onOpen={setOpen} history={history} columnCount={columnCount} listKey={`${scope}|${search}`} />
      ) : !ready ? (
        <div className="space-y-5">
          {[3, 2].map((n, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <div className="rounded-card border border-border/90 bg-card">
                {Array.from({ length: n }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3.5 border-b border-border px-5 py-4 last:border-0">
                    <Skeleton className="size-[18px] rounded-[5px]" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ListChecks />}
            title={filter === "atrasadas" ? "Nenhuma tarefa atrasada." : "Nenhuma tarefa por aqui."}
            description={filter === "atrasadas" ? "Excelente — todos os prazos estão em dia." : "Crie uma tarefa ou ajuste os filtros."}
            action={
              <Can permission="tasks.edit">
                <Button size="sm" onClick={() => openDialog("task")}>
                  <Plus /> Nova tarefa
                </Button>
              </Can>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const collapsible = g.id === "concluidas" && filter !== "concluidas"
            const collapsed = collapsible && !showDone
            return (
              <section key={g.id} aria-label={g.label}>
                <header className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <button
                    type="button"
                    disabled={!collapsible}
                    onClick={() => setShowDone((v) => !v)}
                    className="touch-target relative flex items-center gap-2 text-left outline-none disabled:cursor-default"
                  >
                    <h2 className={cn("text-[13px] font-semibold", g.id === "atrasadas" ? "text-danger" : "text-foreground")}>{g.label}</h2>
                    <span className="tabular rounded-[5px] bg-surface-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                      {g.id === "concluidas" && !search ? (counts.concluidas ?? g.items.length) : g.items.length}
                    </span>
                    {collapsible && <ChevronDown className={cn("size-3.5 text-subtle transition-transform", !collapsed && "rotate-180")} />}
                  </button>
                  {g.hint && <span className="text-[12px] text-subtle">{g.hint}</span>}
                </header>
                {!collapsed && (
                  // Muitas tarefas num grupo: desenha 50 por vez; as concluídas antigas vêm do banco.
                  <LimitedList
                    items={g.items}
                    listKey={`${g.id}|${filter}|${scope}|${search}`}
                    server={g.id === "concluidas" ? history : undefined}
                    total={g.id === "concluidas" && !search ? counts.concluidas : undefined}
                  >
                    {(items) => (
                      <ul
                        className={cn(
                          "overflow-hidden rounded-[14px] border bg-card shadow-card",
                          g.id === "atrasadas" ? "border-danger/20" : "border-border",
                        )}
                      >
                        <AnimatePresence initial={false}>
                          {items.map((t) => (
                            <TaskItem
                              key={t.id}
                              task={t}
                              related={describeRelated(data, t.related)}
                              onToggle={() => toggle(t)}
                              onEdit={() => setEditing(t)}
                              onOpen={() => setOpen(t.id)}
                              onDelete={() => setToDelete(t)}
                            />
                          ))}
                        </AnimatePresence>
                      </ul>
                    )}
                  </LimitedList>
                )}
              </section>
            )
          })}
        </div>
      )}

      <TaskDetailSheet
        task={openTask}
        related={openTask ? describeRelated(data, openTask.related) : undefined}
        open={!!openTask}
        onOpenChange={(o) => !o && setOpen()}
        onToggle={(t) => toggle(t)}
        onEdit={(t) => {
          setOpen()
          window.setTimeout(() => setEditing(t), 180)
        }}
        onDelete={(t) => {
          setOpen()
          deleteTask(t.id)
          toast.success("Tarefa excluída.", { description: t.title })
        }}
      />
      <TaskFormDialog open={editing.open} onOpenChange={(o) => !o && setEditing()} task={editing.task} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir "${toDelete?.title}"?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (!toDelete) return
          deleteTask(toDelete.id)
          toast.success("Tarefa excluída.", { description: toDelete.title })
        }}
      />
    </div>
  )
}
