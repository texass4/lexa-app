/**
 * Panorama do escritório. O backend calcula os números (`computeOfficeMetrics`)
 * e escolhe listas curtas do que merece atenção; a IA só interpreta.
 * Nenhum registro completo é enviado.
 *
 * Leitura enxuta: clientes e documentos entram só como contagens do banco; tarefas
 * só as pendentes; prazos só os abertos; agenda só dos próximos dias; faturas só as em
 * aberto e as do mês atual e do anterior; processos sem o histórico de movimentações.
 */

import { PROCESS_STATUS } from "@/lib/core/config"
import { STALE_DAYS } from "@/lib/dashboard/attention"
import { addDays, parse, startOfDay, startOfWeek, toLocalISO } from "@/lib/core/dates"
import { formatCurrency } from "@/lib/core/format"
import { financeSummary, invoiceStatus, isOpenInvoice, isOverdue } from "@/lib/store/selectors"
import { isOpenPrazo, nextPrazo } from "@/lib/prazos/prazos"
import type { OfficeMetrics } from "@/lib/ai/types"
import type { Appointment, Invoice, Prazo, Task } from "@/types"
import type { AIRepository, Member, ProcessOverview } from "./repository"
import {
  type BuiltContext,
  SourceRegistry,
  daysSince,
  daysUntil,
  describeAppointment,
  describePrazo,
  describeTask,
  fmtDate,
  fmtDateTime,
  fmtToday,
  memberName,
  registerAppointment,
  registerPrazo,
  registerTask,
  upcoming,
} from "./shared"

const OFFICE_LIMITS = {
  list: 10,
  /** Lista compacta de processos ativos, só para o chat responder "quais…". */
  activeProcesses: 60,
} as const

export interface OfficeData {
  /** Contagens de clientes (null = sem acesso ou falha). */
  clientStats: { total: number; active: number; delinquent: number } | null
  /** Nome só dos clientes citados (processos e faturas listados). */
  clientNames: Map<string, string>
  processes: ProcessOverview[]
  /** Só pendentes. */
  tasks: Task[]
  /** Só abertos. */
  prazos: Prazo[]
  /** De hoje até os próximos 7 dias. */
  appointments: Appointment[]
  documentStats: { total: number; addedLast30Days: number } | null
  /** Em aberto, ou com vencimento/pagamento no mês atual ou no anterior. */
  invoices: Invoice[]
  members: Member[]
  can: { clients: boolean; processes: boolean; tasks: boolean; agenda: boolean; documents: boolean; finance: boolean }
}

