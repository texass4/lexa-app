/**
 * Contexto de um processo: só o necessário para analisá-lo.
 *
 * `loadProcessData` busca no repositório (escritório + permissões já
 * garantidos por ele); `buildProcessContext` e `buildMovementContext` são
 * funções puras que escolhem os campos e limitam o volume.
 */

import { AIError } from "@/lib/ai/errors"
import { PROCESS_STATUS } from "@/lib/config"
import { formatCurrency } from "@/lib/format"
import type { Appointment, Client, LegalDocument, Process, ProcessParty, Task } from "@/types"
import type { AIRepository, Member } from "./repository"
import {
  type BuiltContext,
  SourceRegistry,
  daysSince,
  describeAppointment,
  describeDocument,
  describeMovement,
  describeTask,
  fmtDate,
  fmtDateTime,
  fmtToday,
  memberName,
  newestFirst,
  registerAppointment,
  registerDocument,
  registerMovement,
  registerTask,
  sortTasks,
  upcoming,
} from "./shared"

/** Limites de volume — cada item a mais é token pago. */
export const PROCESS_LIMITS = {
  movements: 20,
  tasks: 15,
  appointments: 8,
  documents: 10,
  /** Movimentações vizinhas enviadas ao analisar uma movimentação. */
  movementNeighbours: 6,
} as const

export interface ProcessData {
  process: Process
  client: Client | null
  tasks: Task[]
  appointments: Appointment[]
  documents: LegalDocument[]
  members: Member[]
  /** Módulos que a pessoa não pode ver (a IA é avisada, para não concluir "não há tarefas"). */
  hidden: string[]
}

export async function loadProcessData(repo: AIRepository, processId: string): Promise<ProcessData> {
  if (!repo.can("processes.view")) throw new AIError("FORBIDDEN")
  const process = await repo.getProcess(processId)
  if (!process) throw new AIError("NOT_FOUND")

  const [client, tasks, appointments, documents, members] = await Promise.all([
    process.clientId ? repo.getClient(process.clientId) : Promise.resolve(null),
    repo.listTasks(),
    repo.listAppointments(),
    repo.listDocuments(),
    repo.listMembers(),
  ])

  const hidden = [
    !repo.can("clients.view") && "dados do cliente",
    !repo.can("tasks.view") && "tarefas",
    !repo.can("agenda.view") && "agenda",
    !repo.can("documents.view") && "documentos",
  ].filter((item): item is string => !!item)

  return {
    process,
    client,
    tasks: tasks.filter((t) => t.related?.type === "process" && t.related.id === process.id),
    appointments: appointments.filter((a) => a.processId === process.id),
    documents: documents.filter((d) => d.processId === process.id),
    members,
    hidden,
  }
}

const partyNames = (parties?: ProcessParty[]) => parties?.map((p) => (p.role ? `${p.name} (${p.role})` : p.name))

/** Dados de identificação do processo, sem movimentações. */
function describeProcess(data: ProcessData, now: Date) {
  const { process, client, members } = data
  const deadline = process.nextDeadline
  return {
    numero: process.number,
    classe: process.className ?? process.type,
    assunto: process.subject,
    area: process.area,
    tribunal: process.tribunal,
    grau: process.degree,
    sistema: process.system,
    orgao_julgador: process.judicialUnit ?? process.court,
    comarca: process.district,
    data_ajuizamento: fmtDate(process.distributedAt),
    situacao_no_escritorio: PROCESS_STATUS[process.status]?.label,
    situacao_na_fonte: process.source?.sourceStatus,
    fonte_dos_dados: process.source?.provider === "datajud" ? "DataJud (CNJ)" : "cadastro manual",
    ultima_sincronizacao: fmtDateTime(process.lastSyncedAt),
    responsavel: memberName(members, process.ownerId),
    cliente: client?.name,
    parte_contraria: process.opposingParty,
    polo_ativo: partyNames(process.parties?.active),
    polo_passivo: partyNames(process.parties?.passive),
    valor_da_causa: process.claimValue ? formatCurrency(process.claimValue) : undefined,
    // Único prazo que existe nos dados: o cadastrado pelo escritório.
    prazo_cadastrado_no_lexa: deadline?.date ? { data: fmtDate(deadline.date), descricao: deadline.title } : "nenhum prazo cadastrado",
    total_de_movimentacoes: process.movements.length,
    dias_desde_a_ultima_movimentacao: daysSince(process.lastMovementAt || process.movements[0]?.at, now),
  }
}

