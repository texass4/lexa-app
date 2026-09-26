/**
 * Caminho único de toda chamada à IA:
 *
 *   contexto sanitizado → cache / pedido igual em andamento → limite de uso
 *   → provedor → validação do schema → verificação das fontes → log
 *
 * Os serviços só escolhem contexto, instrução e schema.
 */

import { AIError, isAIError } from "@/lib/ai/errors"
import { RATE_RULES, RateLimiter, ResultCache, shortHash } from "@/lib/ai/guard"
import { groundingWarnings, collectStrings, keepKnownRefs, refsInText } from "@/lib/ai/grounding"
import { logAIEvent, type AILogger } from "@/lib/ai/log"
import { PROMPT_VERSION, buildSystemPrompt, dataMessage } from "@/lib/ai/prompts/system"
import { SchemaError, type Schema } from "@/lib/ai/schema"
import { sanitizeAIContext } from "@/lib/ai/context/sanitize"
import type { AIProvider, AIRequest } from "@/lib/ai/provider"
import type { AIRepository } from "@/lib/ai/context/repository"
import type { BuiltContext } from "@/lib/ai/context/shared"
import type { AIResult, AISources } from "@/lib/ai/types"
import { getNow } from "@/lib/dates"

export interface AIServiceDeps {
  repo: AIRepository
  provider: AIProvider
  userId: string
  signal?: AbortSignal
  now?: Date
  limiter?: RateLimiter
  cache?: ResultCache<AIResult<unknown>>
  log?: AILogger
}

// Compartilhados entre requisições do mesmo processo do servidor.
const sharedLimiter = new RateLimiter()
const sharedCache = new ResultCache<AIResult<unknown>>()

export const nowOf = (deps: AIServiceDeps) => deps.now ?? getNow()

/** Conta uma chamada ao modelo para a pessoa e para o escritório. */
export function consumeQuota(deps: AIServiceDeps) {
  ;(deps.limiter ?? sharedLimiter).consume([
    { key: `user:${deps.userId}`, rules: RATE_RULES.user },
    { key: `org:${deps.repo.organizationId}`, rules: RATE_RULES.organization },
  ])
}

/** Só as fontes que a resposta de fato cita (menos dados trafegando). */
export function citedSources(output: unknown, sources: AISources, always: string[] = []): AISources {
  const cited = new Set(always)
  for (const text of collectStrings(output)) {
    if (/^[A-Z]\d{1,3}$/.test(text) && text in sources) cited.add(text)
    for (const ref of refsInText(text, sources)) cited.add(ref)
  }
  return Object.fromEntries([...cited].filter((ref) => ref in sources).map((ref) => [ref, sources[ref]]))
}

/** Mede, registra e converte erros desconhecidos em UNEXPECTED. */
export async function track<T extends { cached?: boolean }>(
  deps: AIServiceDeps,
  operation: string,
  run: () => Promise<T & { usage?: { inputTokens?: number; outputTokens?: number } }>,
): Promise<T> {
  const started = Date.now()
  const log = deps.log ?? logAIEvent
  const base = { operation, organizationId: deps.repo.organizationId, userId: deps.userId, provider: deps.provider.name, model: deps.provider.model }
  try {
    const { usage, ...result } = await run()
    log({ ...base, durationMs: Date.now() - started, ok: true, cached: result.cached, ...usage })
    return result as unknown as T
  } catch (error) {
    const known = isAIError(error) ? error : new AIError("UNEXPECTED", { cause: error })
    log({ ...base, durationMs: Date.now() - started, ok: false, code: known.code })
    throw known
  }
}

interface StructuredOptions<T> {
  deps: AIServiceDeps
  operation: string
  built: BuiltContext
  task: string
  request: string
  schema: Schema<T>
  /** Ajustes depois da validação (ex.: remover referências inexistentes). */
  finalize?: (data: T, sources: AISources) => T
  /** Referências sempre devolvidas (ex.: a movimentação analisada). */
  alwaysCite?: string[]
}

export async function runStructured<T>(options: StructuredOptions<T>): Promise<AIResult<T>> {
  const { deps, operation, built, schema } = options
  const context = sanitizeAIContext(built.context)
  const contextText = JSON.stringify(context)
  const provider = deps.provider
  const cache = (deps.cache ?? sharedCache) as ResultCache<AIResult<T> & { usage?: object }>
  const key = [operation, deps.repo.organizationId, provider.name, provider.model, PROMPT_VERSION, shortHash(contextText + options.request)].join(":")

  return track(deps, operation, async () => {
    const hit = cache.get(key)
    if (hit) return { ...hit, usage: undefined, cached: true }

    return cache.run(key, async () => {
      consumeQuota(deps)
      const request: AIRequest & { schema: typeof schema.json } = {
        system: buildSystemPrompt(options.task),
        messages: [{ role: "user", content: dataMessage(context, options.request) }],
        schema: schema.json,
        signal: deps.signal,
      }
      const { value, usage } = await provider.generateJSON(request)

      let data: T
      try {
        data = schema.parse(value)
      } catch (error) {
        if (error instanceof SchemaError) throw new AIError("INVALID_RESPONSE", { message: error.message, cause: error })
        throw error
      }
      if (options.finalize) data = options.finalize(data, built.sources)

      return {
        data,
        sources: citedSources(data, built.sources, options.alwaysCite),
        warnings: groundingWarnings(data, contextText),
        basis: built.basis,
        generatedAt: nowOf(deps).toISOString(),
        cached: false,
        usage,
      }
    })
  })
}

/** Remove referências inexistentes de uma lista de itens com `refs`. */
export const withKnownRefs = <I extends { refs: string[] }>(items: I[], sources: AISources) =>
  items.map((item) => ({ ...item, refs: keepKnownRefs(item.refs, sources) }))
