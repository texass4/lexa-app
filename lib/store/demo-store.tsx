"use client"

import * as React from "react"
import { toast } from "sonner"
import type { Activity, Appointment, AppointmentCategory, Client, Invoice, LegalDocument, Process, ProcessMovement, Task, TaskColumn } from "@/types"
import * as account from "@/lib/account"
import { CLIENT_STATUS } from "@/lib/config"
import { fmtNumericDate, getNow, toLocalISO } from "@/lib/dates"
import { formatCurrency, uid } from "@/lib/format"
import { relatedClientId } from "@/lib/selectors"
import { collectHashes, diffMovements } from "@/lib/services/processes/movements"
import { buildProcessDraft, toProcessMovements, type ImportProcessMeta } from "@/lib/services/processes/import"
import type { ProcessSheet } from "@/lib/services/processes/sheet"
import { getSupabase } from "@/lib/supabase/client"
import { COLLECTION_LABELS, diffState, loadState, syncState, type PersistedState, type SyncResult } from "./storage"

/**
 * Store da aplicação, com os dados do escritório de quem está logado. As ações
 * atualizam a memória na hora e a gravação no Supabase acontece em seguida
 * (`storage.ts`), agrupada. Os componentes consomem apenas `useDemoData` e
 * `useDemoActions`; quem decide o que cada pessoa lê e grava é a RLS do banco.
 */

export interface DemoState extends PersistedState {
  /** `true` depois que os dados do escritório foram carregados do banco. */
  hydrated: boolean
  /** A primeira carga falhou (rede, servidor). As telas mostram erro com "tentar de novo". */
  loadError: boolean
}

const initialState = (): DemoState => ({
  clients: [],
  processes: [],
  tasks: [],
  taskColumns: [],
  appointments: [],
  appointmentCategories: [],
  documents: [],
  invoices: [],
  activities: [],
  notifications: [],
  hydrated: false,
  loadError: false,
})

/** O que vai para o armazenamento: o estado sem os sinalizadores de sessão. */
const persisted = (state: DemoState): PersistedState => {
  const data: Partial<DemoState> = { ...state }
  delete data.hydrated
  delete data.loadError
  return data as PersistedState
}

/** Junta o que foi salvo com o que foi criado antes do carregamento terminar. */
function mergeById<T extends { id: string }>(current: T[], saved: T[] = []): T[] {
  const known = new Set(current.map((item) => item.id))
  return [...current, ...saved.filter((item) => !known.has(item.id))]
}

export type NewClientInput = Pick<Client, "name" | "kind" | "document" | "email" | "phone" | "area" | "ownerId" | "address"> &
  Partial<Pick<Client, "status" | "whatsapp" | "addressDetails" | "birthDate" | "tags" | "notes" | "contact" | "profession">>
export type NewInvoiceInput = Pick<Invoice, "clientId" | "processId" | "description" | "amount" | "dueDate" | "status" | "paidAt" | "method">
export type NewTaskInput = Pick<Task, "title" | "dueAt" | "priority" | "assigneeId" | "description" | "related" | "columnId">
export type NewAppointmentInput = Pick<
  Appointment,
  "title" | "categoryId" | "start" | "end" | "ownerId" | "clientId" | "processId" | "notes" | "personName" | "area" | "location"
>
export type AppointmentCategoryInput = Pick<AppointmentCategory, "name" | "color">
export type NewProcessInput = Pick<
  Process,
  "number" | "clientId" | "area" | "type" | "court" | "district" | "opposingParty" | "ownerId" | "status" | "claimValue"
>
export type NewDocumentInput = Pick<LegalDocument, "name" | "kind" | "clientId" | "processId" | "extension" | "sizeBytes" | "storagePath">
export type TaskColumnInput = Pick<TaskColumn, "name" | "color" | "isDone">

/** Resultado de uma sincronização com a fonte externa. */
export interface SyncOutcome {
  /** Movimentações que ainda não existiam no escritório. */
  added: number
  process?: Process
}

