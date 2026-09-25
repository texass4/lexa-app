"use client"

import * as React from "react"
import { toast } from "sonner"
import type { Activity, Appointment, AppointmentCategory, Client, LegalDocument, Process, ProcessMovement, Task } from "@/types"
import * as account from "@/lib/account"
import { getNow, toLocalISO } from "@/lib/dates"
import { uid } from "@/lib/format"
import { collectHashes, diffMovements } from "@/lib/services/processes/movements"
import { buildProcessDraft, toProcessMovements, type ImportProcessMeta } from "@/lib/services/processes/import"
import type { ProcessSheet } from "@/lib/services/processes/sheet"
import { loadState, saveState, type PersistedState } from "./storage"

/**
 * Store da aplicação. Começa vazio — não há dados de demonstração — e tudo o
 * que o escritório cadastra é salvo no navegador (`storage.ts`). Cada ação
 * corresponde a uma futura chamada de API: os componentes consomem apenas
 * `useDemoData` e `useDemoActions`, então a troca da fonte de dados fica
 * isolada neste arquivo.
 */

export interface DemoState extends PersistedState {
  /** `true` depois que os dados salvos no navegador foram carregados. */
  hydrated: boolean
}

const initialState = (): DemoState => ({
  clients: [],
  processes: [],
  tasks: [],
  appointments: [],
  appointmentCategories: [],
  documents: [],
  invoices: [],
  activities: [],
  notifications: [],
  hydrated: false,
})

/** O que vai para o armazenamento: o estado sem os sinalizadores de sessão. */
const persisted = (state: DemoState): PersistedState => {
  const data: Partial<DemoState> = { ...state }
  delete data.hydrated
  return data as PersistedState
}

/** Junta o que foi salvo com o que foi criado antes do carregamento terminar. */
function mergeById<T extends { id: string }>(current: T[], saved: T[] = []): T[] {
  const known = new Set(current.map((item) => item.id))
  return [...current, ...saved.filter((item) => !known.has(item.id))]
}

export type NewClientInput = Pick<Client, "name" | "kind" | "document" | "email" | "phone" | "area" | "ownerId" | "address">
export type NewTaskInput = Pick<Task, "title" | "dueAt" | "priority" | "assigneeId" | "description" | "related">
export type NewAppointmentInput = Pick<
  Appointment,
  "title" | "categoryId" | "start" | "end" | "ownerId" | "clientId" | "processId" | "notes" | "personName" | "area" | "location"
>
export type AppointmentCategoryInput = Pick<AppointmentCategory, "name" | "color">
export type NewProcessInput = Pick<
  Process,
  "number" | "clientId" | "area" | "type" | "court" | "district" | "opposingParty" | "ownerId" | "status" | "claimValue"
>
export type NewDocumentInput = Pick<LegalDocument, "name" | "kind" | "clientId" | "processId" | "extension" | "sizeBytes">

/** Resultado de uma sincronização com a fonte externa. */
export interface SyncOutcome {
  /** Movimentações que ainda não existiam no escritório. */
  added: number
  process?: Process
}

interface DemoActions {
  addClient(input: NewClientInput): Client
  updateClient(id: string, patch: Partial<Client>): void
  addProcess(input: NewProcessInput): Process
  /** Ajusta os dados do escritório de um processo (cliente, área, responsável…). */
  updateProcess(id: string, patch: Partial<NewProcessInput>): Process | undefined
  /** Cria um processo a partir de uma ficha vinda de consulta externa. */
  importProcess(sheet: ProcessSheet, meta: ImportProcessMeta): Process
  /** Aplica uma ficha reconsultada, importando só o que é novo. */
  applyProcessSync(processId: string, sheet: ProcessSheet): SyncOutcome
  toggleTask(id: string): Task | undefined
  addTask(input: NewTaskInput): Task
  updateTask(id: string, patch: Partial<Task>): void
  addAppointment(input: NewAppointmentInput): Appointment
  addAppointmentCategory(input: AppointmentCategoryInput): AppointmentCategory
  updateAppointmentCategory(id: string, patch: Partial<AppointmentCategoryInput>): void
  /** Exclui a categoria; os compromissos dela ficam sem categoria. */
  deleteAppointmentCategory(id: string): void
  addDocument(input: NewDocumentInput): LegalDocument
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
const base = () => ({ organizationId: account.ORG_ID, createdAt: nowISO() })

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DemoState>(initialState)
  const stateRef = React.useRef(state)
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
      addClient(input) {
        const at = nowISO()
        const client: Client = {
          ...base(),
          ...input,
          id: uid("c"),
          status: "novo",
          clientSince: at.slice(0, 10),
          lastActivityAt: at,
        }
        commit((s) => ({
          ...s,
          clients: [client, ...s.clients],
          activities: [
            logActivity({
              type: "client",
              message: `${client.name} cadastrado como cliente.`,
              clientId: client.id,
              actorUserId: account.CURRENT_USER_ID,
              href: `/clientes/${client.id}`,
            }),
            ...s.activities,
          ],
        }))
        return client
      },

