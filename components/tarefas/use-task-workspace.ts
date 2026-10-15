"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useDebounced, useHistoryStats, usePagedHistory } from "@/lib/store/on-demand"
import { completedKey, completedTasks, taskSearch } from "@/lib/store/history-lists"
import { byId } from "@/lib/store/indexes"
import { searchFilter } from "@/lib/store/storage"
import { describeRelated } from "@/lib/store/selectors"
import { createLocalStore } from "@/lib/core/hooks"
import { getNow } from "@/lib/core/dates"
import { matches } from "@/lib/core/format"
import { CATEGORY_COLORS } from "@/lib/core/config"
import { currentUserId } from "@/lib/auth/account"
import { useSession } from "@/lib/auth/session"
import {
  columnOfTask,
  kpiCounts,
  matchesTask,
  readWorkspace,
  workspaceParams,
  type MatchContext,
  type TaskView,
  type WorkspaceState,
} from "@/lib/tarefas/workspace"
import type { Task, TaskColumn } from "@/types"

/** Colunas padrão, criadas na primeira vez que o escritório abre o quadro. */
export const DEFAULT_COLUMNS: { name: string; color: string; isDone?: boolean }[] = [
  { name: "A fazer", color: CATEGORY_COLORS[6].value },
  { name: "Em andamento", color: CATEGORY_COLORS[4].value },
  { name: "Concluído", color: CATEGORY_COLORS[5].value, isDone: true },
]

/** Última visão usada (preferência do navegador; a URL vale por cima). */
const viewStore = createLocalStore("lexa:tarefas:visao", "quadro")

type HistoryRow = { assignee_id: string | null; column_id: string | null; total: number }

/**
 * Estado e dados da área de Tarefas. Pendentes e concluídas recentes estão na memória;
 * as concluídas antigas vêm do banco em páginas (contadas lá), e a busca procura em todas.
 * Lugar, visão e filtros ficam na URL (atualizar, voltar e compartilhar levam ao mesmo lugar).
 */
export function useTaskWorkspace() {
  const data = useOfficeData()
  const { windowBounds, ensureDefaultTaskColumns } = useOfficeActions()
  const editable = useSession().can("tasks.edit")
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const paramsKey = params.toString()
  const storedView = React.useSyncExternalStore(viewStore.subscribe, viewStore.get, viewStore.getServer) as TaskView
  const urlState = React.useMemo(() => readWorkspace(new URLSearchParams(paramsKey), storedView), [paramsKey, storedView])

  // A tela muda na hora; a URL acompanha logo depois (e manda, se mudar por outro caminho).
  const [pending, setPending] = React.useState<WorkspaceState | null>(null)
  const [seenKey, setSeenKey] = React.useState(paramsKey)
  if (seenKey !== paramsKey) {
    setSeenKey(paramsKey)
    setPending(null)
  }
  const state = pending ?? urlState
  const openId = params.get("tarefa") ?? undefined

  const replace = React.useCallback(
    (next: WorkspaceState, extra?: Record<string, string>) => {
      setPending(next)
      viewStore.set(next.view)
      router.replace(`${pathname}?${workspaceParams(next, extra).toString()}`, { scroll: false })
    },
    [router, pathname],
  )
  const setState = React.useCallback((next: WorkspaceState) => replace(next, openId ? { tarefa: openId } : undefined), [replace, openId])
  const openTask = React.useCallback((id?: string) => replace(state, id ? { tarefa: id } : undefined), [replace, state])

  // Colunas: as do escritório; a primeira vez, as padrão (criadas uma vez, com id fixo).
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (!editable || !data.hydrated || seeded.current || data.taskColumns.length > 0) return
    seeded.current = true
    void ensureDefaultTaskColumns(DEFAULT_COLUMNS)
  }, [editable, data.hydrated, data.taskColumns.length, ensureDefaultTaskColumns])
  const columns: TaskColumn[] = React.useMemo(
    () =>
      data.taskColumns.length
        ? [...data.taskColumns].sort((a, b) => a.order - b.order)
        : editable
          ? []
          : DEFAULT_COLUMNS.map((c, order) => ({ ...c, id: `padrao-${order}`, order, organizationId: "", createdAt: "" })),
    [data.taskColumns, editable],
  )

  const [query, setQuery] = React.useState("")
  const search = React.useDeferredValue(query)
  const term = useDebounced(query.trim())
  const me = currentUserId()
  const assignee = state.scope === "minhas" ? me : undefined

  const bounds = windowBounds()
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
  const stats = useHistoryStats<HistoryRow[]>("task_history_counts", { p_before: bounds.month })

  const relatedText = React.useCallback(
    (t: Task) => {
      const r = describeRelated(data, t.related)
      return r ? `${r.label} ${r.kind}` : undefined
    },
    [data],
  )
  const ctx: MatchContext = React.useMemo(
    () => ({ now: getNow(), columns, clientOfProcess: (id: string) => byId(data.processes, id)?.clientId, relatedText }),
    [columns, data.processes, relatedText],
  )

  // Concluídas só até onde a lista está completa (mais recentes primeiro, sem buracos).
  const contiguous = (t: Task) => t.status === "pendente" || history.cursor === null || completedKey(t) >= history.cursor
  const inWindow = (t: Task) => t.status === "pendente" || completedKey(t) >= bounds.month
  const scoped = data.tasks.filter((t) => state.scope === "escritorio" || t.assigneeId === me)
  const visible = scoped.filter((t) => contiguous(t) && matchesTask(t, state.filters, ctx, search))

  // Indicadores do escopo: pendentes (todas na memória) e concluídas (janela + histórico no banco).
  const counts = kpiCounts(scoped.filter(inWindow), ctx.now)
  const historyDone = stats?.reduce((n, r) => n + (!assignee || r.assignee_id === assignee ? Number(r.total) : 0), 0)
  const kpis = { ...counts, concluidas: historyDone === undefined ? undefined : counts.concluidas + historyDone }

  /** Total da coluna (memória + concluídas antigas daquela coluna no banco), quando já contado. */
  const columnTotal = (column: TaskColumn, items: Task[]) => {
    if (!stats || search || hasNarrowing(state)) return undefined
    const fallbackDone = columns.find((c) => c.isDone)?.id
    const extra = stats.reduce((n, r) => {
      if (assignee && r.assignee_id !== assignee) return n
      // Coluna antiga que não existe mais: as concluídas dela contam na primeira coluna que conclui.
      const known = r.column_id && columns.some((c) => c.id === r.column_id)
      const id = known ? r.column_id : fallbackDone
      return n + (id === column.id ? Number(r.total) : 0)
    }, 0)
    return items.filter(inWindow).length + extra
  }

  return {
    ready: data.hydrated,
    loadError: !data.hydrated && !!data.loadError,
    state,
    setState,
    openId,
    openTask,
    query,
    setQuery,
    searching: !!query.trim() && (term !== query.trim() || (!!serverSearch && history.loading)),
    columns,
    columnOf: (t: Task) => columnOfTask(t, columns),
    visible,
    scopedCount: scoped.length,
    kpis,
    history,
    columnTotal,
    listKey: `${state.scope}|${search}|${JSON.stringify(state.filters)}`,
    editable,
    search,
  }
}

/** Há algo além do escopo restringindo a lista (as contagens do banco deixam de valer). */
function hasNarrowing(s: WorkspaceState) {
  const f = s.filters
  return !!(f.columns.length || f.priorities.length || f.assignees.length || f.due || f.clientId || f.processId || f.situation !== "todas")
}
