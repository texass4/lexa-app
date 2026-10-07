/**
 * Fonte oficial: STJ — Portal de Dados Abertos (CKAN), conjuntos "Espelhos de
 * acórdãos" de cada órgão julgador. Documentação e termos: `docs/JURISPRUDENCIA.md`.
 * Somente servidor.
 *
 * - Lista os arquivos pela API do CKAN (`package_show`) e baixa os JSON mensais.
 * - Política de rede igual à das outras fontes oficiais (DJEN, DataJud): tempo máximo
 *   por tentativa, poucas tentativas só para falhas passageiras, backoff exponencial,
 *   `Retry-After` respeitado, 429 encerra (quem chama pausa a execução).
 * - O download só segue URLs https do próprio portal (a lista vem da fonte: um link
 *   adulterado não faz o servidor buscar outro endereço) e tem tamanho máximo.
 */

import { parseRetryAfter } from "@/lib/integrations/legal/datajud/client"
import { JurisprudenceError } from "../errors"
import { cleanList, cleanText, contentHash, ementaSubject, fold, parseDate, pick, safeUrl } from "../normalization"
import type { JurisprudenceSource, NormalizedDecision, SourceFile } from "../types"

export const STJ_BASE_URL = "https://dadosabertos.web.stj.jus.br"
export const STJ_HOSTS = ["dadosabertos.web.stj.jus.br"] as const
export const STJ_LABEL = "STJ — Portal de Dados Abertos"

/** Conjuntos "Espelhos de acórdãos" (Corte Especial, Seções e Turmas). */
export const STJ_DEFAULT_DATASETS = [
  "espelhos-de-acordaos-corte-especial",
  "espelhos-de-acordaos-primeira-secao",
  "espelhos-de-acordaos-segunda-secao",
  "espelhos-de-acordaos-terceira-secao",
  "espelhos-de-acordaos-primeira-turma",
  "espelhos-de-acordaos-segunda-turma",
  "espelhos-de-acordaos-terceira-turma",
  "espelhos-de-acordaos-quarta-turma",
  "espelhos-de-acordaos-quinta-turma",
  "espelhos-de-acordaos-sexta-turma",
]

/** Área pelo órgão julgador — Regimento Interno do STJ (competência das Seções). */
const AREA_BY_COURT: Record<string, string> = {
  "PRIMEIRA TURMA": "Direito Público",
  "SEGUNDA TURMA": "Direito Público",
  "PRIMEIRA SECAO": "Direito Público",
  "TERCEIRA TURMA": "Direito Privado",
  "QUARTA TURMA": "Direito Privado",
  "SEGUNDA SECAO": "Direito Privado",
  "QUINTA TURMA": "Direito Penal",
  "SEXTA TURMA": "Direito Penal",
  "TERCEIRA SECAO": "Direito Penal",
}

export const stjArea = (court: string | null) => (court ? (AREA_BY_COURT[fold(court)] ?? null) : null)

/** Consulta oficial do processo no site do STJ, pelo número de registro. */
export function stjProcessUrl(registry: string | null) {
  const digits = registry?.replace(/\D/g, "")
  return digits && digits.length >= 8 ? `https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=${digits}` : null
}

/**
 * Um registro do espelho → decisão normalizada. Sem identificador, órgão julgador,
 * data do julgamento ou ementa, o registro é descartado (com o motivo) — nunca
 * completado.
 */
