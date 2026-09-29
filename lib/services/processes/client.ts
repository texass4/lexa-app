/**
 * Acesso do navegador às rotas de processo.
 *
 * Os componentes recebem a ficha (modelo interno da Íntegra) ou um motivo com
 * mensagem pronta para a tela. Nada aqui conhece a fonte externa, status HTTP
 * ou detalhes de erro — isso fica no servidor.
 */

import type { LookupFailureReason } from "@/lib/integrations/legal/errors"
import type { LookupBody } from "./lookup-contract"
import type { ProcessSheet } from "./sheet"

export interface LookupSuccess {
  ok: true
  sheet: ProcessSheet
  /** ISO (UTC) de quando as informações foram conferidas. */
  checkedAt: string
  /** O servidor ainda está buscando uma versão mais nova. */
  refreshing: boolean
}

export interface LookupFailure {
  ok: false
  reason: LookupFailureReason | "forbidden" | "disabled" | "offline" | "aborted"
  /** Texto pronto para a interface. */
  message: string
}

export type LookupResponse = LookupSuccess | LookupFailure

/** Rede de segurança do lado do navegador; o servidor já limita a consulta a ~60 s. */
const CLIENT_TIMEOUT_MS = 90_000

const UNAVAILABLE: LookupFailure = {
  ok: false,
  reason: "unavailable",
  message: "Não foi possível consultar o processo no momento. Tente novamente em alguns instantes.",
}

async function post(url: string, body: unknown, signal?: AbortSignal): Promise<LookupResponse> {
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch {
    if (signal?.aborted) return { ok: false, reason: "aborted", message: "Consulta cancelada." }
    if (timeout.aborted) return UNAVAILABLE
    return { ok: false, reason: "offline", message: "Sem conexão com a internet. Verifique sua conexão e tente novamente." }
  }

  let data: LookupBody
  try {
    data = (await response.json()) as LookupBody
  } catch {
    return UNAVAILABLE
  }

  if (data?.ok === true && data.sheet) return { ok: true, sheet: data.sheet, checkedAt: data.checkedAt, refreshing: !!data.refreshing }
  if (data?.ok === false && data.message) return { ok: false, reason: data.reason, message: data.message }
  return UNAVAILABLE
}

/** Consulta por CNJ ("Novo processo"). */
export const lookupProcess = (cnj: string, signal?: AbortSignal) => post("/api/processes/search", { cnj }, signal)

/**
 * Consultas de atualização em andamento, por processo. Abrir o mesmo processo
 * duas vezes (ou dois componentes pedindo juntos) reaproveita a mesma chamada.
 */
const refreshing = new Map<string, Promise<LookupResponse>>()

/**
 * Informações atualizadas de um processo salvo.
 * `force`: o usuário pediu ("Atualizar") — ignora o cache recente do escritório.
 */
export function refreshProcess(processId: string, cnj: string, { force = false }: { force?: boolean } = {}): Promise<LookupResponse> {
  const key = `${processId}:${force ? "force" : "auto"}`
  const running = refreshing.get(key) ?? refreshing.get(`${processId}:force`)
  if (running) return running
  const task = post(`/api/processes/${encodeURIComponent(processId)}/sync`, { cnj, force }).finally(() => refreshing.delete(key))
  refreshing.set(key, task)
  return task
}
