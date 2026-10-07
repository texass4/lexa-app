/**
 * Erros da jurisprudência — mesma separação da consulta processual
 * (`lib/integrations/legal/errors.ts`):
 * - INTERNO: `JurisprudenceError` com código e detalhe técnico (HTTP, tempo…), só para log;
 * - PÚBLICO: `publicJurisprudenceError` reduz a poucas mensagens de escritório. Nenhum
 *   nome de servidor, status HTTP ou stack trace chega ao navegador.
 */

export type JurisprudenceErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_QUERY"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "INVALID_DATA"
  | "UNEXPECTED"

export class JurisprudenceError extends Error {
  readonly code: JurisprudenceErrorCode
  readonly detail?: string
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(code: JurisprudenceErrorCode, detail?: string, info: { status?: number; retryAfterMs?: number } = {}) {
    super(detail ?? code)
    this.name = "JurisprudenceError"
    this.code = code
    this.detail = detail
    this.status = info.status
    this.retryAfterMs = info.retryAfterMs
  }
}

export const NOT_CONFIGURED_MESSAGE = "Pesquisa de jurisprudência ainda não configurada."

const PUBLIC: Record<JurisprudenceErrorCode, { message: string; status: number }> = {
  NOT_CONFIGURED: { message: NOT_CONFIGURED_MESSAGE, status: 503 },
  INVALID_QUERY: { message: "Revise os termos e os filtros da pesquisa.", status: 400 },
  NOT_FOUND: { message: "Decisão não encontrada.", status: 404 },
  RATE_LIMIT: { message: "Muitas pesquisas em sequência. Aguarde um instante e tente de novo.", status: 429 },
  TIMEOUT: { message: "A pesquisa demorou mais que o esperado. Tente de novo ou refine os termos.", status: 504 },
  UNAVAILABLE: { message: "A pesquisa de jurisprudência está indisponível no momento. Tente novamente em instantes.", status: 503 },
  INVALID_DATA: { message: "A pesquisa de jurisprudência está indisponível no momento. Tente novamente em instantes.", status: 503 },
  UNEXPECTED: { message: "A pesquisa de jurisprudência está indisponível no momento. Tente novamente em instantes.", status: 503 },
}

export function publicJurisprudenceError(error: unknown) {
  const code = error instanceof JurisprudenceError ? error.code : "UNEXPECTED"
  return { code, ...PUBLIC[code] }
}

/** Falhas passageiras da fonte: vale tentar de novo depois. */
export const isTransient = (code: JurisprudenceErrorCode) => code === "RATE_LIMIT" || code === "TIMEOUT" || code === "UNAVAILABLE"
