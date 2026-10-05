/**
 * Moldura das rotas `/api/ai/*`. Em ordem, para toda chamada:
 *
 * 1. pessoa autenticada, membro ativo de escritório ativo, com a permissão da rota;
 * 2. IA ligada e configurada (sem chave, nada é consultado);
 * 3. corpo validado;
 * 4. repositório preso ao escritório de quem chama (RLS + filtro explícito);
 * 5. serviço (contexto → cache → reserva no banco → modelo → validação → consumo);
 * 6. erro sempre como `{ error: { code, message } }`, sem detalhe interno.
 */

import { NextResponse, type NextRequest } from "next/server"
import { HttpError, requireMember } from "@/lib/auth/server"
import { hasPermission, type Permission } from "@/lib/auth/permissions"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { cacheKey, databaseCache } from "./cache"
import { getAIConfig } from "./config"
import { databaseMeter } from "./metering"
import { AIError, CONFIG_ERROR_CODES, isAIError } from "./errors"
import { getAIProvider } from "./provider"
import { createSupabaseRepository } from "./context/repository"
import type { AIServiceDeps } from "./services/run"

function aiErrorResponse(error: AIError) {
  const headers = error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined
  return NextResponse.json(
    { error: { code: error.code, message: error.userMessage, retryAfter: error.retryAfter } },
    { status: error.status, headers },
  )
}

function toAIError(error: unknown): AIError {
  if (isAIError(error)) return error
  if (error instanceof HttpError) {
    if (error.status === 401) return new AIError("UNAUTHORIZED")
    return new AIError("FORBIDDEN")
  }
  return new AIError("UNEXPECTED", { cause: error })
}

export function aiRoute<C = unknown>(
  permission: Permission | null,
  handler: (context: { request: NextRequest; body: unknown; deps: AIServiceDeps; params: C }) => Promise<unknown>,
) {
  return async (request: NextRequest, routeContext: { params: Promise<C> }) => {
    try {
      const { profile, organizationId } = await requireMember(permission ?? undefined)
      getAIConfig()

      let body: unknown
      try {
        body = await request.json()
      } catch {
        throw new AIError("BAD_REQUEST")
      }

      const can = (p: Permission) => hasPermission(profile, p)
      // Limites, consumo e cache: no banco, pelo servidor (a pessoa não lê nem grava nessas tabelas).
      const admin = getSupabaseAdmin()
      const deps: AIServiceDeps = {
        repo: createSupabaseRepository(await createSupabaseServer(), organizationId, can),
        provider: getAIProvider(),
        userId: profile.id,
        meter: databaseMeter(),
        cache: databaseCache(admin),
        cacheKey,
        signal: request.signal,
      }
      const result = await handler({ request, body, deps, params: await routeContext.params })
      return NextResponse.json(result)
    } catch (error) {
      const known = toAIError(error)
      // Só o código e o tipo vão para o log — nunca contexto, prompt ou resposta.
      if (known.code === "UNEXPECTED") {
        const cause = known.cause as { name?: string; code?: string } | undefined
        console.error("[lexa-ia] erro inesperado:", cause?.code ?? cause?.name ?? "desconhecido")
      } else if (CONFIG_ERROR_CODES.includes(known.code)) {
        // A tela mostra só "não foi possível concluir"; quem opera a Íntegra vê a causa aqui.
        const hint: Record<string, string> = {
          DISABLED: "AI_ENABLED=false",
          NOT_CONFIGURED: "GEMINI_API_KEY ausente",
          INVALID_API_KEY: "GEMINI_API_KEY recusada pelo provedor",
          MODEL_UNAVAILABLE: "modelo de AI_MODEL/GEMINI_MODEL indisponível para a chave",
        }
        console.error("[lexa-ia] configuração:", known.code, hint[known.code] ?? "", known.providerStatus ?? "")
      }
      return aiErrorResponse(known)
    }
  }
}
