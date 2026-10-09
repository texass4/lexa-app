/**
 * Cliente HTTP da API pública de Comunicações Processuais do CNJ (DJEN —
 * `comunicaapi.pje.jus.br`), consulta POR NÚMERO DE PROCESSO. Somente servidor.
 *
 * O que se sabe da fonte (Swagger público do CNJ):
 * - sem autenticação; limite por IP (cabeçalhos `x-ratelimit-*`); em 429, esperar o
 *   `Retry-After` (ou ~1 minuto);
 * - paginação `pagina` + `itensPorPagina` (até 100);
 * - bloqueia acesso de fora do Brasil (HTTP 403): o servidor precisa rodar no Brasil;
 * - o CNJ não publica termos de uso comercial da API: a consulta fica DESLIGADA por
 *   padrão (`DJEN_CONSULTA_ENABLED`) até o escritório confirmar com o CNJ.
 *
 * Só publicações oficiais (o que o Diário de Justiça Eletrônico Nacional tornou
 * público) — nada de autos, nada atrás de login ou CAPTCHA.
 *
 * Política de rede igual à do DataJud: tempo máximo por tentativa, poucas tentativas
 * só para falhas passageiras, backoff exponencial, `Retry-After` nunca antecipado.
 */

import { LookupError } from "../errors"
import { parseRetryAfter } from "../datajud/client"

const BASE_URL = "https://comunicaapi.pje.jus.br/api/v1"
const PAGE_SIZE = 100
/** Sem `Retry-After`, a orientação da fonte é esperar 1 minuto depois de um 429. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000

/** Item como a fonte devolve (só os campos usados). */
export interface DjenItem {
  id: number | string
  hash?: string
  data_disponibilizacao?: string
  datadisponibilizacao?: string
  siglaTribunal?: string
  tipoComunicacao?: string
  nomeOrgao?: string
  texto?: string
  numero_processo?: string
  numeroprocessocommascara?: string
  tipoDocumento?: string
  nomeClasse?: string
  link?: string
  ativo?: boolean
  status?: string
  destinatarios?: { nome?: string; polo?: string }[]
  destinatarioadvogados?: { advogado?: { nome?: string; numero_oab?: string | number; uf_oab?: string } }[]
}

export interface DjenPage {
  status?: string
  message?: string
  count?: number
  items?: DjenItem[]
}

export interface DjenClientOptions {
  baseUrl?: string
  attemptTimeoutMs?: number
  maxAttempts?: number
  maxWaitMs?: number
  /** Páginas lidas por processo (100 comunicações cada). */
  maxPages?: number
  pageDelayMs?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (event: string, fields: Record<string, unknown>) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface DjenProcessResult {
  items: DjenItem[]
  /** Total informado pela fonte (pode passar do que foi lido). */
  total: number
}

export function createDjenClient(options: DjenClientOptions = {}) {
  const config = {
    baseUrl: (options.baseUrl || BASE_URL).replace(/\/$/, ""),
    attemptTimeoutMs: options.attemptTimeoutMs ?? 20_000,
    maxAttempts: options.maxAttempts ?? 3,
    maxWaitMs: options.maxWaitMs ?? 8_000,
    maxPages: options.maxPages ?? 2,
    pageDelayMs: options.pageDelayMs ?? 500,
  }
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})

  async function getPage(digits: string, page: number): Promise<DjenPage> {
    const params = new URLSearchParams({ numeroProcesso: digits, pagina: String(page), itensPorPagina: String(PAGE_SIZE) })
    const url = `${config.baseUrl}/comunicacao?${params}`
    let last = new LookupError("UNAVAILABLE", "nenhuma tentativa concluída")

    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      const started = now()
      let response: Response
      try {
        response = await doFetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Integra/1.0" },
          cache: "no-store",
          signal: AbortSignal.timeout(config.attemptTimeoutMs),
        })
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        log("network_error", { attempt, reason: timedOut ? "timeout" : "connection", ms: now() - started })
        last = new LookupError(timedOut ? "TIMEOUT" : "UNAVAILABLE", timedOut ? "sem resposta" : `falha de conexão: ${(error as Error)?.message}`)
        if (attempt < config.maxAttempts) await sleep(Math.min(1000 * 2 ** (attempt - 1), config.maxWaitMs))
        continue
      }

      const { status } = response
      log("response", { attempt, status, page, ms: now() - started })
      if (status === 200) {
        try {
          return (await response.json()) as DjenPage
        } catch {
          last = new LookupError("UNAVAILABLE", "HTTP 200 com corpo que não é JSON", { status })
          continue
        }
      }
      await response.text().catch(() => "")
      const hint = parseRetryAfter(response.headers.get("retry-after"), now())
      // Limite da fonte: não insiste.
      if (status === 429) throw new LookupError("RATE_LIMIT", "HTTP 429", { status, retryAfterMs: hint ?? DEFAULT_RATE_LIMIT_WAIT_MS })
      // 403: a fonte recusa o acesso (ex.: servidor fora do Brasil). Repetir não adianta.
      if (status === 401 || status === 403) throw new LookupError("AUTHENTICATION", `HTTP ${status} — acesso recusado pela fonte`, { status })
      if (status === 404) return { items: [], count: 0 }
      if (status === 400 || status === 422) throw new LookupError("NOT_CONFIGURED", `HTTP ${status} — consulta recusada (parâmetros)`, { status })
      last = new LookupError(status === 408 || status === 504 ? "TIMEOUT" : "UNAVAILABLE", `HTTP ${status}`, { status, retryAfterMs: hint })
      if (attempt === config.maxAttempts || (hint !== undefined && hint > config.maxWaitMs)) break
      await sleep(hint ?? Math.min(1000 * 2 ** (attempt - 1), config.maxWaitMs))
    }
    throw last
  }

  /** Comunicações publicadas para um processo (20 dígitos), até `maxPages` páginas. */
  async function searchByProcess(digits: string): Promise<DjenProcessResult> {
    const items: DjenItem[] = []
    let total = 0
    for (let page = 1; page <= config.maxPages; page += 1) {
      if (page > 1) await sleep(config.pageDelayMs)
      const data = await getPage(digits, page)
      const batch = data.items ?? []
      items.push(...batch)
      total = Math.max(data.count ?? 0, items.length)
      if (items.length >= total || !batch.length) break
    }
    return { items, total }
  }

  return { searchByProcess }
}

export type DjenClient = ReturnType<typeof createDjenClient>
