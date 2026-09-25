import type { Client, Invoice, PracticeArea, RelatedEntity, Task } from "@/types"
import type { DemoState } from "@/lib/store/demo-store"
import { getNow, diffInDays, isSameDay, monthName, monthShort, parse } from "@/lib/dates"

export const findClient = (s: DemoState, id?: string) => (id ? s.clients.find((c) => c.id === id) : undefined)
export const findProcess = (s: DemoState, id?: string) => (id ? s.processes.find((p) => p.id === id) : undefined)

export function describeRelated(s: DemoState, related?: RelatedEntity) {
  if (!related) return undefined
  if (related.type === "client") {
    const c = findClient(s, related.id)
    return c ? { label: c.name, kind: "Cliente", href: `/clientes/${c.id}` } : undefined
  }
  const p = findProcess(s, related.id)
  if (!p) return undefined
  const c = findClient(s, p.clientId)
  return { label: `Processo ${p.code}`, kind: c?.name ?? "Processo", href: `/processos/${p.id}` }
}

export function clientFinance(s: DemoState, clientId: string) {
  const invoices = s.invoices.filter((i) => i.clientId === clientId)
  const paid = sum(invoices.filter((i) => i.status === "pago"))
  const open = sum(invoices.filter((i) => i.status !== "pago"))
  const overdue = sum(invoices.filter((i) => i.status === "atrasado"))
  // Contratado = tudo o que foi faturado para o cliente (pago + em aberto).
  return { invoices, contracted: paid + open, paid, open, overdue }
}

export const sum = (items: Invoice[]) => items.reduce((acc, i) => acc + i.amount, 0)

export function openReceivables(s: DemoState) {
  return sum(s.invoices.filter((i) => i.status !== "pago"))
}

/* ------------------------------- Financeiro ------------------------------- */

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
/** Mês em que a fatura foi (ou deve ser) recebida. */
const receivedIn = (i: Invoice) => (i.paidAt ?? i.dueDate).slice(0, 7)

export interface MonthRevenue {
  /** `YYYY-MM` */
  key: string
  /** "Set" — eixo do gráfico. */
  month: string
  /** "Setembro de 2026" — tooltip. */
  label: string
  prevista: number
  recebida: number
}

/** Receita prevista (vencimentos) e recebida (pagamentos) dos últimos meses, até o atual. */
export function monthlyRevenue(invoices: Invoice[], now: Date = getNow(), months = 6): MonthRevenue[] {
  return Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    const key = monthKey(date)
    return {
      key,
      month: cap(monthShort(date.getMonth())),
      label: `${cap(monthName(date.getMonth()))} de ${date.getFullYear()}`,
      prevista: sum(invoices.filter((inv) => inv.dueDate.slice(0, 7) === key)),
      recebida: sum(invoices.filter((inv) => inv.status === "pago" && receivedIn(inv) === key)),
    }
  })
}

/** Números do mês atual. `growth` é `undefined` quando não há mês anterior para comparar. */
export function financeSummary(invoices: Invoice[], now: Date = getNow()) {
  const [previous, current] = monthlyRevenue(invoices, now, 2)
  const billed = sum(invoices)
  const overdue = sum(invoices.filter((i) => i.status === "atrasado"))
  return {
    month: current.label,
    previousMonth: previous.label,
    expected: current.prevista,
    received: current.recebida,
    growth: previous.recebida > 0 ? ((current.recebida - previous.recebida) / previous.recebida) * 100 : undefined,
    /** Percentual do valor faturado que está vencido e não pago. */
    defaultRate: billed > 0 ? (overdue / billed) * 100 : 0,
  }
}

/** Receita recebida no ano, por área do cliente, da maior para a menor. */
export function revenueByArea(invoices: Invoice[], clients: Client[], year: number = getNow().getFullYear()) {
  const areaOf = new Map(clients.map((c) => [c.id, c.area]))
  const totals = new Map<PracticeArea, number>()
  for (const inv of invoices) {
    const area = areaOf.get(inv.clientId)
    if (!area || inv.status !== "pago" || !receivedIn(inv).startsWith(String(year))) continue
    totals.set(area, (totals.get(area) ?? 0) + inv.amount)
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0)
  return [...totals.entries()]
    .map(([area, amount]) => ({ area, amount, pct: total ? Math.round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export function todaysAppointments(s: DemoState, now: Date = getNow()) {
  return s.appointments.filter((a) => isSameDay(parse(a.start), now)).sort((a, b) => a.start.localeCompare(b.start))
}

export type TaskBucket = "atrasadas" | "hoje" | "amanha" | "semana" | "proximas" | "concluidas"

export function taskBucket(task: Task, now: Date = getNow()): TaskBucket {
  if (task.status === "concluida") return "concluidas"
  const diff = diffInDays(parse(task.dueAt), now)
  if (diff < 0) return "atrasadas"
  if (diff === 0) return "hoje"
  if (diff === 1) return "amanha"
  if (diff <= 6 - ((now.getDay() + 6) % 7)) return "semana"
  return "proximas"
}

export function isOverdue(task: Task, now: Date = getNow()) {
  return task.status !== "concluida" && diffInDays(parse(task.dueAt), now) < 0
}
