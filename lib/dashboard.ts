/**
 * Números do Painel — funções puras sobre os dados reais do escritório (testadas em
 * `dashboard.test.ts`). Nada aqui é estimado nem vem de IA: são contagens e somas.
 */

import type { Invoice, Prazo, Process, Task } from "@/types"
import { diffInDays, getNow, parse } from "./dates"
import { daysSinceMovement, isActiveProcess, PRAZO_ALERT_DAYS, RECENT_DAYS } from "./attention"
import { daysToPrazo, isOpenPrazo } from "./prazos"
import { financeSummary, invoiceStatus, taskBucket } from "./selectors"

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

/* ---------------------------- Processos recentes --------------------------- */

export type RecentState = "prazo" | "nova" | "movimentacao" | "sem-novidades"

export const RECENT_STATE_LABEL: Record<RecentState, string> = {
  prazo: "Prazo próximo",
  nova: "Nova movimentação",
  movimentacao: "Movimentação",
  "sem-novidades": "Sem novidades",
}

/** Movimentação "nova": nos últimos 2 dias. */
const NEW_MOVEMENT_DAYS = 2

export interface RecentProcess {
  process: Process
  state: RecentState
  /** Prazo aberto mais próximo, quando vence em até `PRAZO_ALERT_DAYS.week` dias. */
  prazo?: Prazo
}

/** Processos ativos com a movimentação mais recente primeiro, cada um com o seu estado. */
export function recentProcesses(data: Pick<DashboardData, "processes" | "deadlines">, now: Date = getNow(), limit = 4): RecentProcess[] {
  return data.processes
    .filter(isActiveProcess)
    .sort((a, b) => (b.lastMovementAt ?? "").localeCompare(a.lastMovementAt ?? ""))
    .slice(0, limit)
    .map((process) => {
      const prazo = data.deadlines
        .filter((d) => d.processId === process.id && isOpenPrazo(d))
        .sort((a, b) => a.fatalDate.localeCompare(b.fatalDate))
        .find((d) => daysToPrazo(d, now) <= PRAZO_ALERT_DAYS.week)
      const days = daysSinceMovement(process, now)
      const state: RecentState = prazo
        ? "prazo"
        : days !== undefined && days >= 0 && days <= NEW_MOVEMENT_DAYS
          ? "nova"
          : days !== undefined && days >= 0 && days <= RECENT_DAYS
            ? "movimentacao"
            : "sem-novidades"
      return { process, state, prazo }
    })
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
