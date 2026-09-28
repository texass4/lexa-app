/**
 * Cliente HTTP da API pública do DataJud, em TypeScript (substitui o antigo
 * `python/datajud.py`). Roda somente no servidor: a chave vem de
 * `DATAJUD_API_KEY` e nunca vai para o navegador.
 *
 * Política de rede:
 * - Tempo máximo por tentativa e prazo total para a consulta inteira — uma
 *   fonte lenta nunca deixa a tela carregando indefinidamente.
 * - Poucas tentativas (3), só para falhas passageiras: timeout, conexão,
 *   HTTP 408/429/5xx e resposta parcial. Espera com backoff exponencial +
 *   jitter, respeitando `Retry-After` no 429, sempre dentro do prazo total.
 * - Sob carga, o Elasticsearch da fonte responde 200 com shards falhos e sem
 *   resultados. Isso é falha passageira, não "processo não encontrado".
 */

import { LookupError } from "../errors"
import type { DataJudSearchResponse } from "./mapper"

const BASE_URL = "https://api-publica.datajud.cnj.jus.br"

export interface DataJudClientOptions {
  apiKey: string
  /** Outro endereço para a API (proxy corporativo, homologação). */
  baseUrl?: string
  /** Tempo máximo de uma tentativa. O índice do TRF1 leva 30 s em horário de pico. */
  attemptTimeoutMs?: number
  /** Prazo da consulta inteira, somando tentativas e esperas. */
  deadlineMs?: number
  maxAttempts?: number
  /** Teto da espera entre tentativas. */
  maxWaitMs?: number
  /** Injetáveis para teste. */
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
  log?: (event: string, fields: Record<string, unknown>) => void
}

const DEFAULTS = {
  attemptTimeoutMs: 35_000,
  deadlineMs: 60_000,
  maxAttempts: 3,
  maxWaitMs: 8_000,
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Segundos ou data HTTP → milissegundos. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

/** Nenhum hit, mas a busca não cobriu o índice inteiro: o vazio não é conclusivo. */
export function isIncompleteMiss(data: DataJudSearchResponse): boolean {
  if (data?.hits?.hits?.length) return false
  return !!data?.timed_out || (data?._shards?.failed ?? 0) > 0
}

interface Attempt {
  /** Falha desta tentativa. */
  error: LookupError
  /** Pode tentar de novo? */
  retry: boolean
  /** Espera sugerida pela fonte (Retry-After). */
  hintMs?: number
}

export function createDataJudClient(options: DataJudClientOptions) {
  // `??` e não spread: uma opção `undefined` (ex.: variável de ambiente ausente) mantém o padrão.
  const config = {
    apiKey: options.apiKey,
    attemptTimeoutMs: options.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs,
    deadlineMs: options.deadlineMs ?? DEFAULTS.deadlineMs,
    maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
    maxWaitMs: options.maxWaitMs ?? DEFAULTS.maxWaitMs,
  }
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const log = options.log ?? (() => {})

  const backoff = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), config.maxWaitMs) + random() * 400

  async function attemptOnce(url: string, body: string, timeoutMs: number, attempt: number): Promise<DataJudSearchResponse | Attempt> {
    const started = now()
    let response: Response
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: {
          Authorization: `APIKey ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "LEXA/1.0",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      log("network_error", { attempt, reason: timedOut ? "timeout" : "connection", ms: now() - started })
      return timedOut
        ? { error: new LookupError("TIMEOUT", `sem resposta em ${timeoutMs} ms`), retry: true }
        : { error: new LookupError("UNAVAILABLE", `falha de conexão: ${(error as Error)?.message ?? error}`), retry: true }
    }

    const { status } = response
    log("response", { attempt, status, ms: now() - started })

    if (status === 200) {
      let data: DataJudSearchResponse
      try {
        data = (await response.json()) as DataJudSearchResponse
      } catch {
        return { error: new LookupError("UNAVAILABLE", "HTTP 200 com corpo que não é JSON"), retry: true }
      }
      if (!isIncompleteMiss(data)) return data
      log("partial", { attempt, failed: data._shards?.failed ?? 0, total: data._shards?.total, timedOut: !!data.timed_out })
      return { error: new LookupError("UNAVAILABLE", "resposta parcial (shards falhos)"), retry: true }
    }

    // Libera a conexão; o corpo de erro não interessa além do log.
    const text = await response.text().catch(() => "")

    if (status === 401 || status === 403) return { error: new LookupError("AUTHENTICATION", `HTTP ${status}`), retry: false }
    if (status === 429) {
      return { error: new LookupError("RATE_LIMIT", "HTTP 429"), retry: true, hintMs: parseRetryAfter(response.headers.get("retry-after"), now()) }
    }
    if (status === 408 || status === 504) return { error: new LookupError("TIMEOUT", `HTTP ${status}`), retry: true }
    if (status >= 500) return { error: new LookupError("UNAVAILABLE", `HTTP ${status}`), retry: true }
    return { error: new LookupError("UNAVAILABLE", `HTTP ${status} não recuperável: ${text.slice(0, 200)}`), retry: false }
  }

  /**
   * Busca por número CNJ no índice do tribunal. Devolve a resposta bruta da
   * fonte — quem a traduz é o `mapper.ts`.
   */
  async function searchByNumber(digits: string, dataset: string): Promise<DataJudSearchResponse> {
    const url = `${(options.baseUrl || BASE_URL).replace(/\/$/, "")}/${dataset}/_search`
    const body = JSON.stringify({ size: 10, query: { match: { numeroProcesso: digits } } })
    const deadline = now() + config.deadlineMs
    let last: LookupError = new LookupError("UNAVAILABLE", "nenhuma tentativa concluída")

    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      const remaining = deadline - now()
      if (remaining <= 1000) break

      const outcome = await attemptOnce(url, body, Math.min(config.attemptTimeoutMs, remaining), attempt)
      if (!("error" in outcome)) return outcome

      last = outcome.error
      if (!outcome.retry || attempt === config.maxAttempts) break

      const wait = Math.min(outcome.hintMs ?? backoff(attempt), config.maxWaitMs) + random() * 250
      // Não vale esperar se não sobra tempo para outra tentativa útil.
      if (now() + wait + 2000 > deadline) break
      log("retry", { attempt, waitMs: Math.round(wait), code: last.code })
      await sleep(wait)
    }

    throw last
  }

  return { searchByNumber }
}

export type DataJudClient = ReturnType<typeof createDataJudClient>
