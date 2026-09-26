/**
 * Erros da LEXA IA. Toda falha vira um código conhecido com mensagem pronta
 * para a interface — nunca stack trace, chave, SQL ou resposta crua do provedor.
 */

import type { AIErrorCode } from "./types"

export const AI_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  DISABLED: "A LEXA IA está desativada neste ambiente.",
  NOT_CONFIGURED: "A configuração da LEXA IA ainda não foi concluída. Configure GEMINI_API_KEY no ambiente do servidor.",
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente para usar a LEXA IA.",
  FORBIDDEN: "Você não tem permissão para consultar estas informações.",
  NOT_FOUND: "Não encontramos este registro no seu escritório.",
  BAD_REQUEST: "Não foi possível entender o pedido enviado à LEXA IA.",
  INSUFFICIENT_DATA: "Nenhum dado suficiente foi encontrado para realizar esta análise.",
  RATE_LIMITED: "A LEXA IA atingiu temporariamente o limite de consultas. Tente novamente em alguns instantes.",
  PROVIDER_RATE_LIMITED: "A LEXA IA atingiu temporariamente o limite de consultas do provedor. Tente novamente em alguns instantes.",
  TIMEOUT: "A análise demorou mais do que o esperado. Tente novamente.",
  CANCELLED: "Análise cancelada.",
  EMPTY_RESPONSE: "A LEXA IA não conseguiu gerar uma resposta agora. Tente novamente.",
  INVALID_RESPONSE: "A resposta da LEXA IA veio incompleta e foi descartada. Tente novamente.",
  BLOCKED: "A LEXA IA não pôde responder a este pedido. Reformule a pergunta.",
  UNAVAILABLE: "Não foi possível analisar agora: o serviço de IA está indisponível. Tente novamente em alguns instantes.",
  UNEXPECTED: "Não foi possível concluir a análise agora. Tente novamente.",
}

export const AI_ERROR_STATUS: Record<AIErrorCode, number> = {
  DISABLED: 503,
  NOT_CONFIGURED: 503,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  INSUFFICIENT_DATA: 422,
  RATE_LIMITED: 429,
  PROVIDER_RATE_LIMITED: 429,
  TIMEOUT: 504,
  CANCELLED: 499,
  EMPTY_RESPONSE: 502,
  INVALID_RESPONSE: 502,
  BLOCKED: 422,
  UNAVAILABLE: 503,
  UNEXPECTED: 500,
}

export class AIError extends Error {
  readonly code: AIErrorCode
  /** Segundos até poder tentar de novo (limite de uso). */
  readonly retryAfter?: number

  constructor(code: AIErrorCode, options: { message?: string; retryAfter?: number; cause?: unknown } = {}) {
    super(options.message ?? AI_ERROR_MESSAGES[code], { cause: options.cause })
    this.name = "AIError"
    this.code = code
    this.retryAfter = options.retryAfter
  }

  get status() {
    return AI_ERROR_STATUS[this.code]
  }

  /** Texto seguro para a interface (sempre o catálogo, nunca a mensagem interna). */
  get userMessage() {
    return AI_ERROR_MESSAGES[this.code]
  }
}

export const isAIError = (error: unknown): error is AIError => error instanceof AIError
