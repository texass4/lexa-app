import type { Activity, Appointment, Client, Invoice, InvoiceStatus, LegalDocument, PracticeArea, Process, RelatedEntity, Task } from "@/types"
import type { PersistedState } from "@/lib/store/storage"
import { getNow, diffInDays, isSameDay, monthName, monthShort, parse, toLocalISO } from "@/lib/dates"

/** O que os seletores precisam do store (o `DemoState` inteiro também serve). */
type DemoState = PersistedState

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

/**
 * Situação real da fatura: uma parcela "a vencer" cujo vencimento já passou está
 * em atraso, mesmo que ninguém tenha mudado o status salvo.
 */
export function invoiceStatus(invoice: Invoice, now: Date = getNow()): InvoiceStatus {
  if (invoice.status === "pago") return "pago"
  if (invoice.status === "atrasado") return "atrasado"
  return invoice.dueDate < toLocalISO(now).slice(0, 10) ? "atrasado" : "pendente"
}

export function clientFinance(s: Pick<DemoState, "invoices">, clientId: string, now: Date = getNow()) {
  const invoices = s.invoices.filter((i) => i.clientId === clientId)
  const paid = sum(invoices.filter((i) => i.status === "pago"))
  const open = sum(invoices.filter((i) => i.status !== "pago"))
  const overdueItems = invoices.filter((i) => invoiceStatus(i, now) === "atrasado")
  const overdue = sum(overdueItems)
  const upcoming = invoices.filter((i) => invoiceStatus(i, now) === "pendente").sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  // Contratado = tudo o que foi faturado para o cliente (pago + em aberto).
  return { invoices, contracted: paid + open, paid, open, overdue, overdueCount: overdueItems.length, upcoming }
}

/** Clientes com alguma parcela vencida e não paga. */
export function delinquentClientIds(invoices: Invoice[], now: Date = getNow()) {
  return new Set(invoices.filter((i) => invoiceStatus(i, now) === "atrasado").map((i) => i.clientId))
}

/** Cliente de uma tarefa: o vínculo direto ou o cliente do processo vinculado. */
export function relatedClientId(s: Pick<DemoState, "processes">, related?: RelatedEntity) {
  if (!related) return undefined
  if (related.type === "client") return related.id
  return s.processes.find((p) => p.id === related.id)?.clientId || undefined
}

export interface ClientHub {
  processes: Process[]
  activeProcesses: Process[]
  tasks: Task[]
  documents: LegalDocument[]
  appointments: Appointment[]
  activities: Activity[]
}

/**
 * Tudo o que está ligado ao cliente, direto ou por um processo dele. Uma tarefa,
 * documento ou compromisso vinculado só ao processo também é do cliente.
 */
export function clientHub(s: DemoState, clientId: string): ClientHub {
  const processes = s.processes
    .filter((p) => p.clientId === clientId)
    .sort(
      (a, b) =>
        (a.status === "concluido" ? 1 : 0) - (b.status === "concluido" ? 1 : 0) ||
        (a.nextDeadline?.date ?? "9").localeCompare(b.nextDeadline?.date ?? "9") ||
        b.lastMovementAt.localeCompare(a.lastMovementAt),
    )
  const ids = new Set(processes.map((p) => p.id))
  const ofClient = (item: { clientId?: string; processId?: string }) => item.clientId === clientId || (!!item.processId && ids.has(item.processId))
  return {
    processes,
    activeProcesses: processes.filter((p) => p.status !== "concluido"),
    tasks: s.tasks
      .filter((t) => (t.related?.type === "client" && t.related.id === clientId) || (t.related?.type === "process" && ids.has(t.related.id)))
      .sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === "pendente" ? -1 : 1)),
    documents: s.documents.filter(ofClient).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    appointments: s.appointments.filter(ofClient).sort((a, b) => a.start.localeCompare(b.start)),
    activities: s.activities.filter(ofClient).sort((a, b) => b.at.localeCompare(a.at)),
  }
}

/** Momento da última atividade registrada de cada cliente (inclui a dos processos dele). */
export function lastActivityByClient(s: Pick<DemoState, "activities" | "processes">) {
  const clientOfProcess = new Map(s.processes.map((p) => [p.id, p.clientId]))
  const last = new Map<string, string>()
  for (const a of s.activities) {
    const clientId = a.clientId ?? (a.processId ? clientOfProcess.get(a.processId) : undefined)
    if (!clientId) continue
    const current = last.get(clientId)
    if (!current || a.at > current) last.set(clientId, a.at)
  }
  return last
}

/** Prazo mais próximo entre os processos ativos — um prazo já vencido vem primeiro, para não passar despercebido. */
export function nextClientDeadline(processes: Process[]) {
  return processes
    .filter((p) => p.status !== "concluido" && p.nextDeadline)
    .sort((a, b) => a.nextDeadline!.date.localeCompare(b.nextDeadline!.date))[0]
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
  const overdue = sum(invoices.filter((i) => invoiceStatus(i, now) === "atrasado"))
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
