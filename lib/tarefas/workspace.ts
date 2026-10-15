/**
 * Modelo da área de Tarefas: visões (quadro, lista, calendário), escopo (minhas ou do
 * escritório) e filtros — todos sobre os campos reais da tarefa: coluna do quadro
 * (que define a situação), prioridade, responsável, prazo e vínculo com cliente/processo.
 */

import { PRIORITY_CONFIG } from "@/lib/core/config"
import { diffInDays, parse } from "@/lib/core/dates"
import { matches } from "@/lib/core/format"
import type { Priority, Task, TaskColumn } from "@/types"

export type TaskView = "quadro" | "lista" | "calendario"
export type TaskScope = "minhas" | "escritorio"
export type DueFilter = "atrasadas" | "hoje" | "amanha" | "semana" | "proximas"
export type Situation = "todas" | "pendentes" | "concluidas"

export const VIEWS: { value: TaskView; label: string }[] = [
  { value: "quadro", label: "Quadro" },
  { value: "lista", label: "Lista" },
  { value: "calendario", label: "Calendário" },
]

export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: "atrasadas", label: "Atrasadas" },
  { value: "hoje", label: "Vencem hoje" },
  { value: "amanha", label: "Vencem amanhã" },
  { value: "semana", label: "Esta semana" },
  { value: "proximas", label: "Depois desta semana" },
]

export const SITUATIONS: { value: Situation; label: string }[] = [
  { value: "todas", label: "Pendentes e concluídas" },
  { value: "pendentes", label: "Só pendentes" },
  { value: "concluidas", label: "Só concluídas" },
]

export const PRIORITIES: Priority[] = ["alta", "media", "baixa"]

export interface TaskFilters {
  /** Colunas do quadro (a "situação" da tarefa no fluxo do escritório). */
  columns: string[]
  priorities: Priority[]
  assignees: string[]
  due?: DueFilter
  clientId?: string
  processId?: string
  situation: Situation
}

export interface WorkspaceState {
  view: TaskView
  scope: TaskScope
  filters: TaskFilters
}

export const EMPTY_FILTERS: TaskFilters = { columns: [], priorities: [], assignees: [], situation: "todas" }

const VIEW_SET = new Set<string>(VIEWS.map((v) => v.value))
const DUE_SET = new Set<string>(DUE_FILTERS.map((d) => d.value))
const SITUATION_SET = new Set<string>(SITUATIONS.map((s) => s.value))
const list = (v: string | null) => (v ?? "").split(",").filter(Boolean)

/** Indicadores do topo: cada um é um filtro real (e o filtro fica visível nos chips). */
export type Kpi = "atrasadas" | "hoje" | "alta" | "concluidas"

export const KPI_FILTERS: Record<Kpi, Partial<TaskFilters>> = {
  atrasadas: { due: "atrasadas", situation: "pendentes" },
  hoje: { due: "hoje", situation: "pendentes" },
  alta: { priorities: ["alta"], situation: "pendentes" },
  concluidas: { situation: "concluidas" },
}

export function applyKpi(filters: TaskFilters, kpi: Kpi): TaskFilters {
  return {
    ...EMPTY_FILTERS,
    columns: filters.columns,
    assignees: filters.assignees,
    clientId: filters.clientId,
    processId: filters.processId,
    ...KPI_FILTERS[kpi],
  }
}

export function isKpiActive(filters: TaskFilters, kpi: Kpi) {
  const preset = KPI_FILTERS[kpi]
  return (Object.keys(preset) as (keyof TaskFilters)[]).every((k) => JSON.stringify(filters[k]) === JSON.stringify(preset[k]))
}

/**
 * Estado a partir da URL. Mantém os links que já existem: `?filtro=atrasadas|hoje|alta|concluidas`
 * (Início, sinais de atenção) e `?escopo=escritorio`.
 */
