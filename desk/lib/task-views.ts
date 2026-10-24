import { addDays, isLocalDate, startOfWeek, type LocalDate } from "@/lib/domain/dates"
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/domain/tasks"
import type { TaskFilter } from "@/lib/validation"

/*
 * Visualizações de tarefas: todas leem a mesma tabela, só mudam filtro e apresentação.
 * Os parâmetros ficam na URL, então cada visualização pode ser aberta por link.
 */

export const TASK_VIEWS = [
  { id: "list", label: "Lista" },
  { id: "today", label: "Hoje" },
  { id: "upcoming", label: "Próximas" },
  { id: "overdue", label: "Atrasadas" },
  { id: "board", label: "Kanban" },
  { id: "calendar", label: "Calendário" },
  { id: "grouped", label: "Por projeto/área" },
] as const
export type TaskView = (typeof TASK_VIEWS)[number]["id"]

export type TaskSearchParams = {
  view: TaskView
  status: "open" | "all" | TaskStatus
  priority: TaskPriority | ""
  project: string
  area: string
  tag: string
  due: "any" | "none" | "week" | "range"
  from: string
  to: string
  q: string
  group: "project" | "area"
  month: string
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback)
const str = (value: unknown) => (typeof value === "string" ? value.slice(0, 200) : "")
const UUID = /^[0-9a-f-]{36}$/i

export function parseTaskParams(raw: Record<string, string | string[] | undefined>): TaskSearchParams {
  const month = str(raw.month)
  return {
    view: pick(raw.view, TASK_VIEWS.map((v) => v.id), "list"),
    status: pick(raw.status, ["open", "all", ...TASK_STATUSES], "open"),
    priority: pick(raw.priority, ["", ...TASK_PRIORITIES], ""),
    project: str(raw.project) === "none" || UUID.test(str(raw.project)) ? str(raw.project) : "",
    area: str(raw.area) === "none" || UUID.test(str(raw.area)) ? str(raw.area) : "",
    tag: str(raw.tag),
    due: pick(raw.due, ["any", "none", "week", "range"], "any"),
    from: isLocalDate(raw.from) ? raw.from : "",
    to: isLocalDate(raw.to) ? raw.to : "",
    q: str(raw.q),
    group: pick(raw.group, ["project", "area"], "project"),
    month: /^\d{4}-\d{2}$/.test(month) ? month : "",
  }
}

/** Filtro comum (barra de filtros) aplicado a qualquer visualização. */
export function baseFilter(p: TaskSearchParams, today: LocalDate, weekStartsOn: number): TaskFilter {
  const filter: TaskFilter = {}
  if (p.status === "open") filter.status = ["todo", "in_progress"]
  else if (p.status === "all") filter.status = ["todo", "in_progress", "done", "archived"]
  else filter.status = [p.status]
  if (p.priority) filter.priority = [p.priority]
  if (p.project) filter.projectId = p.project as TaskFilter["projectId"]
  if (p.area) filter.areaId = p.area as TaskFilter["areaId"]
  if (p.tag) filter.tag = p.tag
  if (p.q) filter.query = p.q
  if (p.due === "none") filter.noDueDate = true
  if (p.due === "week") {
    const start = startOfWeek(today, weekStartsOn)
    filter.dueFrom = start
    filter.dueTo = addDays(start, 6)
  }
  if (p.due === "range") {
    if (p.from) filter.dueFrom = p.from
    if (p.to) filter.dueTo = p.to
  }
  return filter
}

/** Monta a URL de tarefas trocando alguns parâmetros e mantendo os outros. */
export function taskHref(p: TaskSearchParams, changes: Partial<TaskSearchParams>): string {
  const next = { ...p, ...changes }
  const defaults: Partial<TaskSearchParams> = { view: "list", status: "open", priority: "", project: "", area: "", tag: "", due: "any", from: "", to: "", q: "", group: "project", month: "" }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(next)) {
    if (value && value !== defaults[key as keyof TaskSearchParams]) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/tasks?${query}` : "/tasks"
}

export function hasActiveFilters(p: TaskSearchParams): boolean {
  return p.status !== "open" || !!p.priority || !!p.project || !!p.area || !!p.tag || p.due !== "any" || !!p.q
}
