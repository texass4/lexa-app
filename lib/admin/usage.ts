import { getSupabaseAdmin } from "@/lib/supabase/admin"

export type MeteredKind = "whatsapp_message" | "ai_request"

/** Detalhes de uma chamada de IA (colunas de `usage_events`, `0013_ia_consumo.sql`). Nunca prompt nem resposta. */
export interface AIUsageDetails {
  userId?: string | null
  operation: string
  provider: string
  model?: string
  status: "ok" | "erro" | "cache"
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  costUsd?: number | null
  durationMs?: number
  errorCode?: string
}

const isUuid = (value?: string | null) => !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/**
 * Registra consumo medido de um escritório (mensagem de WhatsApp enviada/recebida,
 * chamada de IA). É o ponto único que as integrações devem chamar — o painel Admin
 * (Uso da plataforma, Consumo de IA) soma estes eventos e compara com o limite do plano.
 * Chamadas de IA que vão ao modelo são reservadas antes (`reserveAIRequest`); aqui
 * entram as que não chegam a ele (respostas do cache). Só no servidor.
 */
export async function recordUsage(
  organizationId: string,
  kind: MeteredKind,
  quantity = 1,
  metadata: Record<string, unknown> = {},
  ai?: AIUsageDetails,
) {
  if (quantity <= 0) return
  const { error } = await getSupabaseAdmin()
    .from("usage_events")
    .insert({
      organization_id: organizationId,
      kind,
      quantity: Math.round(quantity),
      metadata,
      ...(ai
        ? {
            user_id: isUuid(ai.userId) ? ai.userId : null,
            operation: ai.operation,
            provider: ai.provider,
            model: ai.model ?? null,
            status: ai.status,
            input_tokens: ai.inputTokens ?? null,
            output_tokens: ai.outputTokens ?? null,
            cached_tokens: ai.cachedTokens ?? null,
            cost_usd: ai.costUsd ?? null,
            duration_ms: ai.durationMs ?? null,
            error_code: ai.errorCode ?? null,
          }
        : {}),
    })
  if (error) console.error("[usage]", kind, error.message)
}

export interface AIReservation {
  /** `null` quando a medição ainda não existe no banco (migração 0013 não aplicada). */
  eventId: number | null
  allowed: boolean
  reason?: "plano" | "pessoa" | "escritorio" | "escritorio_inexistente"
  retryAfterSeconds: number
  used: number
  monthlyLimit: number | null
}

export interface RateRules {
  userPerMinute: number
  userPerHour: number
  organizationPerHour: number
}

const MISSING_FUNCTION = new Set(["PGRST202", "42883"])
let warnedMissing = false

/**
 * Reserva uma chamada de IA no banco, de forma atômica (vale com vários servidores):
 * confere o limite mensal do plano e o ritmo por pessoa e por escritório e, se couber,
 * já registra a chamada como "pendente". `userId` nulo = chamada automática.
 */
export async function reserveAIRequest(
  input: { organizationId: string; userId?: string | null; operation: string; provider: string; model: string },
  rules: RateRules,
): Promise<AIReservation> {
  const { data, error } = await getSupabaseAdmin().rpc("ai_reserve", {
    p_org: input.organizationId,
    p_user: isUuid(input.userId) ? input.userId : null,
    p_operation: input.operation,
    p_provider: input.provider,
    p_model: input.model,
    p_user_per_minute: rules.userPerMinute,
    p_user_per_hour: rules.userPerHour,
    p_org_per_hour: rules.organizationPerHour,
  })
  if (error) {
    // Sem a migração 0013 a IA continua funcionando, mas sem limite nem medição.
    if (MISSING_FUNCTION.has(error.code ?? "")) {
      if (!warnedMissing) console.warn("[usage] ai_reserve ausente: aplique supabase/migrations/0013_ia_consumo.sql")
      warnedMissing = true
      return { eventId: null, allowed: true, retryAfterSeconds: 0, used: 0, monthlyLimit: null }
    }
    throw error
  }
  const row = (
    data as {
      event_id: number | null
      allowed: boolean
      reason: AIReservation["reason"] | null
      retry_after: number
      used: number
      monthly_limit: number | null
    }[]
  )[0]
  return {
    eventId: row?.event_id ?? null,
    allowed: !!row?.allowed,
    reason: row?.reason ?? undefined,
    retryAfterSeconds: row?.retry_after ?? 0,
    used: row?.used ?? 0,
    monthlyLimit: row?.monthly_limit ?? null,
  }
}

/** Resultado da chamada reservada: tokens, custo, duração e erro. */
export async function finishAIRequest(eventId: number, details: Omit<AIUsageDetails, "operation" | "provider" | "userId">) {
  const { error } = await getSupabaseAdmin().rpc("ai_finish", {
    p_event: eventId,
    p_status: details.status === "ok" ? "ok" : "erro",
    p_model: details.model ?? null,
    p_input: details.inputTokens ?? null,
    p_output: details.outputTokens ?? null,
    p_cached: details.cachedTokens ?? null,
    p_cost: details.costUsd ?? null,
    p_error: details.errorCode ?? null,
    p_duration: details.durationMs ?? null,
  })
  if (error) console.error("[usage] ai_finish", error.message)
}

/** Uso de IA do escritório no mês e o limite do plano (`null` = sem limite). */
export async function aiMonthlyUsage(organizationId: string): Promise<{ used: number; limit: number | null } | null> {
  const admin = getSupabaseAdmin()
  const [used, limit] = await Promise.all([
    admin.rpc("ai_monthly_used", { p_org: organizationId }),
    admin.rpc("ai_monthly_limit", { p_org: organizationId }),
  ])
  if (used.error || limit.error) return null
  return { used: Number(used.data ?? 0), limit: limit.data === null || limit.data === undefined ? null : Number(limit.data) }
}
