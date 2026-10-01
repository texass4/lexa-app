/**
 * Caminho único de toda chamada à IA do núcleo da Íntegra:
 *
 *   contexto sanitizado → cache (banco, comum a todos os servidores) / pedido igual em
 *   andamento → reserva no banco (limite do plano + ritmo) → provedor → validação do
 *   schema → verificação das fontes → consumo registrado (tokens, custo) → log
 *
 * Os serviços só escolhem contexto, instrução, schema e o nível do modelo.
 */

import { AIError, isAIError } from "@/lib/ai/errors"
import { CACHE_TTL_MS, InFlight, type AICache } from "@/lib/ai/guard"
import { groundingWarnings, collectStrings, keepKnownRefs, refsInText } from "@/lib/ai/grounding"
import { logAIEvent, type AILogger } from "@/lib/ai/log"
import { meteredCall, type AIMeter } from "@/lib/ai/metering"
import { PROMPT_VERSION, buildSystemPrompt, dataMessage } from "@/lib/ai/prompts/system"
import { SchemaError, type Schema } from "@/lib/ai/schema"
import { sanitizeAIContext } from "@/lib/ai/context/sanitize"
import type { AITier } from "@/lib/ai/config"
import type { AIProvider, AIRequest } from "@/lib/ai/provider"
import type { AIRepository } from "@/lib/ai/context/repository"
import type { BuiltContext } from "@/lib/ai/context/shared"
import type { AIResult, AISources } from "@/lib/ai/types"
import { getNow } from "@/lib/core/dates"

export interface AIServiceDeps {
  repo: AIRepository
  provider: AIProvider
  userId: string
  /** Limites e consumo (no banco em produção). */
  meter: AIMeter
  /** Cache de análises (no banco em produção). */
  cache: AICache
  /** Monta a chave do cache (hash forte no servidor). */
  cacheKey: (parts: string[]) => string
  signal?: AbortSignal
  now?: Date
  log?: AILogger
}

// Pedidos iguais ao mesmo tempo neste servidor viram uma chamada só.
const inFlight = new InFlight<AIResult<unknown>>()

export const nowOf = (deps: AIServiceDeps) => deps.now ?? getNow()

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
    log({ ...base, durationMs: Date.now() - started, ok: false, code: known.code, providerStatus: known.providerStatus })
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
  /** `light`: operação simples, modelo mais barato. */
  tier?: AITier
}

export async function runStructured<T>(options: StructuredOptions<T>): Promise<AIResult<T>> {
  const { deps, operation, built, schema } = options
  const tier = options.tier ?? "standard"
  const context = sanitizeAIContext(built.context)
  const contextText = JSON.stringify(context)
  const provider = deps.provider
  const model = provider.modelFor?.(tier) ?? provider.model
  const call = { organizationId: deps.repo.organizationId, userId: deps.userId, operation }
  const key = deps.cacheKey([operation, deps.repo.organizationId, provider.name, model, PROMPT_VERSION, options.task, options.request, contextText])

  return track(deps, operation, async () => {
    const hit = await deps.cache.get<AIResult<T>>(key)
    if (hit) {
      await deps.meter.cacheHit(call, provider.name, model).catch(() => undefined)
      return { ...hit, cached: true, usage: undefined }
    }

    return (await inFlight.run(key, async () => {
      const request: AIRequest & { schema: typeof schema.json } = {
        system: buildSystemPrompt(options.task),
        messages: [{ role: "user", content: dataMessage(context, options.request) }],
        schema: schema.json,
        signal: deps.signal,
        tier,
      }
      const { value, usage } = await meteredCall(deps.meter, provider, call, tier, () => provider.generateJSON(request))

      let data: T
      try {
        data = schema.parse(value)
      } catch (error) {
        if (error instanceof SchemaError) throw new AIError("INVALID_RESPONSE", { message: error.message, cause: error })
        throw error
      }
      if (options.finalize) data = options.finalize(data, built.sources)

      const result: AIResult<T> = {
        data,
        sources: citedSources(data, built.sources, options.alwaysCite),
        warnings: groundingWarnings(data, contextText),
        basis: built.basis,
        generatedAt: nowOf(deps).toISOString(),
        cached: false,
      }
      await deps.cache.set(key, { organizationId: deps.repo.organizationId, operation, value: result, ttlMs: CACHE_TTL_MS }).catch(() => undefined)
      return { ...result, usage } as AIResult<unknown>
    })) as AIResult<T> & { usage?: { inputTokens?: number; outputTokens?: number } }
  })
}

/** Remove referências inexistentes de uma lista de itens com `refs`. */
export const withKnownRefs = <I extends { refs: string[] }>(items: I[], sources: AISources) =>
  items.map((item) => ({ ...item, refs: keepKnownRefs(item.refs, sources) }))