export function normalizeStjRecord(record: unknown, file: Pick<SourceFile, "dataset" | "resourceId" | "name" | "url">): NormalizedDecision | { skipped: string } {
  if (!record || typeof record !== "object" || Array.isArray(record)) return { skipped: "registro em formato inesperado" }
  const r = record as Record<string, unknown>
  const registry = cleanText(pick(r, "numeroRegistro", "numero_registro", "registro"), 40)
  const judgmentDate = parseDate(pick(r, "dataDecisao", "dataJulgamento", "data_decisao"))
  const sourceId = cleanText(pick(r, "id", "idDocumento", "documento"), 80)
  const externalId = sourceId ?? (registry && judgmentDate ? `${registry.replace(/\D/g, "")}-${judgmentDate}` : null)
  const ementa = cleanText(pick(r, "ementa", "textoEmenta"), 20000)
  const court = cleanText(pick(r, "nomeOrgaoJulgador", "orgaoJulgador", "orgao_julgador"), 200)

  if (!externalId) return { skipped: "sem identificador da decisão" }
  if (!ementa) return { skipped: `${externalId}: sem ementa` }
  if (!court) return { skipped: `${externalId}: sem órgão julgador` }
  if (!judgmentDate) return { skipped: `${externalId}: sem data de julgamento válida` }

  const publication = cleanText(pick(r, "dataPublicacao", "publicacao"), 300)
  const notes = [cleanText(r.notas, 4000), cleanText(r.informacoesComplementares, 4000)].filter(Boolean).join("\n\n") || null
  const decision: Omit<NormalizedDecision, "content_hash" | "raw_reference"> = {
    provider: "stj",
    tribunal: "STJ",
    external_id: externalId,
    process_number: cleanText(pick(r, "numeroProcesso", "processo"), 60),
    registry_number: registry,
    class_code: cleanText(pick(r, "siglaClasse", "classe"), 30),
    class_name: cleanText(pick(r, "descricaoClasse", "nomeClasse"), 200),
    court,
    rapporteur: cleanText(pick(r, "ministroRelator", "relator", "nomeRelator"), 200),
    judgment_date: judgmentDate,
    publication_date: parseDate(publication),
    publication,
    decision_type: cleanText(pick(r, "tipoDeDecisao", "tipoDecisao"), 80),
    subject: ementaSubject(ementa),
    ementa,
    decision_text: cleanText(pick(r, "decisao", "textoDecisao"), 60000),
    thesis: cleanText(pick(r, "teseJuridica", "tese"), 4000) ?? (cleanText(r.tema, 1000) ? `Tema: ${cleanText(r.tema, 1000)}` : null),
    keywords: cleanText(pick(r, "termosAuxiliares"), 4000),
    legislation: cleanList(pick(r, "referenciasLegislativas", "legislacao")),
    cited_precedents: cleanText(pick(r, "jurisprudenciaCitada"), 6000),
    notes,
    area: stjArea(court),
    degree: "Superior",
    source_url: stjProcessUrl(registry),
  }
  return {
    ...decision,
    raw_reference: {
      dataset: file.dataset,
      resource_id: file.resourceId,
      file: file.name,
      file_url: file.url,
      source_id: sourceId,
      registry_number: registry,
    },
    content_hash: contentHash(decision),
  }
}

/* ---------------------------------- HTTP ----------------------------------- */

