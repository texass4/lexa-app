/**
 * Acesso do browser às rotas de processo.
 *
 * Os componentes usam estas funções e recebem ou a ficha, ou uma mensagem
 * pronta para exibir. Nenhuma tela precisa saber que existe DataJud, HTTP 429
 * ou índice de tribunal.
 */

import type { ProviderName } from "@/lib/integrations/legal/types"
import type { ProcessSheet } from "./sheet"
import type { LookupEvent, LookupLine } from "./lookup-events"

export interface LookupSuccess {
  ok: true
  sheet: ProcessSheet
  provider: ProviderName
  cached: boolean
  fetchedAt: string
}

export interface LookupFailure {
  ok: false
  code: string
  /** Texto pronto para a interface, em português. */
  message: string
  /** Detalhe técnico da fonte, quando houver. */
  detail?: string
}

export type LookupResponse = LookupSuccess | LookupFailure

const GENERIC: LookupFailure = {
  ok: false,
  code: "UNEXPECTED",
  message: "Não conseguimos consultar o processo agora. Tente novamente em alguns instantes.",
}

async function post(url: string, body: unknown): Promise<LookupResponse> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, code: "OFFLINE", message: "Sem conexão para consultar o processo. Verifique sua internet." }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return GENERIC
  }

  const data = payload as {
    sheet?: ProcessSheet | null
    found?: boolean
    provider?: ProviderName
    cached?: boolean
    fetchedAt?: string
    error?: { code?: string; message?: string }
  }

  if (!response.ok) {
    return data.error?.message ? { ok: false, code: data.error.code ?? "UNEXPECTED", message: data.error.message } : GENERIC
  }

  if (data.found === false || !data.sheet) {
    return data.error?.message
      ? { ok: false, code: data.error.code ?? "NOT_FOUND", message: data.error.message }
      : { ok: false, code: "NOT_FOUND", message: "Não foi possível localizar esse processo na fonte consultada. Verifique o número CNJ e tente novamente." }
  }

  return {
    ok: true,
    sheet: data.sheet,
    provider: data.provider ?? "datajud",
    cached: !!data.cached,
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
  }
}

/**
 * Consulta por CNJ com acompanhamento em tempo real.
 *
 * A rota responde NDJSON (ver `lookup-events.ts`): cada evento do script
 * — tentativa, HTTP 429, resposta parcial, timeout — chega em `onEvent`
 * enquanto a consulta ainda está rodando.
 */
export async function searchProcessByCNJ(
  cnj: string,
  onEvent?: (event: LookupEvent) => void,
  signal?: AbortSignal,
): Promise<LookupResponse> {
  let response: Response
  try {
    response = await fetch("/api/processes/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnj }),
      signal,
    })
  } catch {
    if (signal?.aborted) return { ok: false, code: "ABORTED", message: "Consulta cancelada." }
    return { ok: false, code: "OFFLINE", message: "Sem conexão para consultar o processo. Verifique sua internet." }
  }

  // Erros de validação voltam como JSON comum, antes de o stream começar.
  if (!response.ok || !response.body) {
    try {
      const data = (await response.json()) as { error?: { code?: string; message?: string } }
      if (data.error?.message) return { ok: false, code: data.error.code ?? "UNEXPECTED", message: data.error.message }
    } catch {}
    return GENERIC
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let outcome: LookupResponse | null = null

  const handle = (raw: string) => {
    if (!raw.trim()) return
    let line: LookupLine
    try {
      line = JSON.parse(raw) as LookupLine
    } catch {
      return
    }
    if (line.type === "event") onEvent?.(line)
    else if (line.type === "error") outcome = { ok: false, code: line.code, message: line.message, detail: line.detail }
    else if (line.found && line.sheet) {
      outcome = { ok: true, sheet: line.sheet, provider: line.sheet.source.provider, cached: line.cached, fetchedAt: line.fetchedAt }
    } else {
      outcome = {
        ok: false,
        code: "NOT_FOUND",
        message: "Não foi possível localizar esse processo na fonte consultada. Verifique o número CNJ e tente novamente.",
      }
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let newline: number
      while ((newline = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
    }
    handle(buffer)
  } catch {
    if (signal?.aborted) return { ok: false, code: "ABORTED", message: "Consulta cancelada." }
    return { ok: false, code: "OFFLINE", message: "A conexão com o servidor caiu durante a consulta." }
  }

  return outcome ?? GENERIC
}

export const syncProcessById = (processId: string, cnj: string) => post(`/api/processes/${processId}/sync`, { cnj })
