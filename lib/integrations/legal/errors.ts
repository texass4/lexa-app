/**
 * Erros da consulta processual — duas camadas separadas de propósito.
 *
 * INTERNO (servidor): `LookupError` carrega um código técnico e um `detail`
 * (HTTP 429, timeout, resposta parcial…). Vai só para os logs.
 *
 * PÚBLICO (interface): `publicLookupError` reduz tudo a poucos motivos e a uma
 * mensagem de escritório. Nenhum nome de fonte, status HTTP ou stack trace sai
 * do servidor.
 */

export type LookupErrorCode =
  | "INVALID_CNJ"
  | "UNSUPPORTED_COURT"
  | "NOT_CONFIGURED"
  | "AUTHENTICATION"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "UNEXPECTED"

export class LookupError extends Error {
  readonly code: LookupErrorCode
  /** Detalhe técnico — somente para log. */
  readonly detail?: string

  constructor(code: LookupErrorCode, detail?: string) {
    super(detail ?? code)
    this.name = "LookupError"
    this.code = code
    this.detail = detail
  }
}

/** Motivos que a interface conhece. Todo o resto vira `unavailable`. */
export type LookupFailureReason = "invalid" | "not_found" | "unsupported" | "unavailable"

export interface PublicLookupError {
  reason: LookupFailureReason
  message: string
  status: number
}

export const LOOKUP_MESSAGES: Record<LookupFailureReason, string> = {
  invalid: "Confira o número do processo e tente novamente.",
  not_found: "Não encontramos informações para este número. Confira o número do processo.",
  unsupported: "A consulta automática ainda não está disponível para este tribunal.",
  unavailable: "Não foi possível consultar o processo no momento. Tente novamente em alguns instantes.",
}

const REASON: Partial<Record<LookupErrorCode, LookupFailureReason>> = {
  INVALID_CNJ: "invalid",
  NOT_FOUND: "not_found",
  UNSUPPORTED_COURT: "unsupported",
}

const STATUS: Record<LookupFailureReason, number> = { invalid: 400, not_found: 404, unsupported: 422, unavailable: 503 }

/** Erro interno (ou qualquer exceção) → o que pode ir para o navegador. */
export function publicLookupError(error: unknown): PublicLookupError {
  const reason = (error instanceof LookupError && REASON[error.code]) || "unavailable"
  return { reason, message: LOOKUP_MESSAGES[reason], status: STATUS[reason] }
}

/** Falhas passageiras: vale tentar de novo daqui a pouco. */
export const isTransient = (code: LookupErrorCode) => code === "RATE_LIMIT" || code === "TIMEOUT" || code === "UNAVAILABLE"
