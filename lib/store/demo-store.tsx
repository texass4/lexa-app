"use client"

import * as React from "react"
import { toast } from "sonner"
import type { Activity, Appointment, AppointmentCategory, Client, Invoice, LegalDocument, Prazo, Process, Task, TaskColumn } from "@/types"
import * as account from "@/lib/account"
import { CLIENT_STATUS } from "@/lib/config"
import { fmtNumericDate, getNow, toLocalISO } from "@/lib/dates"
import { formatCurrency, uid } from "@/lib/format"
import { relatedClientId } from "@/lib/selectors"
import { resolveClientStatus } from "@/lib/clients"
import type { NewClientDraft } from "@/lib/client-import"
import { describeAppointmentChange } from "@/lib/agenda"
import { describeInvoiceChange } from "@/lib/invoices"
import { buildProcessDraft, type ImportProcessMeta } from "@/lib/services/processes/import"
import { mergeProcessSheet, newMovementsMessage } from "@/lib/services/processes/process-sync"
import type { ProcessSheet } from "@/lib/services/processes/sheet"
import { getSupabase } from "@/lib/supabase/client"
import { useSplashReady } from "@/components/layout/app-splash"
import { COLLECTION_LABELS, loadState, type Collection, type PersistedState, type Snapshot } from "./storage"
import { OfficeSync, REVALIDATE_AFTER_HIDDEN_MS, type SaveResult, type SyncNotice } from "./office-sync"

export type { SaveResult } from "./office-sync"

/**
 * Store da aplicação, com os dados do escritório de quem está logado — uma cópia
 * local do Supabase, que é a fonte de verdade. As ações atualizam a memória na hora
 * e a gravação no Supabase acontece em seguida, agrupada; o que outras pessoas
 * gravam chega pelo Realtime (`office-sync.ts`). Os componentes consomem apenas
 * `useDemoData` e `useDemoActions`; quem decide o que cada pessoa lê e grava é a RLS.
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
  deadlines: [],
  appointments: [],
  appointmentCategories: [],
  documents: [],
  invoices: [],
  activities: [],
  notifications: [],
  hydrated: false,
  loadError: false,
})

/** Junta o que foi salvo com o que foi criado antes do carregamento terminar. */
function mergeById<T extends { id: string }>(current: T[], saved: T[] = []): T[] {
  const known = new Set(current.map((item) => item.id))
  return [...current, ...saved.filter((item) => !known.has(item.id))]
}

export type NewClientInput = Pick<Client, "name" | "kind" | "document" | "email" | "phone" | "area" | "ownerId" | "address"> &
  Partial<Pick<Client, "status" | "whatsapp" | "addressDetails" | "birthDate" | "tags" | "notes" | "contact" | "profession">>
export type NewInvoiceInput = Pick<Invoice, "clientId" | "processId" | "description" | "amount" | "dueDate" | "status" | "paidAt" | "method">
export type NewTaskInput = Pick<Task, "title" | "dueAt" | "priority" | "assigneeId" | "description" | "related" | "columnId">
export type NewPrazoInput = Pick<
  Prazo,
  "processId" | "description" | "fatalDate" | "internalDate" | "internalDateReason" | "responsibleId" | "origin" | "intimacaoId" | "triageItemId"
>
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

/**
 * Opções de quem salva a partir de um formulário: a versão do registro quando o
 * formulário abriu (`versionOf`). Se outra pessoa gravou depois, salvar é recusado.
 */
