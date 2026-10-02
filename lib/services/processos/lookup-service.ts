/**
 * Serviço de consulta de processos — o único ponto do servidor que fala com a
 * fonte externa.
 *
 *   rota da API → lookup-service → cache (memória → Supabase) → provider → normalização
 *
 * - Cache fresco: responde na hora, sem ir à fonte.
 * - Cache vencido + `staleWhileRevalidate`: entrega o que tem e atualiza em
 *   segundo plano; a próxima leitura já vem atualizada.
 * - Deduplicação: consultas simultâneas do mesmo processo no mesmo escritório
 *   compartilham uma única chamada à fonte.
 * - Normalização: a fonte vira `ProcessSheet` aqui. Nada do formato bruto
 *   chega às rotas nem à interface.
 *
 * Erros saem como `LookupError` (detalhe técnico só no log). Somente servidor.
 */

import { hasValidCheckDigits, onlyDigits } from "@/lib/processos/cnj"
import { LookupError, isTransient, type LookupErrorCode } from "@/lib/integrations/legal/errors"
import type { ProcessProvider } from "@/lib/integrations/legal/types"
import { cacheKey, MemoryLookupCache, type CachedLookup, type LookupStore } from "./lookup-cache"
import { buildProcessSheet, type ProcessSheet } from "./sheet"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * Por quanto tempo uma consulta vale. A fonte pública é atualizada pelos
 * tribunais em lotes, não em tempo real: 6 h equilibra novidade e custo.
 */
export const FRESH_FOR_MS = 6 * HOUR
/** Até quando um dado vencido ainda pode ser mostrado enquanto atualiza. */
const STALE_UP_TO_MS = 7 * 24 * HOUR
/** "Não encontrado" fica pouco tempo: pode ser só atraso de indexação. */
export const NOT_FOUND_FOR_MS = 10 * MINUTE
/** Intervalo mínimo entre idas à fonte, mesmo quando o usuário pede "Atualizar". */
export const MIN_REFRESH_INTERVAL_MS = MINUTE

export interface LookupRequest {
  organizationId: string
  cnj: string
  /** Idade máxima aceita para o cache (padrão: `FRESH_FOR_MS`). */
  maxAgeMs?: number
  /** Com cache vencido, responde com ele e atualiza em segundo plano. */
  staleWhileRevalidate?: boolean
  /** Cache persistente do escritório (Supabase). */
  store?: LookupStore | null
  /** Mantém viva a atualização em segundo plano depois da resposta (ex.: `after` do Next). */
  defer?: (task: Promise<unknown>) => void
}

export interface LookupResult {
  sheet: ProcessSheet
  /** ISO (UTC) de quando a fonte foi consultada — pode ser anterior a agora, se veio do cache. */
  checkedAt: string
  cached: boolean
  /** Há uma atualização rodando em segundo plano. */
  revalidating: boolean
}

export interface LookupServiceOptions {
  provider: ProcessProvider
  memory?: MemoryLookupCache
  now?: () => number
  log?: (message: string) => void
}

export function createLookupService({ provider, memory = new MemoryLookupCache(), now = Date.now, log = console.info }: LookupServiceOptions) {
  const inflight = new Map<string, Promise<CachedLookup>>()

  const validFor = (entry: CachedLookup, maxAgeMs: number) => (entry.found ? maxAgeMs : Math.min(maxAgeMs, NOT_FOUND_FOR_MS))
  const age = (entry: CachedLookup) => now() - entry.fetchedAt

  /** Vai à fonte — uma vez só por escritório+processo, mesmo com chamadas simultâneas. */
  function fetchFromProvider(organizationId: string, digits: string, store: LookupStore | null | undefined): Promise<CachedLookup> {
    const key = cacheKey(organizationId, digits)
    const running = inflight.get(key)
    if (running) return running

    const task = (async () => {
      const started = now()
      try {
        const external = await provider.lookup(digits)
        const entry: CachedLookup = { found: !!external, sheet: external ? buildProcessSheet(external) : null, fetchedAt: now() }
        memory.set(key, entry)
        log(`[process-lookup] org=${organizationId} cnj=${digits} origem=fonte encontrado=${entry.found} ms=${now() - started}`)
        // Só acerto vai para o banco; "não encontrado" fica pouco tempo, na memória.
        if (entry.found && store) {
          await store.set(organizationId, digits, entry).catch((error) => console.error("[process-lookup] falha ao gravar cache:", error))
        }
        return entry
      } catch (error) {
        const code: LookupErrorCode = error instanceof LookupError ? error.code : "UNEXPECTED"
        const detail = error instanceof LookupError ? error.detail : error
        // Passageiro (429, timeout) é aviso; configuração, autenticação e bug são erro.
        const level = isTransient(code) ? console.warn : console.error
        level(`[process-lookup] org=${organizationId} cnj=${digits} falhou code=${code} ms=${now() - started}`, detail)
        throw error instanceof LookupError ? error : new LookupError("UNEXPECTED", String((error as Error)?.stack ?? error))
      } finally {
        inflight.delete(key)
      }
    })()

    inflight.set(key, task)
    return task
  }

  async function readCache(organizationId: string, digits: string, store: LookupStore | null | undefined) {
    const key = cacheKey(organizationId, digits)
    const hot = memory.get(key)
    if (hot) return { entry: hot, from: "memória" }
    if (!store) return { entry: undefined, from: "" }
    try {
      const saved = await store.get(organizationId, digits)
      if (saved) {
        memory.set(key, saved)
        return { entry: saved, from: "banco" }
      }
    } catch (error) {
      // Cache é otimização: se o banco falhar, segue para a fonte.
      console.error("[process-lookup] falha ao ler cache:", error)
    }
    return { entry: undefined, from: "" }
  }

  const toResult = (entry: CachedLookup, cached: boolean, revalidating: boolean): LookupResult => {
    if (!entry.found || !entry.sheet) throw new LookupError("NOT_FOUND", "a fonte não tem o número consultado")
    return { sheet: entry.sheet, checkedAt: new Date(entry.fetchedAt).toISOString(), cached, revalidating }
  }

  async function lookup(request: LookupRequest): Promise<LookupResult> {
    const digits = onlyDigits(request.cnj ?? "")
    if (digits.length !== 20 || !hasValidCheckDigits(digits)) throw new LookupError("INVALID_CNJ", `número inválido: ${request.cnj}`)

    const { organizationId, store } = request
    const maxAgeMs = request.maxAgeMs ?? FRESH_FOR_MS
    const { entry, from } = await readCache(organizationId, digits, store)

    if (entry && age(entry) <= validFor(entry, maxAgeMs)) {
      log(`[process-lookup] org=${organizationId} cnj=${digits} origem=${from} idade=${Math.round(age(entry) / MINUTE)}min`)
      return toResult(entry, true, false)
    }

    if (entry?.found && request.staleWhileRevalidate && age(entry) <= STALE_UP_TO_MS) {
      const refresh = fetchFromProvider(organizationId, digits, store).catch(() => undefined)
      request.defer?.(refresh)
      log(`[process-lookup] org=${organizationId} cnj=${digits} origem=${from} vencido — atualizando em segundo plano`)
      return toResult(entry, true, true)
    }

    return toResult(await fetchFromProvider(organizationId, digits, store), false, false)
  }

  return { lookup }
}
