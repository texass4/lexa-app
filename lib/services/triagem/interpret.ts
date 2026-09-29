/**
 * Interpretação dos eventos novos da Triagem pela Íntegra IA — roda no servidor, na
 * mesma rota do agendador (depois do monitoramento e da captura). Somente servidor.
 *
 *   banco reserva os eventos abertos sem interpretação (`claim_triage_ai`)
 *     → um pedido ao modelo por evento (mesmo provedor e prompt base da Íntegra IA)
 *     → confere a resposta contra o original (`lib/triagem/interpret.ts`)
 *     → grava UMA vez (`save_triage_ai`); dúvida → revisão manual
 *
 * Abrir a Triagem nunca chama o modelo: a tela só lê o que ficou guardado. Se a IA
 * falhar, o evento continua na Triagem com o original; a interpretação é tentada de
 * novo mais tarde (até 3 vezes). Cada chamada passa pela medição da Íntegra IA
 * (`lib/ai/metering.ts`): conta no limite do plano do escritório, com modelo, tokens e
 * custo registrados. Escritório sem cota no mês espera o mês virar, sem gastar tentativa.
 */

import { AIError, CONFIG_ERROR_CODES, isAIError } from "@/lib/ai/errors"
import { logAIEvent, type AILogger } from "@/lib/ai/log"
import { meteredCall, type AIMeter } from "@/lib/ai/metering"
import { buildSystemPrompt, dataMessage } from "@/lib/ai/prompts/system"
import { SchemaError } from "@/lib/ai/schema"
import type { AIProvider } from "@/lib/ai/provider"
import { SYSTEM_ACTOR_ID } from "@/lib/system-actor"
import {
  finalizeInterpretation,
  INTERPRET_REQUEST,
  INTERPRET_TASK,
  interpretationContext,
  interpretationSchema,
  type InterpretInput,
} from "@/lib/triagem/interpret"
import type { TriageAI } from "@/types"

/** Eventos por execução. */
export const INTERPRET_BATCH = 15
/** Reserva: duas execuções não interpretam o mesmo evento. */
export const INTERPRET_LEASE_MS = 10 * 60_000
/** Nova tentativa depois de uma falha: 15 min, 1 h, 4 h. */
export const retryAfterFailure = (attempts: number) => 15 * 60_000 * 4 ** Math.min(attempts, 2)

/** Cada interpretação tem o próprio teto de tempo (o provedor também tem o seu). */
export const INTERPRET_TIMEOUT_MS = 30_000

/** `countAttempt: false` = esperou por limite (não é falha do evento). */
export type InterpretOutcome = { ok: true; ai: TriageAI; reviewReason?: string } | { ok: false; retryAfterMs: number; countAttempt?: boolean }

export interface InterpretRepository {
  claim(limit: number, leaseMs: number): Promise<InterpretInput[]>
  save(id: string, outcome: InterpretOutcome): Promise<void>
}

export interface InterpretDeps {
  repo: InterpretRepository
  provider: AIProvider
  /** Limites do plano e consumo (no banco em produção). */
  meter: AIMeter
  /** Epoch ms: depois disso, não começa novos pedidos (a rota tem teto de duração). */
  deadline: number
  limit?: number
  now?: () => Date
  log?: (message: string) => void
  logEvent?: AILogger
}

export interface InterpretSummary {
  claimed: number
  interpreted: number
  failed: number
  /** Adiados por limite do plano ou de ritmo do escritório. */
  deferred: number
  /** Motivo de ter parado antes do fim (limite do provedor, configuração). */
  stopped: string | null
}

/** Erros que valem para todos os eventos: não adianta seguir nesta execução. */
const STOPS_RUN = new Set([...CONFIG_ERROR_CODES, "PROVIDER_RATE_LIMITED", "UNAVAILABLE"])
/** Limites do escritório: os eventos dele esperam; os dos outros escritórios seguem. */
const WAITS_FOR_QUOTA = new Set(["PLAN_LIMIT", "RATE_LIMITED"])

export async function runTriageInterpretation(deps: InterpretDeps): Promise<InterpretSummary> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? ((message: string) => console.info(message))
  const logEvent = deps.logEvent ?? logAIEvent
  const summary: InterpretSummary = { claimed: 0, interpreted: 0, failed: 0, deferred: 0, stopped: null }
  const waiting = new Map<string, number>()

  const queue = await deps.repo.claim(deps.limit ?? INTERPRET_BATCH, INTERPRET_LEASE_MS)
  summary.claimed = queue.length

  for (const input of queue) {
    if (now().getTime() >= deps.deadline) break
    const wait = waiting.get(input.organizationId)
    if (wait !== undefined) {
      summary.deferred += 1
      await deps.repo.save(input.id, { ok: false, retryAfterMs: wait, countAttempt: false }).catch(() => undefined)
      continue
    }
    const started = Date.now()
    const base = { operation: "triage.interpret", organizationId: input.organizationId, userId: SYSTEM_ACTOR_ID, provider: deps.provider.name }
    try {
      const call = { organizationId: input.organizationId, userId: null, operation: "triage.interpret" }
      const { value, usage } = await meteredCall(deps.meter, deps.provider, call, "light", () =>
        deps.provider.generateJSON({
          system: buildSystemPrompt(INTERPRET_TASK),
          messages: [{ role: "user", content: dataMessage(interpretationContext(input), INTERPRET_REQUEST) }],
          schema: interpretationSchema.json,
          temperature: 0,
          maxOutputTokens: 800,
          tier: "light",
          signal: AbortSignal.timeout(INTERPRET_TIMEOUT_MS),
        }),
      )
      let parsed
      try {
        parsed = interpretationSchema.parse(value)
      } catch (error) {
        if (error instanceof SchemaError) throw new AIError("INVALID_RESPONSE", { message: error.message, cause: error })
        throw error
      }
      const model = usage?.model ?? deps.provider.model
      const { ai, reviewReason } = finalizeInterpretation(input, parsed, { model, now: now() })
      await deps.repo.save(input.id, { ok: true, ai, reviewReason })
      summary.interpreted += 1
      logEvent({ ...base, model, durationMs: Date.now() - started, ok: true, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens })
    } catch (error) {
      const known = isAIError(error) ? error : new AIError("UNEXPECTED", { cause: error })
      if (WAITS_FOR_QUOTA.has(known.code)) {
        const retryAfterMs = Math.max(60_000, (known.retryAfter ?? 3600) * 1000)
        waiting.set(input.organizationId, retryAfterMs)
        summary.deferred += 1
        await deps.repo.save(input.id, { ok: false, retryAfterMs, countAttempt: false }).catch(() => undefined)
        continue
      }
      summary.failed += 1
      logEvent({
        ...base,
        model: deps.provider.model,
        durationMs: Date.now() - started,
        ok: false,
        code: known.code,
        providerStatus: known.providerStatus,
      })
      const retryAfterMs = Math.max(retryAfterFailure(input.attempts), (known.retryAfter ?? 0) * 1000)
      await deps.repo.save(input.id, { ok: false, retryAfterMs }).catch((e) => console.error("[triagem-ia] falha ao registrar erro", e))
      if (STOPS_RUN.has(known.code)) {
        summary.stopped = known.code
        break
      }
    }
  }

  log(
    `[triagem-ia] reservados=${summary.claimed} interpretados=${summary.interpreted} falhas=${summary.failed} adiados=${summary.deferred}${summary.stopped ? ` parada=${summary.stopped}` : ""}`,
  )
  return summary
}