export interface SaveOptions {
  baseVersion?: string | null
}

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
  /**
   * Importação de planilha: grava os cadastros já validados (`lib/client-import.ts`) e
   * espera o banco. Devolve os gravados e, para os recusados, a posição e o motivo.
   */
  importClients(drafts: NewClientDraft[]): Promise<{ saved: Client[]; failed: { index: number; reason: string }[] }>
  /** Versão (`updated_at`) do registro no banco — o formulário guarda ao abrir e passa em `SaveOptions`. */
  versionOf(collection: Collection, id: string): string | null
  /** Atualiza o cadastro e registra na timeline o que mudou (status, responsável, dados). */
  updateClient(id: string, patch: Partial<Client>, options?: SaveOptions): Promise<SaveResult<Client>>
  /** Exclui o cliente. Processos, documentos, tarefas e compromissos vinculados ficam sem cliente. */
  deleteClient(id: string): void
  /** Cadastra e espera o banco, que gera o código interno. `null` se não foi possível (aviso já mostrado). */
  addProcess(input: NewProcessInput): Promise<Process | null>
  /** Ajusta os dados do escritório de um processo (cliente, área, responsável…). */
  updateProcess(id: string, patch: Partial<NewProcessInput>, options?: SaveOptions): Promise<SaveResult<Process>>
  /** Cria um processo a partir de uma ficha vinda de consulta externa (código gerado pelo banco). */
  importProcess(sheet: ProcessSheet, meta: ImportProcessMeta): Promise<Process | null>
  /**
   * Aplica uma ficha reconsultada, importando só o que é novo. `checkedAt` (ISO)
   * é quando a fonte foi conferida — pode vir do cache do escritório.
   */
  applyProcessSync(processId: string, sheet: ProcessSheet, checkedAt?: string): SyncOutcome
  /** Exclui o processo (o banco exclui junto os prazos dele). */
  deleteProcess(id: string): void
  toggleTask(id: string): Task | undefined
  /** Cria a tarefa. Com `prazoId`, a tarefa passa a ser a do prazo (vínculo por id). */
  addTask(input: NewTaskInput, options?: { prazoId?: string }): Task
  /**
   * Cadastra um prazo (sempre `aberto`) e, com `createTask`, a tarefa vinculada a ele —
   * na data interna, para o responsável do prazo. Espera o banco confirmar; `null` se não
   * foi possível (aviso já mostrado).
   */
  addPrazo(input: NewPrazoInput, options: { createTask: boolean }): Promise<Prazo | null>
  /** Cumpre ou marca como perdido um prazo aberto, registrando nas timelines do processo e do cliente. */
  setPrazoStatus(id: string, status: "cumprido" | "perdido", options?: SaveOptions): Promise<SaveResult<Prazo>>
  updateTask(id: string, patch: Partial<Task>, options?: SaveOptions): Promise<SaveResult<Task>>
  deleteTask(id: string): void
  /** Move a tarefa para outra coluna do quadro, sincronizando o status de conclusão. */
  moveTask(taskId: string, columnId: string): Task | undefined
  addTaskColumn(input: TaskColumnInput): TaskColumn
  /** Colunas iniciais do quadro, com id fixo: duas pessoas abrindo o quadro vazio não duplicam. */
  ensureDefaultTaskColumns(columns: TaskColumnInput[]): Promise<void>
  updateTaskColumn(id: string, patch: Partial<TaskColumnInput>, options?: SaveOptions): Promise<SaveResult<TaskColumn>>
  /** Exclui a coluna (nunca a última); as tarefas dela vão para a coluna restante mais à esquerda. */
  deleteTaskColumn(id: string): void
  addAppointment(input: NewAppointmentInput): Appointment
  /** Edita ou remarca (arrastar na agenda) e registra na timeline quem fez e o que mudou. */
  updateAppointment(id: string, patch: Partial<NewAppointmentInput>, options?: SaveOptions): Promise<SaveResult<Appointment>>
  deleteAppointment(id: string): void
  addAppointmentCategory(input: AppointmentCategoryInput): AppointmentCategory
  updateAppointmentCategory(id: string, patch: Partial<AppointmentCategoryInput>, options?: SaveOptions): Promise<SaveResult<AppointmentCategory>>
  /** Exclui a categoria; os compromissos dela ficam sem categoria. */
  deleteAppointmentCategory(id: string): void
  addDocument(input: NewDocumentInput): LegalDocument
  /** Nome, tipo e vínculos (cliente/processo) do documento. O arquivo não muda. */
  updateDocument(
    id: string,
    patch: Partial<Pick<LegalDocument, "name" | "kind" | "clientId" | "processId">>,
    options?: SaveOptions,
  ): Promise<SaveResult<LegalDocument>>
  deleteDocument(id: string): void
  /** Lançamento de honorários (fatura) do módulo financeiro, sempre de um cliente. */
  addInvoice(input: NewInvoiceInput): Invoice
  markInvoicePaid(id: string, paidAt: string, method?: Invoice["method"]): void
  /** Edita o lançamento (valores, datas, situação — inclusive a baixa) e registra na timeline do cliente. */
  updateInvoice(id: string, patch: Partial<NewInvoiceInput>, options?: SaveOptions): Promise<SaveResult<Invoice>>
  deleteInvoice(id: string): void
  markNotificationRead(id: string): void
  markAllNotificationsRead(): void
}

