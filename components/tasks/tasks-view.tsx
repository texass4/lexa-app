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
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { createLocalStore } from "@/lib/hooks"
import { addDays, getNow, monthShort, startOfWeek, weekdayName } from "@/lib/dates"
import { describeRelated, isOverdue, taskBucket, type TaskBucket } from "@/lib/selectors"
import { PRIORITY_CONFIG } from "@/lib/config"
import { matches } from "@/lib/format"
import { currentUserId } from "@/lib/account"
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
  const data = useDemoData()
  const { deleteTask } = useDemoActions()
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
  const openTask = openId ? data.tasks.find((t) => t.id === openId) : undefined

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

  const scoped = data.tasks.filter((t) => scope === "escritorio" || t.assigneeId === currentUserId())
  const searched = scoped.filter((t) => {
    const r = describeRelated(data, t.related)
    return matches(query, t.title, t.description, r?.label, r?.kind)
  })
  const visible = searched.filter((t) => FILTER_TEST[filter](t))

  const counts = Object.fromEntries((Object.keys(FILTER_TEST) as Filter[]).map((f) => [f, scoped.filter(FILTER_TEST[f]).length])) as Record<
    Filter,
    number
  >

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
    .filter((g) => g.items.length > 0)

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
            <div role="radiogroup" aria-label="Visualização" className="flex rounded-[9px] border border-border bg-surface p-0.5 shadow-xs">
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
                    "flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                    view === v.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Escopo" className="flex rounded-[9px] border border-border bg-surface p-0.5 shadow-xs">
              {(["minhas", "escritorio"] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "h-8 rounded-[7px] px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
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
        <BoardView tasks={searched} onOpen={setOpen} />
      ) : !ready ? (
        <div className="space-y-5">
          {[3, 2].map((n, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <div className="rounded-[14px] border border-border bg-card">
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
                    className="flex items-center gap-2 text-left outline-none disabled:cursor-default"
                  >
                    <h2 className={cn("text-[13px] font-semibold", g.id === "atrasadas" ? "text-danger" : "text-foreground")}>{g.label}</h2>
                    <span className="tabular rounded-[5px] bg-surface-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                      {g.items.length}
                    </span>
                    {collapsible && <ChevronDown className={cn("size-3.5 text-subtle transition-transform", !collapsed && "rotate-180")} />}
                  </button>
                  {g.hint && <span className="text-[12px] text-subtle">{g.hint}</span>}
                </header>
                {!collapsed && (
                  <ul
                    className={cn(
                      "overflow-hidden rounded-[14px] border bg-card shadow-card",
                      g.id === "atrasadas" ? "border-danger/20" : "border-border",
                    )}
                  >
                    <AnimatePresence initial={false}>
                      {g.items.map((t) => (
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
