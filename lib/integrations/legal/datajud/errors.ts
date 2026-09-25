/**
 * Mensagens de erro da consulta processual, prontas para a interface.
 *
 * O `python/datajud.py` devolve um código (ex.: "RATE_LIMIT"); as rotas de API
 * traduzem para o texto abaixo. A UI nunca recebe mensagem técnica como texto
 * principal — o detalhe vai à parte, em `detail`.
 */

export type LegalIntegrationErrorCode =
  | "INVALID_CNJ"
  | "UNSUPPORTED_COURT"
  | "PROVIDER_NOT_CONFIGURED"
  | "AUTHENTICATION"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "UNEXPECTED"

const USER_MESSAGES: Record<LegalIntegrationErrorCode, string> = {
  INVALID_CNJ: "Digite um número de processo CNJ válido.",
  UNSUPPORTED_COURT: "Ainda não fazemos consulta automática nesse tribunal. Você pode cadastrar o processo manualmente.",
  PROVIDER_NOT_CONFIGURED: "A consulta automática de processos não está ativada neste ambiente.",
  AUTHENTICATION: "Não foi possível autenticar na fonte de dados. Fale com o administrador do escritório.",
  NOT_FOUND: "Não foi possível localizar esse processo na fonte consultada. Verifique o número CNJ e tente novamente.",
  RATE_LIMIT: "A consulta foi temporariamente limitada pela fonte. Tente novamente em alguns instantes.",
  TIMEOUT: "A fonte de dados demorou para responder. Tente novamente em alguns instantes.",
  UNAVAILABLE: "A fonte de dados está temporariamente indisponível.",
  UNEXPECTED: "Não conseguimos consultar o processo agora. Tente novamente em alguns instantes.",
}

/** Mensagem pronta para a UI a partir do código de erro. */
export function userMessageFor(code: string): string {
  return USER_MESSAGES[code as LegalIntegrationErrorCode] ?? USER_MESSAGES.UNEXPECTED
}
