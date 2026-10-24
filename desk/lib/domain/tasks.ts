import type { Recurrence } from "@/lib/db/schema"
import { addDays, addMonths, diffDays, type LocalDate } from "./dates"

export const TASK_STATUSES = ["todo", "in_progress", "done", "archived"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ["low", "medium", "high"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  done: "Concluída",
  archived: "Arquivada",
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Baixa", medium: "Média", high: "Alta" }
export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

export const RECURRENCE_LABEL: Record<Recurrence["freq"], [string, string]> = {
  daily: ["Todo dia", "dias"],
  weekly: ["Toda semana", "semanas"],
  monthly: ["Todo mês", "meses"],
  yearly: ["Todo ano", "anos"],
}

export function describeRecurrence(r: Recurrence): string {
  const [single, plural] = RECURRENCE_LABEL[r.freq]
  return r.interval === 1 ? single : `A cada ${r.interval} ${plural}`
}

export function isOpenStatus(status: TaskStatus): boolean {
  return status === "todo" || status === "in_progress"
}

/**
 * Atrasada: aberta e com prazo anterior a hoje (data local da pessoa).
 * Sem prazo nunca é atrasada; concluída ou arquivada também não.
 */
export function isOverdue(task: { status: TaskStatus; dueDate: LocalDate | null }, today: LocalDate): boolean {
  return isOpenStatus(task.status) && task.dueDate !== null && task.dueDate < today
}

export function isDueToday(task: { status: TaskStatus; dueDate: LocalDate | null }, today: LocalDate): boolean {
  return isOpenStatus(task.status) && task.dueDate === today
}

/**
 * Efeito de mudar o status sobre a data de conclusão. Concluir registra o instante;
 * reabrir (voltar para a fazer/em andamento) apaga a conclusão; arquivar preserva o que havia.
 */
export function completionForStatus(next: TaskStatus, current: { status: TaskStatus; completedAt: Date | null }, now: Date): Date | null {
  if (next === "done") return current.status === "done" && current.completedAt ? current.completedAt : now
  if (next === "archived") return current.completedAt
  return null
}

/** Próxima data de uma tarefa recorrente, a partir do prazo (ou do início, ou de hoje). */
export function nextOccurrence(from: LocalDate, recurrence: Recurrence): LocalDate {
  const n = Math.max(1, Math.floor(recurrence.interval))
  switch (recurrence.freq) {
    case "daily":
      return addDays(from, n)
    case "weekly":
      return addDays(from, 7 * n)
    case "monthly":
      return addMonths(from, n)
    case "yearly":
      return addMonths(from, 12 * n)
  }
}

/**
 * Datas da próxima ocorrência: o prazo avança pela regra e o início mantém a mesma
 * distância do prazo que tinha na ocorrência concluída.
 */
export function nextOccurrenceDates(
  task: { startDate: LocalDate | null; dueDate: LocalDate | null },
  recurrence: Recurrence,
  today: LocalDate,
): { startDate: LocalDate | null; dueDate: LocalDate | null } {
  const anchor = task.dueDate ?? task.startDate ?? today
  const nextAnchor = nextOccurrence(anchor, recurrence)
  const shift = (d: LocalDate | null) => (d === null ? null : addDays(d, diffDays(anchor, nextAnchor)))
  if (!task.dueDate && !task.startDate) return { startDate: null, dueDate: nextAnchor }
  return { startDate: shift(task.startDate), dueDate: shift(task.dueDate) }
}

export type Progress = { total: number; done: number; percent: number } | null

/**
 * Progresso de um projeto: concluídas sobre tarefas não arquivadas. Sem tarefas elegíveis,
 * não há progresso (null) — a interface mostra "Sem tarefas" em vez de inventar 0%.
 */
export function projectProgress(tasks: { status: TaskStatus }[]): Progress {
  const eligible = tasks.filter((t) => t.status !== "archived")
  if (eligible.length === 0) return null
  const done = eligible.filter((t) => t.status === "done").length
  return { total: eligible.length, done, percent: Math.round((done / eligible.length) * 100) }
}

/** Ordenação padrão das listas: atrasadas e prazos próximos primeiro, depois prioridade. */
export function compareTasks(
  a: { dueDate: LocalDate | null; priority: TaskPriority; number: number },
  b: { dueDate: LocalDate | null; priority: TaskPriority; number: number },
): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  return p !== 0 ? p : a.number - b.number
}

/** Posição entre dois vizinhos no kanban (ordem fracionária, sem renumerar a coluna). */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024
  if (before === null) return after! - 1024
  if (after === null) return before + 1024
  return (before + after) / 2
}

export function formatEstimate(minutes: number | null): string | null {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export const taskCode = (n: number) => `T-${n}`