export async function loadOfficeData(repo: AIRepository, now: Date = new Date()): Promise<OfficeData> {
  const today = startOfDay(now)
  const [clientStats, processes, tasks, prazos, appointments, documents, invoices, members] = await Promise.all([
    repo.countClients(),
    repo.listProcessOverviews(),
    repo.listTasks({ pendingOnly: true }),
    repo.listPrazos({ openOnly: true }),
    repo.listAppointments({ endsAfter: toLocalISO(today), startsBefore: toLocalISO(addDays(today, 8)) }),
    repo.countDocuments(toLocalISO(addDays(today, -30))),
    // O resumo financeiro compara o mês atual com o anterior.
    repo.listInvoices({ relevantSince: toLocalISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 10) }),
    repo.listMembers(),
  ])
  // Nomes só de quem aparece: clientes dos processos e das faturas em atraso.
  const clientNames = await repo.clientNames([...processes.map((p) => p.clientId), ...invoices.map((i) => i.clientId)])
  return {
    clientStats,
    clientNames,
    processes,
    tasks,
    prazos,
    appointments,
    documentStats: documents && { total: documents.total, addedLast30Days: documents.addedSince },
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
/** Prazos abertos com data fatal entre hoje e daqui a 7 dias. */
const openPrazosNext7Days = (prazos: Prazo[], now: Date) =>
  prazos.filter((p) => {
    const days = isOpenPrazo(p) ? daysUntil(p.fatalDate, now) : undefined
    return days !== undefined && days >= 0 && days <= 7
  })
const sum = (invoices: Invoice[]) => invoices.reduce((acc, i) => acc + (Number.isFinite(i.amount) ? i.amount : 0), 0)

/** Números do escritório, direto dos dados — nunca do modelo. Só módulos permitidos. */
export function computeOfficeMetrics(data: OfficeData, now: Date): OfficeMetrics {
  const metrics: OfficeMetrics = {}
  const today = startOfDay(now)

  if (data.can.clients && data.clientStats) metrics.clients = { ...data.clientStats }

  if (data.can.processes) {
    const active = data.processes.filter(isActive)
    const byArea: Record<string, number> = {}
    for (const p of active) byArea[p.area] = (byArea[p.area] ?? 0) + 1
    metrics.processes = {
      total: data.processes.length,
      active: active.length,
      movedLast7Days: data.processes.filter((p) => (daysSince(p.lastMovementAt, now) ?? Infinity) <= 7).length,
      staleOver60Days: active.filter((p) => (daysSince(p.lastMovementAt, now) ?? 0) > STALE_DAYS).length,
      withDeadlineNext7Days: (() => {
        const ids = new Set(openPrazosNext7Days(data.prazos, now).map((p) => p.processId))
        return active.filter((p) => ids.has(p.id)).length
      })(),
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

  if (data.can.documents && data.documentStats) metrics.documents = { ...data.documentStats }

  if (data.can.finance) {
    const overdue = data.invoices.filter((i) => invoiceStatus(i, now) === "atrasado")
    const summary = financeSummary(data.invoices, now)
    metrics.finance = {
      openAmount: sum(data.invoices.filter(isOpenInvoice)),
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
  const clientName = data.clientNames
  const weekStart = startOfWeek(now)

  const processRef = (p: ProcessOverview) =>
    registry.add("process", { id: p.id, label: `Processo ${p.number}`, date: p.lastMovementAt, href: `/processos/${p.id}` })
  const describeProcess = (p: ProcessOverview) => {
    const next = nextPrazo(data.prazos, p.id)
    return {
      ref: processRef(p),
      numero: p.number,
      cliente: clientName.get(p.clientId),
      area: p.area,
      situacao: PROCESS_STATUS[p.status]?.label,
      responsavel: memberName(data.members, p.ownerId),
      ultima_movimentacao: p.lastMovement ? `${fmtDateTime(p.lastMovement.at)} — ${p.lastMovement.title}` : fmtDate(p.lastMovementAt),
      dias_sem_movimentacao: daysSince(p.lastMovementAt, now),
      proximo_prazo_aberto: next ? `${fmtDate(next.fatalDate)} — ${next.description}` : undefined,
    }
  }

  const active = data.processes.filter(isActive)
  const processNumber = new Map(data.processes.map((p) => [p.id, p.number]))
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
        // Os únicos prazos que existem: os cadastrados pelo escritório (abertos).
        prazos_abertos_nos_proximos_7_dias: openPrazosNext7Days(data.prazos, now)
          .sort((a, b) => a.fatalDate.localeCompare(b.fatalDate))
          .slice(0, OFFICE_LIMITS.list)
          .map((p) => ({ ...describePrazo(p, registerPrazo(registry, p), data.members, now), processo: processNumber.get(p.processId) })),
        prazos_abertos_vencidos: data.prazos
          .filter((p) => isOpenPrazo(p) && (daysUntil(p.fatalDate, now) ?? 0) < 0)
          .sort((a, b) => a.fatalDate.localeCompare(b.fatalDate))
          .slice(0, OFFICE_LIMITS.list)
          .map((p) => ({ ...describePrazo(p, registerPrazo(registry, p), data.members, now), processo: processNumber.get(p.processId) })),
      }
    : {}

  const processesByOwner: Record<string, number> = {}
  for (const p of active) {
    const owner = memberName(data.members, p.ownerId) ?? "Sem responsável"
    processesByOwner[owner] = (processesByOwner[owner] ?? 0) + 1
  }

  const overdueTasks = data.tasks.filter((t) => isOverdue(t, now)).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const overdueInvoices = data.invoices.filter((i) => invoiceStatus(i, now) === "atrasado")
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
    processos_ativos:
      forChat && data.can.processes ? [...active].sort(byLastMovement).slice(0, OFFICE_LIMITS.activeProcesses).map(describeProcess) : undefined,
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
    modulos_sem_acesso: Object.entries({
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

  return { context, sources: registry.sources, metrics, basis: "Baseado em métricas calculadas pela Íntegra a partir dos dados do escritório." }
}