const DataContext = React.createContext<DemoState | null>(null)
const ActionsContext = React.createContext<DemoActions | null>(null)

const nowISO = () => toLocalISO(getNow())

const base = () => ({ organizationId: account.currentOrgId(), createdAt: nowISO() })

/**
 * Primeira carga dos dados, iniciada antes de a sessão terminar de carregar
 * (`SessionProvider`). O store usa esta promessa em vez de abrir outra.
 */
let preloaded: Promise<Snapshot> | null = null

export function preloadOfficeData() {
  preloaded ??= loadState(getSupabase())
  // Evita "unhandled rejection" se ninguém chegar a consumir (ex.: sem acesso).
  preloaded.catch(() => {})
}

/** A carga antecipada, ou uma nova. Continua disponível até alguém aplicá-la (StrictMode monta duas vezes). */
function initialLoad() {
  preloaded ??= loadState(getSupabase())
  return preloaded
}
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

/** Coleções em que o banco exige CPF/CNPJ do cliente vinculado (`0010_contacts.sql`). */
const NEEDS_CLIENT_DOCUMENT: Collection[] = ["processes", "invoices", "documents"]
const CLIENT_DOCUMENT_MESSAGE = "O cliente ainda não tem CPF/CNPJ. Complete o cadastro para vincular processo, contrato ou fatura."