export function readWorkspace(params: URLSearchParams, fallbackView: TaskView = "quadro"): WorkspaceState {
  const view = params.get("visao") ?? ""
  const filters: TaskFilters = {
    columns: list(params.get("coluna")),
    priorities: list(params.get("prioridade")).filter((p): p is Priority => p in PRIORITY_CONFIG),
    assignees: list(params.get("responsavel")),
    situation: SITUATION_SET.has(params.get("situacao") ?? "") ? (params.get("situacao") as Situation) : "todas",
  }
  const due = params.get("prazo") ?? ""
  if (DUE_SET.has(due)) filters.due = due as DueFilter
  if (params.get("cliente")) filters.clientId = params.get("cliente")!
  if (params.get("processo")) filters.processId = params.get("processo")!
  const legacy = params.get("filtro") ?? ""
  const kpi = legacy in KPI_FILTERS ? (legacy as Kpi) : undefined
  return {
    // O link antigo de filtro abria a lista: continua abrindo.
    view: VIEW_SET.has(view) ? (view as TaskView) : kpi ? "lista" : fallbackView,
    scope: params.get("escopo") === "escritorio" ? "escritorio" : "minhas",
    filters: kpi ? applyKpi(filters, kpi) : filters,
  }
}

export function workspaceParams(s: WorkspaceState, extra?: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams()
  p.set("visao", s.view)
  if (s.scope === "escritorio") p.set("escopo", "escritorio")
  const f = s.filters
  if (f.columns.length) p.set("coluna", f.columns.join(","))
  if (f.priorities.length) p.set("prioridade", f.priorities.join(","))
  if (f.assignees.length) p.set("responsavel", f.assignees.join(","))
  if (f.due) p.set("prazo", f.due)
  if (f.clientId) p.set("cliente", f.clientId)
  if (f.processId) p.set("processo", f.processId)
  if (f.situation !== "todas") p.set("situacao", f.situation)
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v)
  return p
}

export type FilterChip = { key: keyof TaskFilters; value?: string }

export function activeChips(f: TaskFilters): FilterChip[] {
  const out: FilterChip[] = []
  for (const v of f.columns) out.push({ key: "columns", value: v })
  for (const v of f.priorities) out.push({ key: "priorities", value: v })
  for (const v of f.assignees) out.push({ key: "assignees", value: v })
  if (f.due) out.push({ key: "due" })
  if (f.clientId) out.push({ key: "clientId" })
  if (f.processId) out.push({ key: "processId" })
  if (f.situation !== "todas") out.push({ key: "situation" })
  return out
}

export function removeChip(f: TaskFilters, chip: FilterChip): TaskFilters {
  if (chip.key === "columns" || chip.key === "priorities" || chip.key === "assignees") {
    return { ...f, [chip.key]: (f[chip.key] as string[]).filter((v) => v !== chip.value) }
  }
  if (chip.key === "situation") return { ...f, situation: "todas" }
  return { ...f, [chip.key]: undefined }
}

const sortedColumns = (columns: TaskColumn[]) => [...columns].sort((a, b) => a.order - b.order)

/**
 * Coluna em que a tarefa aparece. Sem coluna — ou com uma coluna que já foi excluída
 * (tarefas antigas que não estavam na memória quando a coluna saiu) —, a tarefa vai
 * para a primeira coluna que corresponde à situação dela: nunca some do quadro.
 */
export function columnOfTask(task: Task, columns: TaskColumn[]): TaskColumn | undefined {
  const own = task.columnId ? columns.find((c) => c.id === task.columnId) : undefined
  if (own) return own
  const ordered = sortedColumns(columns)
  return task.status === "concluida" ? (ordered.find((c) => c.isDone) ?? ordered.at(-1)) : (ordered.find((c) => !c.isDone) ?? ordered[0])
}

/** Coluna de destino ao concluir (a primeira que conclui) ou ao reabrir (a primeira que não conclui). */
export function columnForStatus(columns: TaskColumn[], done: boolean): TaskColumn | undefined {
  const ordered = sortedColumns(columns)
  return done ? ordered.find((c) => c.isDone) : ordered.find((c) => !c.isDone)
}

/** Grupo do prazo de uma tarefa pendente (mesmas regras de dias do restante do Íntegra). */
export function dueGroup(task: Task, now: Date): DueFilter {
  const diff = diffInDays(parse(task.dueAt), now)
  if (diff < 0) return "atrasadas"
  if (diff === 0) return "hoje"
  if (diff === 1) return "amanha"
  if (diff <= 6 - ((now.getDay() + 6) % 7)) return "semana"
  return "proximas"
}

export interface MatchContext {
  now: Date
  columns: TaskColumn[]
  /** Cliente do processo (para filtrar por cliente tarefas ligadas a processos dele). */
  clientOfProcess: (processId: string) => string | undefined
  /** Texto do vínculo (cliente ou processo) para a busca. */
  relatedText?: (task: Task) => string | undefined
}

