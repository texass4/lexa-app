/**
 * Números do Painel — funções puras sobre os dados reais do escritório (testadas em
 * `dashboard.test.ts`). Nada aqui é estimado nem vem de IA: são contagens e somas.
 */

import type { Invoice, Prazo, Process, ProcessMovement, Task } from "@/types"
import { diffInDays, getNow, parse } from "@/lib/core/dates"
import { daysSinceMovement, isActiveProcess, PRAZO_ALERT_DAYS, RECENT_DAYS } from "@/lib/dashboard/attention"
import { daysToPrazo, isOpenPrazo } from "@/lib/prazos/prazos"
import { financeSummary, invoiceStatus, taskBucket } from "@/lib/store/selectors"

const sameMonth = (iso: string, now: Date) => {
  const d = parse(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export interface DashboardData {
  clients: { createdAt: string }[]
  processes: Process[]
  tasks: Task[]
  invoices: Invoice[]
  deadlines: readonly Prazo[]
}

/** Indicadores do topo: total + o que mudou no período. */
export function dashboardKpis(data: DashboardData, now: Date = getNow()) {
  const active = data.processes.filter(isActiveProcess)
  const pending = data.tasks.filter((t) => t.status === "pendente")
  const finance = financeSummary(data.invoices, now)
  return {
    clients: { total: data.clients.length, newThisMonth: data.clients.filter((c) => sameMonth(c.createdAt, now)).length },
    processes: { active: active.length, newThisMonth: data.processes.filter((p) => sameMonth(p.createdAt, now)).length },
    tasks: {
      pending: pending.length,
      overdue: pending.filter((t) => taskBucket(t, now) === "atrasadas").length,
      thisWeek: pending.filter((t) => ["hoje", "amanha", "semana"].includes(taskBucket(t, now))).length,
    },
    finance: { received: finance.received, growth: finance.growth, month: finance.month },
  }
}

/* -------------------------- Movimentações recentes -------------------------- */

export interface RecentMovement {
  process: Process
  movement: ProcessMovement
}

/**
 * As movimentações mais recentes dos processos do escritório, da mais nova para a
 * mais antiga. No Painel os processos vêm resumidos (só a última movimentação de
 * cada um, `movementsPartial`), então a lista mostra no máximo uma por processo.
 */
/** Registro interno do cadastro manual ("Processo cadastrado", `addProcess`) — não é movimentação do processo. */
const isRegistrationMarker = (m: ProcessMovement) => m.kind === "distribution" && !m.origin && !m.code && m.title === "Processo cadastrado"

export function recentMovements(processes: readonly Process[], limit = 5): RecentMovement[] {
  const latest: RecentMovement[] = []
  for (const process of processes) {
    const movement = process.movements
      .filter((m) => !isRegistrationMarker(m))
      .reduce<ProcessMovement | undefined>((best, m) => (!best || m.at > best.at ? m : best), undefined)
    if (movement) latest.push({ process, movement })
  }
  return latest.sort((a, b) => b.movement.at.localeCompare(a.movement.at)).slice(0, limit)
}

/** "agora", "14 min", "3 h", "2 d", "12/09" — tempo desde a última movimentação. */
export function shortAgo(iso: string | undefined, now: Date = getNow()) {
  if (!iso) return "—"
  const minutes = Math.floor((now.getTime() - parse(iso).getTime()) / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`
  const days = diffInDays(now, parse(iso))
  if (days < 30) return `${days} d`
  const d = parse(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/* -------------------------------- Resumo ---------------------------------- */

/** Números do banner do topo: o que a Íntegra acompanha e o que encontrou. */
export function officeDigest(data: Pick<DashboardData, "processes" | "deadlines" | "invoices">, now: Date = getNow()) {
  const active = data.processes.filter(isActiveProcess)
  return {
    activeProcesses: active.length,
    recentMovements: active.filter((p) => {
      const days = daysSinceMovement(p, now)
      return days !== undefined && days >= 0 && days <= RECENT_DAYS
    }).length,
    upcomingPrazos: data.deadlines.filter((d) => isOpenPrazo(d) && daysToPrazo(d, now) >= 0 && daysToPrazo(d, now) <= PRAZO_ALERT_DAYS.week).length,
    overdueInvoices: data.invoices.filter((i) => invoiceStatus(i, now) === "atrasado").length,
  }
}

/* -------------------------------- Tarefas --------------------------------- */

export type TaskTab = "todas" | "atrasadas" | "hoje" | "amanha"

/** Tarefas em aberto por aba, das mais urgentes para as mais distantes. */
export function openTasksByTab(tasks: Task[], now: Date = getNow()): Record<TaskTab, Task[]> {
  const pending = tasks.filter((t) => t.status === "pendente").sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  return {
    todas: pending,
    atrasadas: pending.filter((t) => taskBucket(t, now) === "atrasadas"),
    hoje: pending.filter((t) => taskBucket(t, now) === "hoje"),
    amanha: pending.filter((t) => taskBucket(t, now) === "amanha"),
  }
}

/* ------------------------------- Financeiro ------------------------------- */

/** Parcelas vencidas e não pagas, da mais antiga para a mais recente. */
export function overdueInvoices(invoices: Invoice[], now: Date = getNow()) {
  return invoices
    .filter((i) => invoiceStatus(i, now) === "atrasado")
    .map((invoice) => ({ invoice, daysLate: diffInDays(now, parse(invoice.dueDate)) }))
    .sort((a, b) => b.daysLate - a.daysLate)
}