export interface StjSourceOptions {
  baseUrl?: string
  datasets?: string[]
  attemptTimeoutMs?: number
  fileTimeoutMs?: number
  maxAttempts?: number
  maxWaitMs?: number
  maxFileBytes?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (event: string, fields: Record<string, unknown>) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000

interface CkanResource {
  id?: string
  name?: string
  url?: string
  format?: string
  last_modified?: string | null
  created?: string | null
}

export function createStjSource(options: StjSourceOptions = {}): JurisprudenceSource {
  const baseUrl = (options.baseUrl || STJ_BASE_URL).replace(/\/$/, "")
  const hosts = [...STJ_HOSTS, new URL(baseUrl).hostname]
  const config = {
    attemptTimeoutMs: options.attemptTimeoutMs ?? 30_000,
    fileTimeoutMs: options.fileTimeoutMs ?? 120_000,
    maxAttempts: options.maxAttempts ?? 3,
    maxWaitMs: options.maxWaitMs ?? 8_000,
    maxFileBytes: options.maxFileBytes ?? 80 * 1024 * 1024,
  }
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})
  // Homologação (`JURISPRUDENCIA_STJ_BASE_URL`) pode ser http local; produção é sempre https.
  const allowedUrl = (value: unknown) => {
    if (typeof value !== "string") return null
    if (baseUrl.startsWith("http://") && value.startsWith(`${baseUrl}/`)) return value
    return safeUrl(value, hosts)
  }

  /** GET com tentativas; devolve o corpo como texto (com limite de tamanho). */
  async function get(start: string, timeoutMs: number, maxBytes: number): Promise<string> {
    let last = new JurisprudenceError("UNAVAILABLE", "nenhuma tentativa concluída")
    let url = start
    let redirects = 0
    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      const started = now()
      let response: Response
      try {
        response = await doFetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Integra/1.0 (jurisprudencia; dados abertos)" },
          cache: "no-store",
          // Redirecionamento só dentro do portal oficial (conferido abaixo).
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        log("network_error", { attempt, reason: timedOut ? "timeout" : "connection", ms: now() - started })
        last = new JurisprudenceError(timedOut ? "TIMEOUT" : "UNAVAILABLE", timedOut ? "sem resposta" : `falha de conexão: ${(error as Error)?.message}`)
        if (attempt < config.maxAttempts) await sleep(Math.min(1000 * 2 ** (attempt - 1), config.maxWaitMs))
        continue
      }
      const { status } = response
      log("response", { attempt, status, ms: now() - started })
      if (status === 200) return readCapped(response, maxBytes)
      if (status >= 300 && status < 400) {
        await response.body?.cancel().catch(() => {})
        const next = allowedUrl(new URL(response.headers.get("location") ?? "", url).toString())
        if (!next || redirects >= 3) throw new JurisprudenceError("INVALID_DATA", `redirecionamento recusado (HTTP ${status})`, { status })
        url = next
        redirects += 1
        attempt -= 1
        continue
      }
      await response.text().catch(() => "")
      const hint = parseRetryAfter(response.headers.get("retry-after"), now())
      if (status === 429) throw new JurisprudenceError("RATE_LIMIT", "HTTP 429", { status, retryAfterMs: hint ?? DEFAULT_RATE_LIMIT_WAIT_MS })
      if (status === 404) throw new JurisprudenceError("NOT_FOUND", "HTTP 404", { status })
      if (status >= 400 && status < 500 && status !== 408) throw new JurisprudenceError("INVALID_DATA", `HTTP ${status} — pedido recusado pela fonte`, { status })
      last = new JurisprudenceError(status === 408 || status === 504 ? "TIMEOUT" : "UNAVAILABLE", `HTTP ${status}`, { status, retryAfterMs: hint })
      if (attempt === config.maxAttempts || (hint !== undefined && hint > config.maxWaitMs)) break
      await sleep(hint ?? Math.min(1000 * 2 ** (attempt - 1), config.maxWaitMs))
    }
    throw last
  }

  async function readCapped(response: Response, maxBytes: number) {
    const declared = Number(response.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => {})
      throw new JurisprudenceError("INVALID_DATA", `arquivo de ${declared} bytes acima do limite (${maxBytes})`)
    }
    if (!response.body) return response.text()
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new JurisprudenceError("INVALID_DATA", `arquivo acima do limite (${maxBytes} bytes)`)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString("utf8")
  }

  function parseJson(text: string, what: string): unknown {
    try {
      return JSON.parse(text.replace(/^﻿/, ""))
    } catch {
      throw new JurisprudenceError("INVALID_DATA", `${what}: resposta que não é JSON`)
    }
  }

  return {
    id: "stj",
    tribunal: "STJ",
    label: STJ_LABEL,
    datasets: options.datasets?.length ? options.datasets : STJ_DEFAULT_DATASETS,

    async listFiles(dataset) {
      if (!/^[a-z0-9-]{3,100}$/.test(dataset)) throw new JurisprudenceError("INVALID_DATA", `conjunto inválido: ${dataset}`)
      const text = await get(`${baseUrl}/api/3/action/package_show?id=${encodeURIComponent(dataset)}`, config.attemptTimeoutMs, 5 * 1024 * 1024)
      const body = parseJson(text, "package_show") as { success?: boolean; result?: { resources?: CkanResource[] } }
      if (!body?.success || !Array.isArray(body.result?.resources)) throw new JurisprudenceError("INVALID_DATA", `package_show sem recursos para ${dataset}`)
      const files: SourceFile[] = []
      for (const resource of body.result.resources) {
        const url = allowedUrl(resource.url)
        const id = cleanText(resource.id, 80)
        const name = cleanText(resource.name, 200) ?? id
        if (!url || !id || !name) continue
        const format = (resource.format ?? "").toUpperCase() || (/\.zip$/i.test(url) ? "ZIP" : /\.json$/i.test(url) ? "JSON" : "")
        if (format !== "JSON" && format !== "ZIP") continue
        files.push({
          dataset,
          resourceId: id,
          name,
          url,
          format,
          modifiedAt: resource.last_modified ?? resource.created ?? undefined,
          historical: format === "ZIP",
        })
      }
      // Nome AAAAMMDD = data de extração: ordem cronológica.
      return files.sort((a, b) => a.name.localeCompare(b.name))
    },

    async fetchFile(file) {
      if (file.historical) throw new JurisprudenceError("INVALID_DATA", "arquivo histórico (ZIP) não é lido nesta versão")
      const url = allowedUrl(file.url)
      if (!url) throw new JurisprudenceError("INVALID_DATA", "link do arquivo fora do portal oficial")
      const body = parseJson(await get(url, config.fileTimeoutMs, config.maxFileBytes), file.name)
      if (Array.isArray(body)) return body
      // Alguns arquivos embrulham a lista num objeto ({ "documentos": [...] }).
      const list = body && typeof body === "object" ? Object.values(body as Record<string, unknown>).find(Array.isArray) : undefined
      if (!list) throw new JurisprudenceError("INVALID_DATA", `${file.name}: nenhuma lista de decisões no arquivo`)
      return list as unknown[]
    },

    normalize: normalizeStjRecord,
  }
}
