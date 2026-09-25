/**
 * Persistência dos dados do escritório no navegador (localStorage).
 *
 * É o degrau entre o store em memória e um banco de verdade: tudo o que o
 * escritório cadastra sobrevive ao reload, separado por organização. Quando a
 * persistência for para o servidor, só este arquivo muda.
 *
 * Cada operação é protegida: storage bloqueado, cheio ou com conteúdo
 * inválido nunca derruba a aplicação.
 */

import type {
  Activity,
  Appointment,
  AppointmentCategory,
  Client,
  Invoice,
  LegalDocument,
  Notification,
  Process,
  Task,
} from "@/types"

export interface PersistedState {
  clients: Client[]
  processes: Process[]
  tasks: Task[]
  appointments: Appointment[]
  appointmentCategories: AppointmentCategory[]
  documents: LegalDocument[]
  invoices: Invoice[]
  activities: Activity[]
  notifications: Notification[]
}

const KEYS: (keyof PersistedState)[] = [
  "clients",
  "processes",
  "tasks",
  "appointments",
  "appointmentCategories",
  "documents",
  "invoices",
  "activities",
  "notifications",
]

export const storageKey = (orgId: string) => `lexa:data:v1:${orgId}`

/** Chave antiga, de quando só os processos eram salvos. Lida uma vez, na migração. */
export const LEGACY_PROCESS_KEY = "lexa:processes:v1"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

const hasId = (value: unknown): value is { id: string } => !!value && typeof (value as { id?: unknown }).id === "string"

const looksLikeProcess = (value: unknown): value is Process =>
  hasId(value) && typeof (value as Partial<Process>).number === "string" && Array.isArray((value as Partial<Process>).movements)

function readJSON(storage: StorageLike, key: string): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Só as listas válidas; registros malformados são descartados. */
export function loadState(orgId: string, storage: StorageLike | null = browserStorage()): Partial<PersistedState> {
  if (!storage) return {}
  const data = readJSON(storage, storageKey(orgId))

  if (!data) {
    // Migração: antes só os processos eram salvos, numa chave própria.
    const legacy = readJSON(storage, LEGACY_PROCESS_KEY)
    const processes = Array.isArray(legacy?.processes) ? legacy.processes.filter(looksLikeProcess) : []
    return processes.length ? { processes } : {}
  }

  const state: Partial<PersistedState> = {}
  for (const key of KEYS) {
    const list = data[key]
    if (!Array.isArray(list)) continue
    // Cada lista tem seu tipo; a checagem estrutural mínima é o `id`.
    ;(state as Record<string, unknown[]>)[key] = key === "processes" ? list.filter(looksLikeProcess) : list.filter(hasId)
  }
  return state
}

export type SaveResult = "saved" | "saved-without-raw" | "failed"

/**
 * Grava tudo. Se o navegador recusar por falta de espaço, tenta de novo sem o
 * objeto original das movimentações (`raw`), que é o item mais pesado — os
 * dados normalizados continuam completos.
 */
export function saveState(orgId: string, state: PersistedState, storage: StorageLike | null = browserStorage()): SaveResult {
  if (!storage) return "failed"
  const write = (value: PersistedState) => storage.setItem(storageKey(orgId), JSON.stringify({ version: 1, ...value }))

  try {
    write(state)
    return "saved"
  } catch {}

  try {
    write({
      ...state,
      processes: state.processes.map((p) => ({ ...p, movements: p.movements.map((movement) => ({ ...movement, raw: undefined })) })),
    })
    return "saved-without-raw"
  } catch {
    return "failed"
  }
}