      updateClient(id, patch) {
        commit((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
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
              description: `Cadastrado por ${account.getUser(account.CURRENT_USER_ID).name}.`,
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
              actorUserId: account.CURRENT_USER_ID,
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
              actorUserId: account.CURRENT_USER_ID,
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
                  actorUserId: account.CURRENT_USER_ID,
                  href: `/processos/${current.id}`,
                }),
                ...s.activities,
              ]
            : s.activities,
        }))

        return { added: imported.length, process: updated }
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
                  actor: account.getUser(account.CURRENT_USER_ID).name,
                  message: "concluiu uma tarefa.",
                  detail: task.title,
                  actorUserId: account.CURRENT_USER_ID,
                  clientId:
                    related?.type === "client"
                      ? related.id
                      : related?.type === "process"
                        ? s.processes.find((p) => p.id === related.id)?.clientId
                        : undefined,
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
              actor: account.getUser(account.CURRENT_USER_ID).name,
              message: "criou uma tarefa.",
              detail: task.title,
              actorUserId: account.CURRENT_USER_ID,
              clientId: input.related?.type === "client" ? input.related.id : undefined,
              processId: input.related?.type === "process" ? input.related.id : undefined,
              href: "/tarefas",
            }),
            ...s.activities,
          ],
        }))
        return task
      },

      updateTask(id, patch) {
        commit((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
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
              clientId: input.clientId,
              processId: input.processId,
              actorUserId: account.CURRENT_USER_ID,
              href: "/agenda",
            }),
            ...s.activities,
          ],
        }))
        return appt
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
          uploadedById: account.CURRENT_USER_ID,
          uploadedAt: nowISO(),
        }
        commit((s) => ({
          ...s,
          documents: [doc, ...s.documents],
          activities: [
            logActivity({
              type: "document",
              actor: account.getUser(account.CURRENT_USER_ID).name,
              message: "adicionou um documento.",
              detail: doc.name,
              clientId: doc.clientId,
              processId: doc.processId,
              actorUserId: account.CURRENT_USER_ID,
              href: doc.clientId ? `/clientes/${doc.clientId}?tab=documentos` : "/documentos",
            }),
            ...s.activities,
          ],
        }))
        return doc
      },

      markNotificationRead(id) {
        commit((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
      },

      markAllNotificationsRead() {
        commit((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
      },
    }
  }, [])

  // Os dados salvos entram depois da hidratação (o servidor não enxerga o
  // localStorage). Uma única vez — navegar entre telas não recarrega nada.
  React.useEffect(() => {
    const saved = loadState(account.ORG_ID)
    const current = stateRef.current
    const next: DemoState = {
      clients: mergeById(current.clients, saved.clients),
      processes: mergeById(current.processes, saved.processes),
      tasks: mergeById(current.tasks, saved.tasks),
      appointments: mergeById(current.appointments, saved.appointments),
      appointmentCategories: mergeById(current.appointmentCategories, saved.appointmentCategories),
      documents: mergeById(current.documents, saved.documents),
      invoices: mergeById(current.invoices, saved.invoices),
      activities: mergeById(current.activities, saved.activities),
      notifications: mergeById(current.notifications, saved.notifications),
      hydrated: true,
    }
    stateRef.current = next
    setState(next)
  }, [])

  // Gravação agrupada: várias mudanças seguidas viram uma escrita só, fora do
  // caminho da interação. Ao sair da página, grava na hora.
  const warnedRef = React.useRef(false)
  const persist = React.useCallback(() => {
    if (!stateRef.current.hydrated) return
    const result = saveState(account.ORG_ID, persisted(stateRef.current))
    if (result === "saved" || warnedRef.current) return
    warnedRef.current = true
    toast.error(result === "failed" ? "Não foi possível salvar os dados neste navegador." : "Armazenamento do navegador cheio.", {
      description:
        result === "failed"
          ? "O armazenamento local está bloqueado ou cheio. As alterações ficam disponíveis até recarregar a página."
          : "Os processos foram salvos sem o registro bruto da fonte.",
    })
  }, [])

  React.useEffect(() => {
    if (!state.hydrated) return
    const timer = window.setTimeout(persist, 300)
    return () => window.clearTimeout(timer)
  }, [state, persist])

  React.useEffect(() => {
    window.addEventListener("pagehide", persist)
    return () => window.removeEventListener("pagehide", persist)
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