export function buildProcessContext(data: ProcessData, now: Date): BuiltContext {
  const registry = new SourceRegistry()
  const { process } = data
  const processRef = registry.add("process", { id: process.id, label: `Processo ${process.number}`, href: `/processos/${process.id}` })

  const movements = newestFirst(process.movements).slice(0, PROCESS_LIMITS.movements)
  const tasks = sortTasks(data.tasks).slice(0, PROCESS_LIMITS.tasks)
  const appointments = upcoming(data.appointments, now).slice(0, PROCESS_LIMITS.appointments)
  const documents = [...data.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, PROCESS_LIMITS.documents)

  const context = {
    data_de_hoje: fmtToday(now),
    processo: { ref: processRef, ...describeProcess(data, now) },
    movimentacoes_recentes: movements.map((m) => describeMovement(m, registerMovement(registry, m, process.id))),
    movimentacoes_omitidas: process.movements.length > movements.length ? process.movements.length - movements.length : undefined,
    tarefas_do_processo: tasks.map((t) => describeTask(t, registerTask(registry, t), data.members, now)),
    compromissos_futuros: appointments.map((a) => describeAppointment(a, registerAppointment(registry, a))),
    documentos_do_processo: documents.map((d) => describeDocument(d, registerDocument(registry, d))),
    modulos_sem_acesso: data.hidden.length ? data.hidden : undefined,
  }

  const basis =
    movements.length < process.movements.length
      ? `Baseado nos dados do processo no LEXA e nas ${movements.length} movimentações mais recentes (de ${process.movements.length}).`
      : `Baseado nos dados do processo no LEXA e em ${movements.length} movimentação(ões) registrada(s).`

  return { context, sources: registry.sources, basis }
}

/** Uma movimentação com as vizinhas e o mínimo do processo. */
export function buildMovementContext(data: ProcessData, movementId: string, now: Date): BuiltContext {
  const { process } = data
  const ordered = newestFirst(process.movements)
  const index = ordered.findIndex((m) => m.id === movementId)
  if (index < 0) throw new AIError("NOT_FOUND", { message: "Movimentação não encontrada neste processo." })

  const registry = new SourceRegistry()
  const target = ordered[index]
  const targetRef = registerMovement(registry, target, process.id)
  // Anteriores contam mais para explicar um ato; as posteriores mostram o que veio depois.
  const before = ordered.slice(index + 1, index + 1 + PROCESS_LIMITS.movementNeighbours)
  const after = ordered.slice(Math.max(0, index - 3), index)

  const info = describeProcess(data, now)
  const context = {
    data_de_hoje: fmtToday(now),
    processo: {
      numero: info.numero,
      classe: info.classe,
      assunto: info.assunto,
      tribunal: info.tribunal,
      grau: info.grau,
      orgao_julgador: info.orgao_julgador,
      situacao_no_escritorio: info.situacao_no_escritorio,
      prazo_cadastrado_no_lexa: info.prazo_cadastrado_no_lexa,
    },
    movimentacao_analisada: describeMovement(target, targetRef),
    movimentacoes_anteriores: before.map((m) => describeMovement(m, registerMovement(registry, m, process.id))),
    movimentacoes_posteriores: after.map((m) => describeMovement(m, registerMovement(registry, m, process.id))),
  }

  return { context, sources: registry.sources, basis: `Baseado na movimentação de ${fmtDate(target.at)} e nas vizinhas registradas no LEXA.` }
}