interface DemoActions {
  /** Tenta carregar de novo os dados do escritório depois de uma falha. */
  retryLoad(): void
  addClient(input: NewClientInput): Client
  /** Atualiza o cadastro e registra na timeline o que mudou (status, responsável, dados). */
  updateClient(id: string, patch: Partial<Client>): void
  /** Exclui o cliente. Processos, documentos, tarefas e compromissos vinculados ficam sem cliente. */
  deleteClient(id: string): void
  addProcess(input: NewProcessInput): Process
  /** Ajusta os dados do escritório de um processo (cliente, área, responsável…). */
  updateProcess(id: string, patch: Partial<NewProcessInput>): Process | undefined
  /** Cria um processo a partir de uma ficha vinda de consulta externa. */
  importProcess(sheet: ProcessSheet, meta: ImportProcessMeta): Process
  /** Aplica uma ficha reconsultada, importando só o que é novo. */
  applyProcessSync(processId: string, sheet: ProcessSheet): SyncOutcome
  deleteProcess(id: string): void
  toggleTask(id: string): Task | undefined
  addTask(input: NewTaskInput): Task
  updateTask(id: string, patch: Partial<Task>): void
  deleteTask(id: string): void
  /** Move a tarefa para outra coluna do quadro, sincronizando o status de conclusão. */
  moveTask(taskId: string, columnId: string): Task | undefined
  addTaskColumn(input: TaskColumnInput): TaskColumn
  updateTaskColumn(id: string, patch: Partial<TaskColumnInput>): void
  /** Exclui a coluna (nunca a última); as tarefas dela vão para a coluna restante mais à esquerda. */
  deleteTaskColumn(id: string): void
  addAppointment(input: NewAppointmentInput): Appointment
  deleteAppointment(id: string): void
  addAppointmentCategory(input: AppointmentCategoryInput): AppointmentCategory
  updateAppointmentCategory(id: string, patch: Partial<AppointmentCategoryInput>): void
  /** Exclui a categoria; os compromissos dela ficam sem categoria. */
  deleteAppointmentCategory(id: string): void
  addDocument(input: NewDocumentInput): LegalDocument
  deleteDocument(id: string): void
  /** Lançamento de honorários (fatura) do módulo financeiro, sempre de um cliente. */
  addInvoice(input: NewInvoiceInput): Invoice
  markInvoicePaid(id: string, paidAt: string, method?: Invoice["method"]): void
  deleteInvoice(id: string): void
  markNotificationRead(id: string): void
  markAllNotificationsRead(): void
}

const DataContext = React.createContext<DemoState | null>(null)
const ActionsContext = React.createContext<DemoActions | null>(null)

const nowISO = () => toLocalISO(getNow())

/** Código interno sequencial (#103000, #103001…), sem repetir após recarregar. */
const nextProcessCode = (processes: Process[]) => {
  const highest = processes.reduce((max, p) => Math.max(max, Number(p.code.replace(/\D/g, "")) || 0), 102999)
  return `#${highest + 1}`
}
const base = () => ({ organizationId: account.currentOrgId(), createdAt: nowISO() })

