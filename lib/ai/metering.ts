/**
 * Medição e limites de toda chamada da Íntegra IA ao modelo — o único caminho:
 *
 *   reserva no banco (limite do plano + ritmo; atômica, vale com vários servidores)
 *     → chamada ao provedor
 *     → resultado no banco: modelo, tokens, custo estimado, duração, erro
 *
 * Nada de prompt ou resposta é gravado. Respostas do cache entram como "cache" (não
 * contam no plano). A Central de Atendimento (WhatsApp) não passa por aqui.
 */

import { finishAIRequest, recordUsage, reserveAIRequest, type AIReservation, type RateRules } from "@/lib/admin/usage"
import type { AITier } from "./config"
import { AIError, isAIError } from "./errors"
import { RATE_RULES } from "./guard"
import { estimateCost } from "./pricing"
import type { AIProvider, AIProviderResult, AIUsage } from "./provider"

export interface AICallContext {
  organizationId: string
  /** `null` = chamada automática do servidor (sem limite por pessoa). */
  userId: string | null
  /** Ex.: "process.summary", "triage.interpret". */
  operation: string
}

export interface AICallOutcome {
  ok: boolean
  model: string
  usage?: AIUsage
  costUsd: number | null
  durationMs: number
  errorCode?: string
}

export interface AIMeter {
  /** Reserva a chamada ou lança `PLAN_LIMIT` / `RATE_LIMITED` (com `retryAfter`). */
  reserve(context: AICallContext, provider: string, model: string): Promise<{ eventId: number | null }>
  finish(reservation: { eventId: number | null }, context: AICallContext, provider: string, outcome: AICallOutcome): Promise<void>
  /** Resposta servida do cache: registrada, sem contar no plano. */
  cacheHit(context: AICallContext, provider: string, model: string): Promise<void>
}

/** Recusa da reserva → erro da Íntegra IA (mensagem pronta para a tela). */
export function reservationError(reservation: Pick<AIReservation, "reason" | "retryAfterSeconds" | "monthlyLimit">): AIError {
  if (reservation.reason === "plano") {
    return new AIError("PLAN_LIMIT", {
      retryAfter: reservation.retryAfterSeconds,
      message: `O escritório usou as ${reservation.monthlyLimit ?? 0} análises de IA do plano neste mês.`,
    })
  }
  return new AIError("RATE_LIMITED", { retryAfter: Math.max(1, reservation.retryAfterSeconds) })
}

export const DB_RATE_RULES: RateRules = {
  userPerMinute: RATE_RULES.user[0].limit,
  userPerHour: RATE_RULES.user[1].limit,
  organizationPerHour: RATE_RULES.organization[0].limit,
}

/** Medição no Supabase (`usage_events`, funções `ai_reserve` e `ai_finish`). Só no servidor. */
export function databaseMeter(rules: RateRules = DB_RATE_RULES): AIMeter {
  return {
    async reserve(context, provider, model) {
      let reservation: AIReservation
      try {
        reservation = await reserveAIRequest({ ...context, provider, model }, rules)
      } catch (error) {
        // Sem conseguir reservar, não chama o modelo (o limite não pode ser furado).
        throw new AIError("UNAVAILABLE", { cause: error })
      }
      if (!reservation.allowed) throw reservationError(reservation)
      return { eventId: reservation.eventId }
    },
    async finish({ eventId }, _context, _provider, outcome) {
      if (eventId === null) return
      await finishAIRequest(eventId, {
        status: outcome.ok ? "ok" : "erro",
        model: outcome.model,
        inputTokens: outcome.usage?.inputTokens,
        outputTokens: outcome.usage?.outputTokens,
        cachedTokens: outcome.usage?.cachedTokens,
        costUsd: outcome.costUsd,
        durationMs: outcome.durationMs,
        errorCode: outcome.errorCode,
      })
    },
    async cacheHit(context, provider, model) {
      await recordUsage(context.organizationId, "ai_request", 1, {}, { ...context, provider, model, status: "cache", costUsd: 0 })
    },
  }
}

/**
 * Uma chamada medida: reserva → provedor → resultado. A falha ao gravar a medição
 * nunca derruba a resposta; a falha do provedor é registrada e repassada.
 */
export async function meteredCall<T>(
  meter: AIMeter,
  provider: AIProvider,
  context: AICallContext,
  tier: AITier,
  call: () => Promise<AIProviderResult<T>>,
): Promise<AIProviderResult<T>> {
  const model = provider.modelFor?.(tier) ?? provider.model
  const reservation = await meter.reserve(context, provider.name, model)
  const started = Date.now()
  const finish = (outcome: AICallOutcome) =>
    meter.finish(reservation, context, provider.name, outcome).catch((error) => console.error("[lexa-ia] falha ao registrar consumo", error))
  try {
    const result = await call()
    const used = result.usage?.model ?? model
    await finish({ ok: true, model: used, usage: result.usage, costUsd: estimateCost(used, result.usage ?? {}), durationMs: Date.now() - started })
    return result
  } catch (error) {
    const code = isAIError(error) ? error.code : "UNEXPECTED"
    await finish({ ok: false, model, costUsd: null, durationMs: Date.now() - started, errorCode: code })
    throw error
  }
}
