/**
 * Panorama do escritório. O backend calcula os números (`computeOfficeMetrics`)
 * e escolhe listas curtas do que merece atenção; a IA só interpreta.
 * Nenhum registro completo é enviado.
 */

import { PROCESS_STATUS } from "@/lib/config"
import { STALE_DAYS } from "@/lib/attention"
import { addDays, parse, startOfDay, startOfWeek } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import { financeSummary, isOverdue } from "@/lib/selectors"
import type { OfficeMetrics } from "@/lib/ai/types"
import type { Appointment, Client, Invoice, LegalDocument, Task } from "@/types"
import type { AIRepository, Member, ProcessOverview } from "./repository"
import {
  type BuiltContext,
  SourceRegistry,
  daysSince,
  daysUntil,
  describeAppointment,
  describeTask,
  fmtDate,
  fmtDateTime,
  fmtToday,
  memberName,
  registerAppointment,
  registerTask,
  upcoming,
} from "./shared"

/** Sem movimentação há mais que isso = processo parado — a mesma regra dos sinais de atenção da interface. */
export { STALE_DAYS }

export const OFFICE_LIMITS = {
  list: 10,
  /** Lista compacta de processos ativos, só para o chat responder "quais…". */
  activeProcesses: 60,
} as const

export interface OfficeData {
  clients: Client[]
  processes: ProcessOverview[]
  tasks: Task[]
  appointments: Appointment[]
  documents: LegalDocument[]
  invoices: Invoice[]
  members: Member[]
  can: { clients: boolean; processes: boolean; tasks: boolean; agenda: boolean; documents: boolean; finance: boolean }
}

export async function loadOfficeData(repo: AIRepository): Promise<OfficeData> {
  const [clients, processes, tasks, appointments, documents, invoices, members] = await Promise.all([
    repo.listClients(),
    repo.listProcessOverviews(),
    repo.listTasks(),
    repo.listAppointments(),
    repo.listDocuments(),
    repo.listInvoices(),
    repo.listMembers(),
  ])
  return {
    clients,
    processes,
    tasks,
    appointments,
    documents,
    invoices,
    members,
    can: {
      clients: repo.can("clients.view"),
      processes: repo.can("processes.view"),
      tasks: repo.can("tasks.view"),
      agenda: repo.can("agenda.view"),
      documents: repo.can("documents.view"),
      finance: repo.can("finance.view"),
    },
  }
}

const isActive = (p: ProcessOverview) => p.status !== "concluido"
const sum = (invoices: Invoice[]) => invoices.reduce((acc, i) => acc + (Number.isFinite(i.amount) ? i.amount : 0), 0)

/** Números do escritório, direto dos dados — nunca do modelo. Só módulos permitidos. */
export function computeOfficeMetrics(data: OfficeData, now: Date): OfficeMetrics {
  const metrics: OfficeMetrics = {}
  const today = startOfDay(now)

  if (data.can.clients) {
    metrics.clients = {
      total: data.clients.length,
      active: data.clients.filter((c) => c.status === "ativo" || c.status === "novo").length,
      delinquent: data.clients.filter((c) => c.status === "inadimplente").length,
    }
  }

  if (data.can.processes) {
    const active = data.processes.filter(isActive)
    const byArea: Record<string, number> = {}
    for (const p of active) byArea[p.area] = (byArea[p.area] ?? 0) + 1
    metrics.processes = {
      total: data.processes.length,
      active: active.length,
      movedLast7Days: data.processes.filter((p) => (daysSince(p.lastMovementAt, now) ?? Infinity) <= 7).length,
      staleOver60Days: active.filter((p) => (daysSince(p.lastMovementAt, now) ?? 0) > STALE_DAYS).length,
      withDeadlineNext7Days: active.filter((p) => {
        const days = daysUntil(p.nextDeadline?.date, now)
        return days !== undefined && days >= 0 && days <= 7
      }).length,
      byArea,
    }
  }

  if (data.can.tasks) {
    const open = data.tasks.filter((t) => t.status === "pendente")
    metrics.tasks = {
      open: open.length,
      overdue: open.filter((t) => isOverdue(t, now)).length,
      dueToday: open.filter((t) => daysUntil(t.dueAt, now) === 0).length,
      dueNext7Days: open.filter((t) => {
        const days = daysUntil(t.dueAt, now)
        return days !== undefined && days >= 0 && days <= 7
      }).length,
    }
  }

  if (data.can.agenda) {
    const horizon = addDays(today, 8)
    metrics.agenda = {
      today: data.appointments.filter((a) => daysUntil(a.start, now) === 0).length,
      next7Days: data.appointments.filter((a) => parse(a.start) >= today && parse(a.start) < horizon).length,
    }
  }

  if (data.can.documents) {
    metrics.documents = {
      total: data.documents.length,
      addedLast30Days: data.documents.filter((d) => (daysSince(d.uploadedAt, now) ?? Infinity) <= 30).length,
    }
  }

  if (data.can.finance) {
    const overdue = data.invoices.filter((i) => i.status === "atrasado")
    const summary = financeSummary(data.invoices, now)
    metrics.finance = {
      openAmount: sum(data.invoices.filter((i) => i.status !== "pago")),
      overdueAmount: sum(overdue),
      overdueInvoices: overdue.length,
      clientsWithOverdue: new Set(overdue.map((i) => i.clientId)).size,
      receivedThisMonth: summary.received,
      expectedThisMonth: summary.expected,
    }
  }

  return metrics
}

