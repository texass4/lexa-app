/**
 * Cliente HTTP da API pública de Comunicações Processuais do CNJ (DJEN —
 * `comunicaapi.pje.jus.br`). Somente servidor.
 *
 * O que se sabe da fonte (documentação Swagger do CNJ + relatos de integradores):
 * - sem autenticação; limite por IP (cabeçalhos `x-ratelimit-*`); em 429, esperar
 *   ~1 minuto (ou o `Retry-After`);
 * - paginação `pagina` + `itensPorPagina` (usamos 100) e no máximo 10.000 resultados
 *   por busca — a janela por OAB é curta (poucos dias), bem abaixo disso;
 * - bloqueia acesso de fora do Brasil (HTTP 403 via CloudFront): o servidor precisa
 *   rodar em região brasileira.
 *
 * Política de rede igual à do DataJud (Etapa 5): tempo máximo por tentativa, poucas
 * tentativas só para falhas passageiras, backoff exponencial, `Retry-After` nunca
 * antecipado, pausa entre páginas. Erros saem como `LookupError` com `status` e
 * `retryAfterMs`, que a política do monitoramento entende.
 */

import { LookupError } from "../errors"
import { parseRetryAfter } from "../datajud/client"

const BASE_URL = "https://comunicaapi.pje.jus.br/api/v1"
const PAGE_SIZE = 100
/** Teto de páginas por consulta (10.000 resultados, o limite da fonte). */
const MAX_PAGES = 100
/** Sem `Retry-After`, a orientação da fonte é esperar 1 minuto depois de um 429. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000

/** Item como a fonte devolve (só os campos que usamos; o objeto inteiro é guardado em `raw`). */
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
  meio?: string
  meiocompleto?: string
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

export interface DjenQuery {
  numeroOab: string
  ufOab: string
  /** `YYYY-MM-DD` */
  from: string
  /** `YYYY-MM-DD` */
  to: string
}

export interface DjenClientOptions {
  baseUrl?: string
  attemptTimeoutMs?: number
  maxAttempts?: number
  maxWaitMs?: number
  /** Pausa entre páginas da mesma consulta. */
  pageDelayMs?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (event: string, fields: Record<string, unknown>) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createDjenClient(options: DjenClientOptions = {}) {
  const config = {
    baseUrl: (options.baseUrl || BASE_URL).replace(/\/$/, ""),
    attemptTimeoutMs: options.attemptTimeoutMs ?? 25_000,
    maxAttempts: options.maxAttempts ?? 3,
    maxWaitMs: options.maxWaitMs ?? 8_000,
    pageDelayMs: options.pageDelayMs ?? 1_000,
  }
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})

  async function getPage(query: DjenQuery, page: number): Promise<DjenPage> {
    const params = new URLSearchParams({
      numeroOab: query.numeroOab,
      ufOab: query.ufOab,
      dataDisponibilizacaoInicio: query.from,
      dataDisponibilizacaoFim: query.to,
      pagina: String(page),
      itensPorPagina: String(PAGE_SIZE),
    })
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
      log("response", { attempt, status, page, ms: now() - started, remaining: response.headers.get("x-ratelimit-remaining") })
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
      if (status === 429) {
        // Limite da fonte: não insiste — quem chama pausa a execução pelo tempo pedido.
        throw new LookupError("RATE_LIMIT", "HTTP 429", { status, retryAfterMs: hint ?? DEFAULT_RATE_LIMIT_WAIT_MS })
      }
      // 403: a fonte recusa o acesso (ex.: servidor fora do Brasil). Não adianta repetir.
      if (status === 401 || status === 403) throw new LookupError("AUTHENTICATION", `HTTP ${status} — acesso recusado pela fonte`, { status })
      // Parâmetros recusados: problema da integração (ex.: formato de data mudou), não da OAB — para a execução.
      if (status === 400 || status === 422) throw new LookupError("NOT_CONFIGURED", `HTTP ${status} — consulta recusada (parâmetros)`, { status })
      last = new LookupError(status === 408 || status === 504 ? "TIMEOUT" : "UNAVAILABLE", `HTTP ${status}`, { status, retryAfterMs: hint })
      if (attempt === config.maxAttempts || (hint !== undefined && hint > config.maxWaitMs)) break
      await sleep(hint ?? Math.min(1000 * 2 ** (attempt - 1), config.maxWaitMs))
    }
    throw last
  }

  /**
   * Todas as comunicações de uma OAB numa janela de disponibilização, página a página.
   * Resposta incompleta (itens faltando para o `count`) é erro — a janela não é dada
   * como lida.
   */
  async function listByOab(query: DjenQuery): Promise<DjenItem[]> {
    const items: DjenItem[] = []
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (page > 1) await sleep(config.pageDelayMs)
      const data = await getPage(query, page)
      const batch = data.items ?? []
      items.push(...batch)
      const total = data.count ?? items.length
      if (items.length >= total) return items
      if (!batch.length) throw new LookupError("UNAVAILABLE", `resposta incompleta: ${items.length} de ${total}`)
    }
    throw new LookupError("UNAVAILABLE", "mais de 10.000 comunicações na janela — reduza o período")
  }

  return { listByOab }
}

export type DjenClient = ReturnType<typeof createDjenClient>
