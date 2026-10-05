import { fallbackForStatus, isTechnicalMessage, publicMessage, UNEXPECTED_ERROR } from "@/lib/core/public-error"

/** Erro com status HTTP e mensagem segura para mostrar a quem chamou (`route` em `server.ts`). */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * O que uma rota devolve ao navegador para um erro qualquer. `HttpError` leva a
 * própria mensagem, desde que ela não exponha detalhe técnico; qualquer outra
 * exceção vira 500 genérico. `logged` diz se o detalhe precisa ir para o log.
 */
export function toPublicError(error: unknown): { status: number; message: string; logged: boolean } {
  if (error instanceof HttpError) {
    const message = publicMessage(error.message, fallbackForStatus(error.status))
    return { status: error.status, message, logged: isTechnicalMessage(error.message) }
  }
  return { status: 500, message: UNEXPECTED_ERROR, logged: true }
}