/** Campos do cadastro com nome legível — para descrever a edição na timeline. */
const CLIENT_FIELD_LABELS: Partial<Record<keyof Client, string>> = {
  name: "nome",
  kind: "tipo",
  document: "documento",
  email: "e-mail",
  phone: "telefone",
  whatsapp: "WhatsApp",
  address: "endereço",
  birthDate: "data de nascimento/fundação",
  area: "área",
  tags: "tags",
  notes: "observações",
  contact: "contato principal",
  profession: "profissão",
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Cliente de um item vinculado a cliente e/ou processo. */
const clientOfItem = (s: PersistedState, item: { clientId?: string; processId?: string }) =>
  item.clientId || (item.processId ? s.processes.find((p) => p.id === item.processId)?.clientId || undefined : undefined)

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DemoState>(initialState)
  const stateRef = React.useRef(state)
  // Recarregar após falha (`retryLoad`); aponta para `load`, definido mais abaixo.
  const loadRef = React.useRef<() => void>(() => {})
  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const actions = React.useMemo<DemoActions>(() => {
    const logActivity = (a: Omit<Activity, "id" | "organizationId" | "createdAt" | "at">): Activity => ({
      ...a,
      ...base(),
      id: uid("act"),
      at: nowISO(),
    })

    const commit = (updater: (s: DemoState) => DemoState) => {
      const next = updater(stateRef.current)
      stateRef.current = next
      setState(next)
    }

    return {
      retryLoad() {
        loadRef.current()
      },

      addClient(input) {
        const at = nowISO()
        const client: Client = {
          ...base(),
          ...input,
          id: uid("c"),
          status: input.status ?? "novo",
          clientSince: at.slice(0, 10),
          lastActivityAt: at,
          updatedAt: at,
        }
        commit((s) => ({
          ...s,
          clients: [client, ...s.clients],
          activities: [
            logActivity({
              type: "client",
              message: `${client.name} cadastrado como cliente.`,
              clientId: client.id,
              actorUserId: account.currentUserId(),
              href: `/clientes/${client.id}`,
            }),
            ...s.activities,
          ],
        }))
        return client
      },

      updateClient(id, patch) {
        const current = stateRef.current.clients.find((c) => c.id === id)
        if (!current) return
        const changed = (Object.keys(patch) as (keyof Client)[]).filter((key) => !sameValue(current[key], patch[key]))
        if (!changed.length) return
        const at = nowISO()
        const updated: Client = { ...current, ...patch, updatedAt: at, lastActivityAt: at }
        const actor = account.getUser(account.currentUserId()).name
        const entry = (message: string, detail?: string) =>
          logActivity({ type: "client", actor, message, detail, clientId: id, actorUserId: account.currentUserId(), href: `/clientes/${id}` })

        const log: Activity[] = []
        if (changed.includes("status")) {
          log.push(
            entry(
              `alterou o status do cliente para ${CLIENT_STATUS[updated.status].label.toLowerCase()}.`,
              `Antes: ${CLIENT_STATUS[current.status].label}`,
            ),
          )
        }
        if (changed.includes("ownerId")) {
          log.push(entry(`definiu ${account.getUser(updated.ownerId).name} como responsável.`, `Antes: ${account.getUser(current.ownerId).name}`))
        }
        const fields = changed.map((key) => CLIENT_FIELD_LABELS[key]).filter(Boolean)
        if (fields.length) log.push(entry("atualizou o cadastro do cliente.", `Alterado: ${fields.join(", ")}`))

        commit((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? updated : c)), activities: [...log, ...s.activities] }))
      },

      deleteClient(id) {
        const client = stateRef.current.clients.find((c) => c.id === id)
        if (!client) return
        commit((s) => ({
          ...s,
          clients: s.clients.filter((c) => c.id !== id),
          activities: [
            logActivity({
              type: "client",
              message: `${client.name} foi excluído do cadastro de clientes.`,
              actorUserId: account.currentUserId(),
            }),
            ...s.activities,
          ],
        }))
      },

      addProcess(input) {
        const at = nowISO()
        const code = nextProcessCode(stateRef.current.processes)
        const process: Process = {
          ...base(),
          ...input,
          id: uid("p"),
          code,
          distributedAt: at.slice(0, 10),
          lastMovementAt: at,
          movements: [
            {
              id: uid("m"),
              at,
              kind: "distribution",
              title: "Processo cadastrado",
              description: `Cadastrado por ${account.getUser(account.currentUserId()).name}.`,
            },
          ],
        }
        commit((s) => ({
          ...s,
          processes: [process, ...s.processes],
          activities: [
            logActivity({
              type: "petition",
              message: `Processo ${code} cadastrado.`,
              detail: `${input.type} · ${s.clients.find((c) => c.id === input.clientId)?.name ?? ""}`,
              clientId: input.clientId,
              processId: process.id,
              actorUserId: account.currentUserId(),
              href: `/processos/${process.id}`,
            }),
            ...s.activities,
          ],
        }))
        return process
      },

      updateProcess(id, patch) {
        const current = stateRef.current.processes.find((p) => p.id === id)
        if (!current) return undefined
        const updated: Process = { ...current, ...patch }
        commit((s) => ({ ...s, processes: s.processes.map((p) => (p.id === id ? updated : p)) }))
        return updated
      },

      importProcess(sheet, meta) {
        const at = nowISO()
        const code = nextProcessCode(stateRef.current.processes)
        const draft = buildProcessDraft(sheet, meta, at)
        const process: Process = {
          ...base(),
          ...draft,
          id: uid("p"),
          code,
          movements: draft.movements.map((movement) => ({ ...movement, id: uid("m") })),
        }

        commit((s) => ({
          ...s,
          processes: [process, ...s.processes],
          activities: [
            logActivity({
              type: "petition",
              message: `Processo ${code} importado da consulta processual.`,
              detail: [sheet.tribunal, process.type].filter(Boolean).join(" · "),
              clientId: process.clientId,
              processId: process.id,
              actorUserId: account.currentUserId(),
              href: `/processos/${process.id}`,
            }),
            ...s.activities,
          ],
        }))
        return process
      },

      applyProcessSync(processId, sheet) {
        const current = stateRef.current.processes.find((p) => p.id === processId)
        if (!current) return { added: 0 }

        const at = nowISO()
        const cnj = current.cnj ?? sheet.cnj
        const incoming = toProcessMovements(sheet.movements, sheet.source.provider)
        const { fresh } = diffMovements(collectHashes(cnj, current.movements), incoming)

        const imported: ProcessMovement[] = fresh.map((movement) => ({ ...movement, id: uid("m") }))
        const movements = [...imported, ...current.movements].sort((a, b) => b.at.localeCompare(a.at))

        const updated: Process = {
          ...current,
          movements,
          lastMovementAt: movements[0]?.at ?? current.lastMovementAt,
          lastSyncedAt: at,
          cnj,
          // A fonte complementa o cadastro, mas nunca apaga o que já foi preenchido.
          tribunal: sheet.tribunal ?? current.tribunal,
          degree: sheet.degree ?? current.degree,
          className: sheet.className ?? current.className,
          subject: sheet.subject ?? current.subject,
          judicialUnit: sheet.judicialUnit ?? current.judicialUnit,
          system: sheet.system ?? current.system,
          parties: sheet.parties.active.length || sheet.parties.passive.length || sheet.parties.others.length ? sheet.parties : current.parties,
          source: {
            provider: sheet.source.provider,
            externalId: sheet.source.externalId,
            dataset: sheet.source.dataset,
            sourceStatus: sheet.sourceStatus,
          },
        }

        commit((s) => ({
          ...s,
          processes: s.processes.map((p) => (p.id === processId ? updated : p)),
          // Sincronização sem novidade não polui a timeline do escritório.
          activities: imported.length
            ? [
                logActivity({
                  type: "movement",
                  message: `${imported.length === 1 ? "Nova movimentação" : `${imported.length} novas movimentações`} no processo ${current.code}.`,
                  detail: imported[0]?.title,
                  clientId: current.clientId,
                  processId: current.id,
                  actorUserId: account.currentUserId(),
                  href: `/processos/${current.id}`,
                }),
                ...s.activities,
              ]
            : s.activities,
        }))

        return { added: imported.length, process: updated }
      },

      deleteProcess(id) {
        const process = stateRef.current.processes.find((p) => p.id === id)
        if (!process) return
        commit((s) => ({
          ...s,
          processes: s.processes.filter((p) => p.id !== id),
          activities: [
            logActivity({
              type: "petition",
              message: `Processo ${process.code} foi excluído.`,
              clientId: process.clientId,
              actorUserId: account.currentUserId(),
            }),
            ...s.activities,
          ],
        }))
      },

      toggleTask(id) {
        const task = stateRef.current.tasks.find((t) => t.id === id)
        if (!task) return undefined
        const done = task.status !== "concluida"
        const updated: Task = {
          ...task,
          status: done ? "concluida" : "pendente",
          completedAt: done ? nowISO() : undefined,
        }
        const related = task.related
        commit((s) => ({
          ...s,
          tasks: s.tasks.map((t) => (t.id === id ? updated : t)),
          activities: done
            ? [
                logActivity({
                  type: "task",
                  actor: account.getUser(account.currentUserId()).name,
                  message: "concluiu uma tarefa.",
                  detail: task.title,
                  actorUserId: account.currentUserId(),
                  clientId: relatedClientId(s, related),
                  processId: related?.type === "process" ? related.id : undefined,
                  href: "/tarefas",
                }),
                ...s.activities,
              ]
            : s.activities,
        }))
        return updated
      },

      addTask(input) {
        const task: Task = { ...base(), ...input, id: uid("t"), status: "pendente" }
        commit((s) => ({
          ...s,
          tasks: [task, ...s.tasks],
          activities: [
            logActivity({
              type: "task",
              actor: account.getUser(account.currentUserId()).name,
              message: "criou uma tarefa.",
              detail: task.title,
              actorUserId: account.currentUserId(),
              clientId: relatedClientId(s, input.related),
              processId: input.related?.type === "process" ? input.related.id : undefined,
              href: `/tarefas?tarefa=${task.id}`,
            }),
            ...s.activities,
          ],
        }))
        return task
      },

      updateTask(id, patch) {
        commit((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
      },

      deleteTask(id) {
        const task = stateRef.current.tasks.find((t) => t.id === id)
        if (!task) return
        commit((s) => ({
          ...s,
          tasks: s.tasks.filter((t) => t.id !== id),
          activities: [
            logActivity({
              type: "task",
              actor: account.getUser(account.currentUserId()).name,
              message: "excluiu uma tarefa.",
              detail: task.title,
              actorUserId: account.currentUserId(),
              clientId: relatedClientId(s, task.related),
              processId: task.related?.type === "process" ? task.related.id : undefined,
            }),
            ...s.activities,
          ],
        }))
      },

      moveTask(taskId, columnId) {
        const task = stateRef.current.tasks.find((t) => t.id === taskId)
        const column = stateRef.current.taskColumns.find((c) => c.id === columnId)
        if (!task || !column) return undefined
        const wasDone = task.status === "concluida"
        const done = !!column.isDone
        const updated: Task = {
          ...task,
          columnId,
          status: done ? "concluida" : "pendente",
          completedAt: done ? (task.completedAt ?? nowISO()) : undefined,
        }
        const related = task.related
        commit((s) => ({
          ...s,
          tasks: s.tasks.map((t) => (t.id === taskId ? updated : t)),
          activities:
            !wasDone && done
              ? [
                  logActivity({
                    type: "task",
                    actor: account.getUser(account.currentUserId()).name,
                    message: "concluiu uma tarefa.",
                    detail: task.title,
                    actorUserId: account.currentUserId(),
                    clientId: relatedClientId(s, related),
                    processId: related?.type === "process" ? related.id : undefined,
                    href: "/tarefas",
                  }),
                  ...s.activities,
                ]
              : s.activities,
        }))
        return updated
      },

      addTaskColumn(input) {
        const columns = stateRef.current.taskColumns
        const column: TaskColumn = {
          ...base(),
          id: uid("col"),
          name: input.name.trim(),
          color: input.color,
          order: columns.length,
          isDone: input.isDone,
        }
        commit((s) => ({ ...s, taskColumns: [...s.taskColumns, column] }))
        return column
      },

      updateTaskColumn(id, patch) {
        const name = patch.name?.trim()
        commit((s) => ({
          ...s,
          taskColumns: s.taskColumns.map((c) =>
            c.id === id ? { ...c, ...(name ? { name } : {}), ...(patch.color ? { color: patch.color } : {}) } : c,
          ),
        }))
      },

      deleteTaskColumn(id) {
        const columns = stateRef.current.taskColumns
        if (columns.length <= 1) return
        const fallback = columns.filter((c) => c.id !== id).sort((a, b) => a.order - b.order)[0]
        commit((s) => ({
          ...s,
          taskColumns: s.taskColumns.filter((c) => c.id !== id),
          tasks: s.tasks.map((t) =>
            t.columnId === id
              ? {
                  ...t,
                  columnId: fallback.id,
                  status: fallback.isDone ? "concluida" : "pendente",
                  completedAt: fallback.isDone ? (t.completedAt ?? nowISO()) : undefined,
                }
              : t,
          ),
        }))
      },

      addAppointment(input) {
        const appt: Appointment = { ...base(), ...input, id: uid("a") }
        commit((s) => ({
          ...s,
          appointments: [...s.appointments, appt],
          activities: [
            logActivity({
              type: "appointment",
              message: `${input.title} agendado${input.personName ? ` com ${input.personName}` : ""}.`,
              detail: input.start.slice(8, 10) + "/" + input.start.slice(5, 7) + ", às " + input.start.slice(11, 16),
              clientId: clientOfItem(s, input),
              processId: input.processId,
              actorUserId: account.currentUserId(),
              href: "/agenda",
            }),
            ...s.activities,
          ],
        }))
        return appt
      },

      deleteAppointment(id) {
        const appt = stateRef.current.appointments.find((a) => a.id === id)
        if (!appt) return
        commit((s) => ({
          ...s,
          appointments: s.appointments.filter((a) => a.id !== id),
          activities: [
            logActivity({
              type: "appointment",
              message: `${appt.title} foi removido da agenda.`,
              clientId: clientOfItem(s, appt),
              processId: appt.processId,
              actorUserId: account.currentUserId(),
            }),
            ...s.activities,
          ],
        }))
      },

      addAppointmentCategory(input) {
        const category: AppointmentCategory = { ...base(), id: uid("cat"), name: input.name.trim(), color: input.color }
        commit((s) => ({ ...s, appointmentCategories: [...s.appointmentCategories, category] }))
        return category
      },

      updateAppointmentCategory(id, patch) {
        const name = patch.name?.trim()
        commit((s) => ({
          ...s,
          appointmentCategories: s.appointmentCategories.map((c) =>
            c.id === id ? { ...c, ...(name ? { name } : {}), ...(patch.color ? { color: patch.color } : {}) } : c,
          ),
        }))
      },

      deleteAppointmentCategory(id) {
        commit((s) => ({
          ...s,
          appointmentCategories: s.appointmentCategories.filter((c) => c.id !== id),
          appointments: s.appointments.map((a) => (a.categoryId === id ? { ...a, categoryId: undefined } : a)),
        }))
      },

      addDocument(input) {
        const doc: LegalDocument = {
          ...base(),
          ...input,
          id: uid("d"),
          uploadedById: account.currentUserId(),
          uploadedAt: nowISO(),
        }
        commit((s) => ({
          ...s,
          documents: [doc, ...s.documents],
          activities: [
            logActivity({
              type: "document",
              actor: account.getUser(account.currentUserId()).name,
              message: "adicionou um documento.",
              detail: doc.name,
              clientId: clientOfItem(s, doc),
              processId: doc.processId,
              actorUserId: account.currentUserId(),
              href: clientOfItem(s, doc) ? `/clientes/${clientOfItem(s, doc)}?tab=documentos` : "/documentos",
            }),
            ...s.activities,
          ],
        }))
        return doc
      },

      deleteDocument(id) {
        const doc = stateRef.current.documents.find((d) => d.id === id)
        if (!doc) return
        commit((s) => ({
          ...s,
          documents: s.documents.filter((d) => d.id !== id),
          activities: [
            logActivity({
              type: "document",
              actor: account.getUser(account.currentUserId()).name,
              message: "excluiu um documento.",
              detail: doc.name,
              clientId: clientOfItem(s, doc),
              processId: doc.processId,
              actorUserId: account.currentUserId(),
            }),
            ...s.activities,
          ],
        }))
      },

      addInvoice(input) {
        const invoice: Invoice = { ...base(), ...input, id: uid("inv") }
        commit((s) => ({
          ...s,
          invoices: [invoice, ...s.invoices],
          activities: [
            logActivity({
              type: "payment",
              actor: account.getUser(account.currentUserId()).name,
              message: invoice.status === "pago" ? "registrou um pagamento recebido." : "lançou uma cobrança de honorários.",
              detail: `${invoice.description} · ${formatCurrency(invoice.amount)} · ${
                invoice.status === "pago" && invoice.paidAt ? `pago em ${fmtNumericDate(invoice.paidAt)}` : `vence ${fmtNumericDate(invoice.dueDate)}`
              }`,
              clientId: invoice.clientId,
              processId: invoice.processId,
              actorUserId: account.currentUserId(),
              href: `/clientes/${invoice.clientId}?tab=financeiro`,
            }),
            ...s.activities,
          ],
        }))
        return invoice
      },

      markInvoicePaid(id, paidAt, method) {
        const invoice = stateRef.current.invoices.find((i) => i.id === id)
        if (!invoice || invoice.status === "pago") return
        const updated: Invoice = { ...invoice, status: "pago", paidAt, method: method ?? invoice.method }
        commit((s) => ({
          ...s,
          invoices: s.invoices.map((i) => (i.id === id ? updated : i)),
          activities: [
            logActivity({
              type: "payment",
              actor: account.getUser(account.currentUserId()).name,
              message: "registrou um pagamento recebido.",
              detail: `${invoice.description} · ${formatCurrency(invoice.amount)} · pago em ${fmtNumericDate(paidAt)}`,
              clientId: invoice.clientId,
              processId: invoice.processId,
              actorUserId: account.currentUserId(),
              href: `/clientes/${invoice.clientId}?tab=financeiro`,
            }),
            ...s.activities,
          ],
        }))
      },

      deleteInvoice(id) {
        const invoice = stateRef.current.invoices.find((i) => i.id === id)
        if (!invoice) return
        commit((s) => ({
          ...s,
          invoices: s.invoices.filter((i) => i.id !== id),
          activities: [
            logActivity({
              type: "payment",
              actor: account.getUser(account.currentUserId()).name,
              message: "excluiu um lançamento financeiro.",
              detail: `${invoice.description} · ${formatCurrency(invoice.amount)}`,
              clientId: invoice.clientId,
              processId: invoice.processId,
              actorUserId: account.currentUserId(),
            }),
            ...s.activities,
          ],
        }))
      },

      markNotificationRead(id) {
        commit((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
      },

      markAllNotificationsRead() {
        commit((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
      },
    }
  }, [])

  // Último estado que já foi para o banco (ou veio dele). Base da comparação na
  // próxima gravação: só o que mudou desde então é enviado.
  const savedRef = React.useRef<PersistedState | null>(null)
  // Gravações em fila, na ordem em que aconteceram (criar e depois excluir, por exemplo).
  const queueRef = React.useRef<Promise<void>>(Promise.resolve())

  const replaceWithServer = React.useCallback((saved: PersistedState) => {
    savedRef.current = saved
    const next: DemoState = { ...saved, hydrated: true, loadError: false }
    stateRef.current = next
    setState(next)
  }, [])

  // Carrega o que a RLS deixa esta pessoa ver. Uma vez por sessão (ou de novo, após falha).
  const cancelledRef = React.useRef(false)
  const load = React.useCallback(() => {
    if (stateRef.current.loadError) {
      stateRef.current = { ...stateRef.current, loadError: false }
      setState(stateRef.current)
    }
    loadState(getSupabase())
      .then((saved) => {
        if (cancelledRef.current) return
        savedRef.current = saved
        // O que foi criado antes de terminar de carregar entra junto (e é gravado a seguir).
        const current = stateRef.current
        const next = { hydrated: true, loadError: false } as DemoState
        for (const key of Object.keys(saved) as (keyof PersistedState)[]) {
          ;(next as unknown as Record<string, unknown>)[key] = mergeById<{ id: string }>(current[key], saved[key])
        }
        stateRef.current = next
        setState(next)
      })
      .catch((error) => {
        console.error(error)
        if (cancelledRef.current) return
        stateRef.current = { ...stateRef.current, loadError: true }
        setState(stateRef.current)
        toast.error("Não foi possível carregar os dados do escritório.", { description: "Verifique a conexão e tente de novo." })
      })
  }, [])
  React.useEffect(() => {
    loadRef.current = load
    cancelledRef.current = false
    load()
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  // Gravação agrupada: várias mudanças seguidas viram uma ida ao banco. Se o banco
  // recusar (sem permissão, falha de rede), a tela volta a mostrar o que está salvo.
  const persist = React.useCallback(() => {
    const saved = savedRef.current
    if (!saved || !stateRef.current.hydrated) return
    const next = persisted(stateRef.current)
    const diff = diffState(saved, next)
    if (!Object.keys(diff).length) return
    savedRef.current = next
    const organizationId = account.currentOrgId()

    queueRef.current = queueRef.current.then(async () => {
      const supabase = getSupabase()
      const result = await syncState(supabase, organizationId, diff).catch((): SyncResult => ({ denied: [], conflicts: [], failed: true }))
      if (!result.denied.length && !result.conflicts.length && !result.failed) return
      toast.error(
        result.denied.length
          ? `Você não tem permissão para alterar ${result.denied.map((key) => COLLECTION_LABELS[key]).join(", ")}.`
          : result.conflicts.includes("clients")
            ? "Já existe um cliente com este CPF/CNPJ no escritório (ou o documento é inválido)."
            : result.conflicts.length
              ? `O banco recusou alterações em ${result.conflicts.map((key) => COLLECTION_LABELS[key]).join(", ")}.`
              : "Não foi possível salvar as últimas alterações.",
        { description: "A tela foi atualizada com o que está salvo no escritório." },
      )
      try {
        replaceWithServer(await loadState(supabase))
      } catch (error) {
        console.error(error)
      }
    })
  }, [replaceWithServer])

  React.useEffect(() => {
    if (!state.hydrated) return
    const timer = window.setTimeout(persist, 300)
    return () => window.clearTimeout(timer)
  }, [state, persist])

  // Ao sair ou trocar de aba, grava na hora.
  React.useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") persist()
    }
    window.addEventListener("pagehide", persist)
    document.addEventListener("visibilitychange", onHidden)
    return () => {
      window.removeEventListener("pagehide", persist)
      document.removeEventListener("visibilitychange", onHidden)
    }
  }, [persist])

  return (
    <ActionsContext.Provider value={actions}>
      <DataContext.Provider value={state}>{children}</DataContext.Provider>
    </ActionsContext.Provider>
  )
}

export function useDemoData() {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useDemoData deve ser usado dentro de DemoStoreProvider")
  return ctx
}

export function useDemoActions() {
  const ctx = React.useContext(ActionsContext)
  if (!ctx) throw new Error("useDemoActions deve ser usado dentro de DemoStoreProvider")
  return ctx
}
