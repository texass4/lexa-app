/**
 * Contexto de um cliente: cadastro essencial (sem documentos pessoais ou
 * contatos), processos, tarefas, agenda, documentos e financeiro — cada parte
 * só se a pessoa tiver permissão para vê-la.
 */

import { AIError } from "@/lib/ai/errors"
import { CLIENT_STATUS, INVOICE_STATUS, PROCESS_STATUS } from "@/lib/config"
import { formatCurrency } from "@/lib/format"
import type { Activity, Appointment, Client, Invoice, LegalDocument, Task } from "@/types"
import type { AIRepository, Member, ProcessOverview } from "./repository"
import {
  type BuiltContext,
  SourceRegistry,
  daysSince,
  describeAppointment,
  describeDocument,
  describeTask,
  fmtDate,
  fmtDateTime,
  fmtToday,
  memberName,
  newestFirst,
  registerAppointment,
  registerDocument,
  registerTask,
  sortTasks,
  upcoming,
} from "./shared"

export const CLIENT_LIMITS = {
  processes: 20,
  tasks: 15,
  appointments: 8,
  documents: 12,
  invoices: 10,
  activities: 10,
} as const

export interface ClientData {
  client: Client
  processes: ProcessOverview[]
  tasks: Task[]
  appointments: Appointment[]
  documents: LegalDocument[]
  invoices: Invoice[]
  activities: Activity[]
  members: Member[]
  hidden: string[]
}

export async function loadClientData(repo: AIRepository, clientId: string): Promise<ClientData> {
  if (!repo.can("clients.view")) throw new AIError("FORBIDDEN")
  const client = await repo.getClient(clientId)
  if (!client) throw new AIError("NOT_FOUND")

  const [processes, tasks, appointments, documents, invoices, activities, members] = await Promise.all([
    repo.listProcessOverviews({ clientId }),
    repo.listTasks(),
    repo.listAppointments(),
    repo.listDocuments(),
    repo.listInvoices(),
    repo.listActivities({ clientId }),
    repo.listMembers(),
  ])
  const processIds = new Set(processes.map((p) => p.id))

  const hidden = [
    !repo.can("processes.view") && "processos",
    !repo.can("tasks.view") && "tarefas",
    !repo.can("agenda.view") && "agenda",
    !repo.can("documents.view") && "documentos",
    !repo.can("finance.view") && "financeiro",
  ].filter((item): item is string => !!item)

  return {
    client,
    processes,
    tasks: tasks.filter(
      (t) => (t.related?.type === "client" && t.related.id === clientId) || (t.related?.type === "process" && processIds.has(t.related.id)),
    ),
    appointments: appointments.filter((a) => a.clientId === clientId || (a.processId !== undefined && processIds.has(a.processId))),
    documents: documents.filter((d) => d.clientId === clientId || (d.processId !== undefined && processIds.has(d.processId))),
    invoices: invoices.filter((i) => i.clientId === clientId),
    activities,
    members,
    hidden,
  }
}

const sum = (invoices: Invoice[]) => invoices.reduce((acc, i) => acc + (Number.isFinite(i.amount) ? i.amount : 0), 0)

export function buildClientContext(data: ClientData, now: Date): BuiltContext {
  const registry = new SourceRegistry()
  const { client, members } = data
  const clientRef = registry.add("client", { id: client.id, label: client.name, href: `/clientes/${client.id}` })

  const processes = [...data.processes]
    .sort((a, b) => (a.status === "concluido" ? 1 : 0) - (b.status === "concluido" ? 1 : 0) || (b.lastMovementAt ?? "").localeCompare(a.lastMovementAt ?? ""))
    .slice(0, CLIENT_LIMITS.processes)

  const describedProcesses = processes.map((p) => {
    const ref = registry.add("process", { id: p.id, label: `Processo ${p.number}`, date: p.lastMovementAt, href: `/processos/${p.id}` })
    return {
      ref,
      numero: p.number,
      classe: p.className ?? p.type,
      area: p.area,
      situacao_no_escritorio: PROCESS_STATUS[p.status]?.label,
      orgao_julgador: p.judicialUnit ?? p.court,
      parte_contraria: p.opposingParty,
      responsavel: memberName(members, p.ownerId),
      ultima_movimentacao: p.lastMovement ? { data: fmtDateTime(p.lastMovement.at), nome: p.lastMovement.title } : undefined,
      dias_desde_a_ultima_movimentacao: daysSince(p.lastMovementAt, now),
      prazo_cadastrado_no_lexa: p.nextDeadline?.date ? { data: fmtDate(p.nextDeadline.date), descricao: p.nextDeadline.title } : undefined,
    }
  })

  const invoices = data.invoices
  const overdue = invoices.filter((i) => i.status === "atrasado")
  const finance = data.hidden.includes("financeiro")
    ? undefined
    : {
        total_faturado: formatCurrency(sum(invoices)),
        recebido: formatCurrency(sum(invoices.filter((i) => i.status === "pago"))),
        em_aberto: formatCurrency(sum(invoices.filter((i) => i.status !== "pago"))),
        em_atraso: formatCurrency(sum(overdue)),
        faturas_em_aberto: invoices
          .filter((i) => i.status !== "pago")
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .slice(0, CLIENT_LIMITS.invoices)
          .map((i) => ({
            ref: registry.add("invoice", { id: i.id, label: i.description, date: i.dueDate, href: `/clientes/${client.id}?tab=financeiro` }),
            descricao: i.description,
            valor: formatCurrency(i.amount),
            vencimento: fmtDate(i.dueDate),
            situacao: INVOICE_STATUS[i.status]?.label,
          })),
      }

  const context = {
    data_de_hoje: fmtToday(now),
    cliente: {
      ref: clientRef,
      nome: client.name,
      tipo: client.kind === "PJ" ? "pessoa jurídica" : "pessoa física",
      area: client.area,
      situacao: CLIENT_STATUS[client.status]?.label,
      cliente_desde: fmtDate(client.clientSince),
      responsavel: memberName(members, client.ownerId),
      origem: client.source,
      profissao: client.profession,
      ultima_atividade: fmtDate(client.lastActivityAt),
    },
    processos: describedProcesses,
    processos_omitidos: data.processes.length > processes.length ? data.processes.length - processes.length : undefined,
    tarefas: sortTasks(data.tasks)
      .slice(0, CLIENT_LIMITS.tasks)
      .map((t) => describeTask(t, registerTask(registry, t), members, now)),
    compromissos_futuros: upcoming(data.appointments, now)
      .slice(0, CLIENT_LIMITS.appointments)
      .map((a) => describeAppointment(a, registerAppointment(registry, a))),
    documentos: [...data.documents]
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .slice(0, CLIENT_LIMITS.documents)
      .map((d) => describeDocument(d, registerDocument(registry, d))),
    financeiro: finance,
    atividades_recentes: newestFirst(data.activities)
      .slice(0, CLIENT_LIMITS.activities)
      .map((a) => ({ data: fmtDate(a.at), registro: [a.actor, a.message, a.detail && `(${a.detail})`].filter(Boolean).join(" ") })),
    modulos_sem_acesso: data.hidden.length ? data.hidden : undefined,
  }

  return {
    context,
    sources: registry.sources,
    basis: `Baseado no cadastro do cliente e em ${data.processes.length} processo(s) registrados no LEXA.`,
  }
}
