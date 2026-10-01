import type { NodemailerError } from "nodemailer"

/** Por que um envio falhou. `message` do `EmailError` é sempre seguro para mostrar. */
export type EmailFailureReason = "not_configured" | "invalid_recipient" | "rejected" | "auth" | "timeout" | "unavailable" | "unexpected"

const USER_MESSAGES: Record<EmailFailureReason, string> = {
  not_configured: "O envio de e-mails ainda não está configurado. Fale com o suporte da Íntegra.",
  invalid_recipient: "Endereço de e-mail inválido.",
  rejected: "O servidor de e-mail recusou este endereço. Confira o e-mail informado.",
  auth: "O envio de e-mails está indisponível no momento. Fale com o suporte da Íntegra.",
  timeout: "O servidor de e-mail demorou demais para responder. Tente de novo em instantes.",
  unavailable: "O servidor de e-mail está indisponível no momento. Tente de novo em instantes.",
  unexpected: "Não foi possível enviar o e-mail. Tente novamente.",
}

/** Status HTTP para quando o envio é a própria operação (ex.: reenviar convite). */
const HTTP_STATUS: Record<EmailFailureReason, number> = {
  not_configured: 503,
  invalid_recipient: 400,
  rejected: 422,
  auth: 503,
  timeout: 504,
  unavailable: 503,
  unexpected: 502,
}

/**
 * Erro do serviço de e-mail. A mensagem é amigável e não traz nada do SMTP (código,
 * resposta, host, credenciais); o detalhe técnico vai só para o log do servidor.
 */
export class EmailError extends Error {
  readonly reason: EmailFailureReason
  readonly status: number
  constructor(reason: EmailFailureReason) {
    super(USER_MESSAGES[reason])
    this.name = "EmailError"
    this.reason = reason
    this.status = HTTP_STATUS[reason]
  }
}

/** Classifica um erro do Nodemailer; `retry` só para falhas temporárias. */
export function classifySmtpError(error: unknown): { reason: EmailFailureReason; retry: boolean } {
  const { code, responseCode, command } = (error ?? {}) as NodemailerError
  if (code === "EAUTH" || code === "ENOAUTH" || responseCode === 530 || responseCode === 534 || responseCode === 535)
    return { reason: "auth", retry: false }
  // Remetente recusado (ex.: não autorizado no provedor): problema de configuração, não de quem recebe.
  if (responseCode && responseCode >= 500 && /^MAIL FROM/i.test(command ?? "")) return { reason: "auth", retry: false }
  if (code === "ETIMEDOUT" || (error instanceof Error && error.name === "TimeoutError")) return { reason: "timeout", retry: false }
  if (responseCode && responseCode >= 400 && responseCode < 500) return { reason: "unavailable", retry: true }
  if (code === "EENVELOPE" || (responseCode && responseCode >= 550 && responseCode <= 553)) return { reason: "rejected", retry: false }
  if (code === "ECONNECTION" || code === "ESOCKET" || code === "EDNS" || code === "ETLS" || code === "EPROTOCOL")
    return { reason: "unavailable", retry: true }
  return { reason: "unexpected", retry: false }
}