/** Uma mensagem por situação (o `id` evita empilhar o mesmo aviso). */
function showNotice(notice: SyncNotice) {
  switch (notice.kind) {
    case "stale":
      toast.error(notice.removed ? "Este registro foi excluído por outra pessoa." : "Este registro foi alterado por outra pessoa.", {
        id: "record-conflict",
        description: notice.removed ? "Sua alteração não foi gravada." : "Sua alteração não foi gravada. Os dados atuais foram carregados novamente.",
      })
      return
    case "insert-failed":
      toast.error(
        notice.error === "denied"
          ? `Você não tem permissão para alterar ${COLLECTION_LABELS[notice.key]}.`
          : notice.error === "conflict" && NEEDS_CLIENT_DOCUMENT.includes(notice.key)
            ? CLIENT_DOCUMENT_MESSAGE
            : "Não foi possível salvar. Tente de novo em instantes.",
        { id: "insert-failed" },
      )
      return
    case "write-failed": {
      const { result } = notice
      toast.error(
        result.denied.length
          ? `Você não tem permissão para alterar ${result.denied.map((key) => COLLECTION_LABELS[key]).join(", ")}.`
          : result.conflicts.includes("clients")
            ? "O banco recusou o CPF/CNPJ: já existe no escritório, é inválido ou o cadastro tem processo, fatura ou contrato."
            : result.conflicts.some((key) => NEEDS_CLIENT_DOCUMENT.includes(key))
              ? CLIENT_DOCUMENT_MESSAGE
              : result.conflicts.length
                ? `O banco recusou alterações em ${result.conflicts.map((key) => COLLECTION_LABELS[key]).join(", ")}.`
                : "Não foi possível salvar as últimas alterações.",
        { description: "A tela foi atualizada com o que está salvo no escritório." },
      )
      return
    }
    case "realtime":
      if (notice.connected) toast.dismiss("realtime")
      else
        toast.warning("Sem atualização em tempo real no momento.", {
          id: "realtime",
          description: "Tentando reconectar. O que outras pessoas alterarem aparece assim que a conexão voltar.",
          duration: Infinity,
        })
      return
  }
}

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DemoState>(initialState)
  useSplashReady("app", state.hydrated || state.loadError)
  const stateRef = React.useRef(state)
  // Recarregar após falha (`retryLoad`); aponta para `load`, definido mais abaixo.
  const loadRef = React.useRef<() => void>(() => {})

  // Uma camada só para gravação, Realtime e revalidação, criada uma vez por montagem.
  const [sync] = React.useState(
    () =>
      new OfficeSync<DemoState>({
        supabase: getSupabase(),
        organizationId: account.currentOrgId(),
        state: stateRef,
        render: setState,
        notify: showNotice,
      }),
  )

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

    /**
     * Salva a edição de um registro vinda de um formulário: confere a versão que o
     * formulário abriu, aplica e espera o banco confirmar (nada de "salvo" antes disso).
     * `apply` devolve `false` quando não há o que gravar.
     */
    const save = async <T extends { id: string }>(collection: Collection, id: string, options: SaveOptions | undefined, apply: () => boolean) => {
      const refused = sync.checkBase<T>(collection, id, options?.baseVersion)
      if (refused) return refused
      if (!apply()) return { status: "saved" } as SaveResult<T>
      return sync.outcomeFor<T>(await sync.flush(), collection, id)
    }

    return {
      retryLoad() {
        loadRef.current()
      },

      versionOf(collection, id) {
        return sync.versionOf(collection, id)
      },

      addClient(input) {
        const at = nowISO()
        const client: Client = {
          ...base(),
          ...input,
          id: uid("c"),
          // Sem CPF/CNPJ, a pessoa entra como Contato (`resolveClientStatus`).
          status: resolveClientStatus(input.status ?? "novo", input.document),
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
              message: client.status === "contato" ? `${client.name} cadastrado como contato.` : `${client.name} cadastrado como cliente.`,
              clientId: client.id,
              actorUserId: account.currentUserId(),
              href: `/clientes/${client.id}`,
            }),
            ...s.activities,
          ],
        }))
        return client
      },

      async importClients(drafts) {
        const at = nowISO()
        const clients: Client[] = drafts.map((draft) => ({
          ...base(),
          ...draft,
          id: uid("c"),
          status: resolveClientStatus(draft.status, draft.document),
          clientSince: at.slice(0, 10),
          lastActivityAt: at,
          updatedAt: at,
        }))
        const { saved, failed } = await sync.insertMany("clients", clients)
        const index = new Map(clients.map((c, i) => [c.id, i]))
        const REASON = {
          conflict: "O banco recusou: CPF/CNPJ já cadastrado no escritório ou inválido.",
          denied: "Sem permissão para cadastrar clientes.",
          failed: "Falha de conexão ou do servidor. Tente importar esta linha de novo.",
        } as const
        if (saved.length) {
          commit((s) => ({
            ...s,
            activities: [
              logActivity({
                type: "client",
                actor: account.getUser(account.currentUserId()).name,
                message: `importou ${saved.length === 1 ? "1 cadastro" : `${saved.length} cadastros`} de uma planilha.`,
                detail: saved
                  .slice(0, 3)
                  .map((c) => c.name)
                  .join(", ")
                  .concat(saved.length > 3 ? ` e mais ${saved.length - 3}` : ""),
                actorUserId: account.currentUserId(),
                href: "/clientes",
              }),
              ...s.activities,
            ],
          }))
        }
        return { saved, failed: failed.map(({ item, error }) => ({ index: index.get(item.id)!, reason: REASON[error] })) }
      },

      updateClient(id, patch, options) {
        return save<Client>("clients", id, options, () => {
          const current = stateRef.current.clients.find((c) => c.id === id)
          if (!current) return false
          const changed = (Object.keys(patch) as (keyof Client)[]).filter((key) => !sameValue(current[key], patch[key]))
          if (!changed.length) return false
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
          return true
        })
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

      async addProcess(input) {
        const at = nowISO()
        const draft: Process = {
          ...base(),
          ...input,
          id: uid("p"),
          // O banco gera o código (`0007_process_code.sql`).
          code: "",
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
        const process = await sync.insertNow("processes", draft)
        if (!process) return null
        commit((s) => ({
          ...s,
          activities: [
            logActivity({
              type: "petition",
              message: `Processo ${process.code} cadastrado.`,
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

      updateProcess(id, patch, options) {
        return save<Process>("processes", id, options, () => {
          const current = stateRef.current.processes.find((p) => p.id === id)
          if (!current) return false
          const updated: Process = { ...current, ...patch }
          commit((s) => ({ ...s, processes: s.processes.map((p) => (p.id === id ? updated : p)) }))
          return true
        })
      },

      async importProcess(sheet, meta) {
        const at = nowISO()
        const draft = buildProcessDraft(sheet, meta, at)
        const process = await sync.insertNow<Process>("processes", {
          ...base(),
          ...draft,
          id: uid("p"),
          // O banco gera o código (`0007_process_code.sql`).
          code: "",
          movements: draft.movements.map((movement) => ({ ...movement, id: uid("m") })),
        })
        if (!process) return null

        commit((s) => ({
          ...s,
          activities: [
            logActivity({
              type: "petition",
              message: `Processo ${process.code} importado da consulta processual.`,
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

      applyProcessSync(processId, sheet, checkedAt) {
        const current = stateRef.current.processes.find((p) => p.id === processId)
        if (!current) return { added: 0 }

        const at = checkedAt ? toLocalISO(new Date(checkedAt)) : nowISO()
        const { process: updated, imported } = mergeProcessSheet(current, sheet, at, { newId: () => uid("m") })

        commit((s) => ({
          ...s,
          processes: s.processes.map((p) => (p.id === processId ? updated : p)),
          // Sincronização sem novidade não polui a timeline do escritório.
          activities: imported.length
            ? [
                logActivity({
                  type: "movement",
                  message: newMovementsMessage(imported.length, current.code),
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
          deadlines: s.deadlines.filter((d) => d.processId !== id),
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

      addTask(input, options) {
        const task: Task = { ...base(), ...input, id: uid("t"), status: "pendente" }
        const prazoId = options?.prazoId
        commit((s) => ({
          ...s,
          tasks: [task, ...s.tasks],
          deadlines: prazoId ? s.deadlines.map((d) => (d.id === prazoId ? { ...d, taskId: task.id, updatedAt: nowISO() } : d)) : s.deadlines,
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

      async addPrazo(input, { createTask }) {
        const s0 = stateRef.current
        const process = s0.processes.find((p) => p.id === input.processId)
        if (!process) return null
        const actor = account.getUser(account.currentUserId()).name
        const prazo: Prazo = {
          ...base(),
          ...input,
          description: input.description.trim(),
          internalDateReason: input.internalDateReason?.trim() || undefined,
          id: uid("pz"),
          clientId: process.clientId || undefined,
          status: "aberto",
          createdById: account.currentUserId(),
        }
        const task: Task | undefined = createTask
          ? {
              ...base(),
              id: uid("t"),
              title: prazo.description,
              description: `Prazo fatal em ${fmtNumericDate(prazo.fatalDate)}.`,
              dueAt: `${prazo.internalDate}T18:00:00`,
              priority: "alta",
              assigneeId: prazo.responsibleId,
              status: "pendente",
              related: { type: "process", id: process.id },
            }
          : undefined
        if (task) prazo.taskId = task.id

        commit((s) => ({
          ...s,
          tasks: task ? [task, ...s.tasks] : s.tasks,
          deadlines: [prazo, ...s.deadlines],
          activities: [
            logActivity({
              type: "deadline",
              actor,
              message: "cadastrou um prazo.",
              detail: `${prazo.description} · fatal em ${fmtNumericDate(prazo.fatalDate)} · Processo ${process.code}`,
              clientId: prazo.clientId,
              processId: process.id,
              actorUserId: account.currentUserId(),
              href: `/processos/${process.id}`,
            }),
            ...s.activities,
          ],
        }))
        const outcome = sync.outcomeFor<Prazo>(await sync.flush(), "deadlines", prazo.id)
        if (outcome.status !== "saved") return null
        return stateRef.current.deadlines.find((d) => d.id === prazo.id) ?? prazo
      },

      setPrazoStatus(id, status, options) {
        return save<Prazo>("deadlines", id, options, () => {
          const current = stateRef.current.deadlines.find((d) => d.id === id)
          if (!current || current.status !== "aberto") return false
          const at = nowISO()
          const updated: Prazo = { ...current, status, updatedAt: at, closedAt: at, closedById: account.currentUserId() }
          const process = stateRef.current.processes.find((p) => p.id === current.processId)
          commit((s) => ({
            ...s,
            deadlines: s.deadlines.map((d) => (d.id === id ? updated : d)),
            activities: [
              logActivity({
                type: "deadline",
                actor: account.getUser(account.currentUserId()).name,
                message: status === "cumprido" ? "cumpriu um prazo." : "marcou um prazo como perdido.",
                detail: [current.description, `fatal em ${fmtNumericDate(current.fatalDate)}`, process && `Processo ${process.code}`]
                  .filter(Boolean)
                  .join(" · "),
                clientId: current.clientId ?? process?.clientId,
                processId: current.processId,
                actorUserId: account.currentUserId(),
                href: `/processos/${current.processId}`,
              }),
              ...s.activities,
            ],
          }))
          return true
        })
      },

      updateTask(id, patch, options) {
        return save<Task>("tasks", id, options, () => {
          if (!stateRef.current.tasks.some((t) => t.id === id)) return false
          commit((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
          return true
        })
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

      ensureDefaultTaskColumns(columns) {
        return sync.ensure<TaskColumn>(
          "taskColumns",
          columns.map((input, order) => ({
            ...base(),
            id: `col_padrao_${order}`,
            name: input.name.trim(),
            color: input.color,
            order,
            isDone: input.isDone,
          })),
        )
      },

      updateTaskColumn(id, patch, options) {
        return save<TaskColumn>("taskColumns", id, options, () => {
          if (!stateRef.current.taskColumns.some((c) => c.id === id)) return false
          const name = patch.name?.trim()
          commit((s) => ({
            ...s,
            taskColumns: s.taskColumns.map((c) =>
              c.id === id ? { ...c, ...(name ? { name } : {}), ...(patch.color ? { color: patch.color } : {}) } : c,
            ),
          }))
          return true
        })
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

      updateAppointment(id, patch, options) {
        return save<Appointment>("appointments", id, options, () => {
          const current = stateRef.current.appointments.find((a) => a.id === id)
          if (!current) return false
          const updated: Appointment = { ...current, ...patch }
          const change = describeAppointmentChange(current, updated)
          if (!change.rescheduled && !change.fields.length) return false
          const actor = account.getUser(account.currentUserId()).name
          const entry = (message: string, detail: string) =>
            logActivity({
              type: "appointment",
              actor,
              message,
              detail,
              clientId: clientOfItem(stateRef.current, updated),
              processId: updated.processId,
              actorUserId: account.currentUserId(),
              href: "/agenda",
            })
          const log: Activity[] = []
          if (change.rescheduled) log.push(entry(change.rescheduleText, updated.title))
          if (change.fields.length) log.push(entry("atualizou o compromisso.", `${updated.title} · Alterado: ${change.fields.join(", ")}`))
          commit((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? updated : a)), activities: [...log, ...s.activities] }))
          return true
        })
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

      updateAppointmentCategory(id, patch, options) {
        return save<AppointmentCategory>("appointmentCategories", id, options, () => {
          if (!stateRef.current.appointmentCategories.some((c) => c.id === id)) return false
          const name = patch.name?.trim()
          commit((s) => ({
            ...s,
            appointmentCategories: s.appointmentCategories.map((c) =>
              c.id === id ? { ...c, ...(name ? { name } : {}), ...(patch.color ? { color: patch.color } : {}) } : c,
            ),
          }))
          return true
        })
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

      updateDocument(id, patch, options) {
        return save<LegalDocument>("documents", id, options, () => {
          const current = stateRef.current.documents.find((d) => d.id === id)
          if (!current) return false
          const updated: LegalDocument = { ...current, ...patch }
          const labels: [keyof LegalDocument, string][] = [
            ["name", "nome"],
            ["kind", "tipo"],
            ["clientId", "cliente"],
            ["processId", "processo"],
          ]
          const changed = labels.filter(([key]) => !sameValue(current[key], updated[key])).map(([, label]) => label)
          if (!changed.length) return false
          commit((s) => ({
            ...s,
            documents: s.documents.map((d) => (d.id === id ? updated : d)),
            activities: [
              logActivity({
                type: "document",
                actor: account.getUser(account.currentUserId()).name,
                message: "atualizou um documento.",
                detail: `${updated.name} · Alterado: ${changed.join(", ")}${updated.name !== current.name ? ` · Antes: ${current.name}` : ""}`,
                clientId: clientOfItem(s, updated),
                processId: updated.processId,
                actorUserId: account.currentUserId(),
                href: clientOfItem(s, updated) ? `/clientes/${clientOfItem(s, updated)}?tab=documentos` : "/documentos",
              }),
              ...s.activities,
            ],
          }))
          return true
        })
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

      updateInvoice(id, patch, options) {
        return save<Invoice>("invoices", id, options, () => {
          const current = stateRef.current.invoices.find((i) => i.id === id)
          if (!current) return false
          const updated: Invoice = { ...current, ...patch }
          // Só lançamento pago tem data de pagamento.
          if (updated.status !== "pago") delete updated.paidAt
          const change = describeInvoiceChange(current, updated)
          if (!change.changed) return false
          commit((s) => ({
            ...s,
            invoices: s.invoices.map((i) => (i.id === id ? updated : i)),
            activities: [
              logActivity({
                type: "payment",
                actor: account.getUser(account.currentUserId()).name,
                message: change.message,
                detail: change.detail,
                clientId: updated.clientId,
                processId: updated.processId,
                actorUserId: account.currentUserId(),
                href: `/clientes/${updated.clientId}?tab=financeiro`,
              }),
              ...s.activities,
            ],
          }))
          return true
        })
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
  }, [sync])

  // Carrega o que a RLS deixa esta pessoa ver. Uma vez por sessão (ou de novo, após falha).
  const cancelledRef = React.useRef(false)
  const load = React.useCallback(() => {
    if (stateRef.current.loadError) {
      stateRef.current = { ...stateRef.current, loadError: false }
      setState(stateRef.current)
    }
    // A primeira carga reaproveita a que começou junto com a sessão; novas tentativas buscam de novo.
    initialLoad()
      .then((snapshot) => {
        if (cancelledRef.current) return
        preloaded = null
        // O que foi criado antes de terminar de carregar entra junto (e é gravado a seguir).
        const current = stateRef.current
        const next = { hydrated: true, loadError: false } as DemoState
        for (const key of Object.keys(snapshot.state) as (keyof PersistedState)[]) {
          ;(next as unknown as Record<string, unknown>)[key] = mergeById<{ id: string }>(current[key], snapshot.state[key])
        }
        stateRef.current = next
        sync.hydrate(snapshot)
        setState(next)
      })
      .catch((error) => {
        console.error(error)
        if (cancelledRef.current) return
        preloaded = null
        stateRef.current = { ...stateRef.current, loadError: true }
        setState(stateRef.current)
        toast.error("Não foi possível carregar os dados do escritório.", { description: "Verifique a conexão e tente de novo." })
      })
  }, [sync])
  React.useEffect(() => {
    loadRef.current = load
    cancelledRef.current = false
    load()
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  // Tempo real: uma assinatura por montagem do store, removida ao desmontar.
  React.useEffect(() => sync.subscribe(), [sync])

  // Gravação agrupada: várias mudanças seguidas viram uma ida ao banco.
  React.useEffect(() => {
    if (!state.hydrated) return
    const timer = window.setTimeout(() => void sync.flush(), 300)
    return () => window.clearTimeout(timer)
  }, [state, sync])

  // Ao sair ou trocar de aba, grava na hora. Ao voltar depois de alguns minutos (ou
  // se o tempo real caiu no meio), confere com o banco o que mudou enquanto isso.
  React.useEffect(() => {
    let hiddenAt: number | null = null
    const flush = () => void sync.flush()
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt ??= Date.now()
        flush()
        return
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt
      hiddenAt = null
      if (away >= REVALIDATE_AFTER_HIDDEN_MS || !sync.realtimeConnected) void sync.revalidate()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [sync])

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