export function matchesTask(t: Task, f: TaskFilters, ctx: MatchContext, search = ""): boolean {
  const done = t.status === "concluida"
  if (f.situation === "pendentes" && done) return false
  if (f.situation === "concluidas" && !done) return false
  if (f.columns.length && !f.columns.includes(columnOfTask(t, ctx.columns)?.id ?? "")) return false
  if (f.priorities.length && !f.priorities.includes(t.priority)) return false
  if (f.assignees.length && !f.assignees.includes(t.assigneeId)) return false
  // Prazo: só faz sentido para o que está pendente (concluída não está atrasada).
  if (f.due && (done || dueGroup(t, ctx.now) !== f.due)) return false
  if (f.processId && !(t.related?.type === "process" && t.related.id === f.processId)) return false
  if (f.clientId) {
    const r = t.related
    const client = r?.type === "client" ? r.id : r?.type === "process" ? ctx.clientOfProcess(r.id) : undefined
    if (client !== f.clientId) return false
  }
  return matches(search, t.title, t.description, ctx.relatedText?.(t))
}

export type SortKey = "prazo" | "prioridade" | "titulo" | "status" | "responsavel" | "criada"
export type SortDir = "asc" | "desc"

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "prazo", label: "Prazo" },
  { value: "prioridade", label: "Prioridade" },
  { value: "titulo", label: "Título" },
  { value: "status", label: "Status" },
  { value: "responsavel", label: "Responsável" },
  { value: "criada", label: "Criada em" },
]

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })

export function sortTasks(tasks: Task[], key: SortKey, dir: SortDir, ctx: { columns: TaskColumn[]; assigneeName: (id: string) => string }): Task[] {
  const sign = dir === "asc" ? 1 : -1
  const order = new Map(sortedColumns(ctx.columns).map((c, i) => [c.id, i]))
  const byDue = (a: Task, b: Task) => a.dueAt.localeCompare(b.dueAt)
  const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
    prazo: byDue,
    prioridade: (a, b) => PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order,
    titulo: (a, b) => collator.compare(a.title, b.title),
    status: (a, b) => (order.get(columnOfTask(a, ctx.columns)?.id ?? "") ?? 99) - (order.get(columnOfTask(b, ctx.columns)?.id ?? "") ?? 99),
    responsavel: (a, b) => collator.compare(ctx.assigneeName(a.assigneeId), ctx.assigneeName(b.assigneeId)),
    criada: (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  }
  // Desempate estável: prazo e depois o id.
  return [...tasks].sort((a, b) => sign * cmp[key](a, b) || byDue(a, b) || a.id.localeCompare(b.id))
}

/** Ordem dentro de uma coluna do quadro: pendentes pelo prazo (atrasadas no topo), concluídas das mais recentes. */
export function boardOrder(a: Task, b: Task) {
  return (
    Number(a.status === "concluida") - Number(b.status === "concluida") ||
    (a.status === "concluida"
      ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
      : a.dueAt.localeCompare(b.dueAt) || PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order)
  )
}

/** Indicadores das tarefas na memória (pendentes: todas; concluídas: a janela recente). */
export function kpiCounts(tasks: Task[], now: Date) {
  let atrasadas = 0
  let hoje = 0
  let alta = 0
  let concluidas = 0
  for (const t of tasks) {
    if (t.status === "concluida") {
      concluidas++
      continue
    }
    const g = dueGroup(t, now)
    if (g === "atrasadas") atrasadas++
    else if (g === "hoje") hoje++
    if (t.priority === "alta") alta++
  }
  return { atrasadas, hoje, alta, concluidas }
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export function checklistProgress(task: Task) {
  const items = task.checklist ?? []
  return { done: items.filter((i) => i.done).length, total: items.length }
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const dayKey = ymd

/** Semanas (segunda a domingo) que cobrem o mês, como no calendário da Agenda. */
export function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i))
    if (w > 3 && week[0].getMonth() !== month) break
    weeks.push(week)
  }
  return weeks
}

/** Tarefas agrupadas pelo dia do prazo (`YYYY-MM-DD`), sem inventar horário. */
export function tasksByDay(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of tasks) {
    const key = t.dueAt.slice(0, 10)
    const day = map.get(key)
    if (day) day.push(t)
    else map.set(key, [t])
  }
  for (const day of map.values()) day.sort(boardOrder)
  return map
}