/** Métricas + listas curtas do que merece atenção. `forChat` inclui a lista compacta de processos ativos. */
export function buildOfficeContext(data: OfficeData, now: Date, { forChat = false } = {}): BuiltContext & { metrics: OfficeMetrics } {
  const registry = new SourceRegistry()
  const metrics = computeOfficeMetrics(data, now)
  const clientName = new Map(data.clients.map((c) => [c.id, c.name]))
  const weekStart = startOfWeek(now)

  const processRef = (p: ProcessOverview) =>
    registry.add("process", { id: p.id, label: `Processo ${p.number}`, date: p.lastMovementAt, href: `/processos/${p.id}` })
  const describeProcess = (p: ProcessOverview) => ({
    ref: processRef(p),
    numero: p.number,
    cliente: clientName.get(p.clientId),
    area: p.area,
    situacao: PROCESS_STATUS[p.status]?.label,
    responsavel: memberName(data.members, p.ownerId),
    ultima_movimentacao: p.lastMovement ? `${fmtDateTime(p.lastMovement.at)} — ${p.lastMovement.title}` : fmtDate(p.lastMovementAt),
    dias_sem_movimentacao: daysSince(p.lastMovementAt, now),
    prazo_cadastrado_no_lexa: p.nextDeadline?.date ? `${fmtDate(p.nextDeadline.date)} — ${p.nextDeadline.title}` : undefined,
  })

  const active = data.processes.filter(isActive)
  const byLastMovement = (a: ProcessOverview, b: ProcessOverview) => (b.lastMovementAt ?? "").localeCompare(a.lastMovementAt ?? "")

  const lists = data.can.processes
    ? {
        processos_com_movimentacao_nos_ultimos_7_dias: data.processes
          .filter((p) => (daysSince(p.lastMovementAt, now) ?? Infinity) <= 7)
          .sort(byLastMovement)
          .slice(0, OFFICE_LIMITS.list)
          .map(describeProcess),
        processos_ativos_sem_movimentacao_ha_mais_de_60_dias: active
          .filter((p) => (daysSince(p.lastMovementAt, now) ?? 0) > STALE_DAYS)
          .sort((a, b) => (a.lastMovementAt ?? "").localeCompare(b.lastMovementAt ?? ""))
          .slice(0, OFFICE_LIMITS.list)
          .map(describeProcess),
        processos_com_prazo_cadastrado_nos_proximos_7_dias: active
          .filter((p) => {
            const days = daysUntil(p.nextDeadline?.date, now)
            return days !== undefined && days >= 0 && days <= 7
          })
          .sort((a, b) => (a.nextDeadline?.date ?? "").localeCompare(b.nextDeadline?.date ?? ""))
          .slice(0, OFFICE_LIMITS.list)
          .map(describeProcess),
      }
    : {}

  const processesByOwner: Record<string, number> = {}
  for (const p of active) {
    const owner = memberName(data.members, p.ownerId) ?? "Sem responsável"
    processesByOwner[owner] = (processesByOwner[owner] ?? 0) + 1
  }

  const overdueTasks = data.tasks.filter((t) => isOverdue(t, now)).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const overdueInvoices = data.invoices.filter((i) => i.status === "atrasado")
  const overdueByClient = new Map<string, number>()
  for (const i of overdueInvoices) overdueByClient.set(i.clientId, (overdueByClient.get(i.clientId) ?? 0) + i.amount)

  const context = {
    data_de_hoje: fmtToday(now),
    metricas_calculadas_pelo_lexa: metrics,
    processos_ativos_por_responsavel: data.can.processes ? processesByOwner : undefined,
    ...lists,
    processos_movimentados_desde_o_inicio_da_semana:
      forChat && data.can.processes
        ? data.processes
            .filter((p) => p.lastMovementAt && parse(p.lastMovementAt) >= weekStart)
            .sort(byLastMovement)
            .slice(0, OFFICE_LIMITS.list)
            .map(describeProcess)
        : undefined,
    processos_ativos: forChat && data.can.processes ? [...active].sort(byLastMovement).slice(0, OFFICE_LIMITS.activeProcesses).map(describeProcess) : undefined,
    processos_ativos_omitidos: forChat && active.length > OFFICE_LIMITS.activeProcesses ? active.length - OFFICE_LIMITS.activeProcesses : undefined,
    clientes_com_processos_ativos:
      forChat && data.can.clients && data.can.processes
        ? [...new Set(active.map((p) => clientName.get(p.clientId)).filter(Boolean))].slice(0, OFFICE_LIMITS.activeProcesses)
        : undefined,
    tarefas_atrasadas: data.can.tasks
      ? overdueTasks.slice(0, OFFICE_LIMITS.list).map((t) => describeTask(t, registerTask(registry, t), data.members, now))
      : undefined,
    compromissos_dos_proximos_7_dias: data.can.agenda
      ? upcoming(data.appointments, now)
          .filter((a) => (daysUntil(a.start, now) ?? Infinity) <= 7)
          .slice(0, OFFICE_LIMITS.list)
          .map((a) => describeAppointment(a, registerAppointment(registry, a)))
      : undefined,
    clientes_com_valores_em_atraso: data.can.finance
      ? [...overdueByClient.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, OFFICE_LIMITS.list)
          .map(([clientId, amount]) => ({ cliente: clientName.get(clientId) ?? "Cliente sem acesso", valor_em_atraso: formatCurrency(amount) }))
      : undefined,
    modulos_sem_acesso:
      Object.entries({
        clientes: data.can.clients,
        processos: data.can.processes,
        tarefas: data.can.tasks,
        agenda: data.can.agenda,
        documentos: data.can.documents,
        financeiro: data.can.finance,
      })
        .filter(([, allowed]) => !allowed)
        .map(([name]) => name),
  }

  return { context, sources: registry.sources, metrics, basis: "Baseado em métricas calculadas pelo LEXA a partir dos dados do escritório." }
}
