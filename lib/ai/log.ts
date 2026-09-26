/**
 * Log seguro da LEXA IA: operação, duração, resultado e modelo.
 * Nunca registra chave, prompt, contexto jurídico ou resposta do modelo;
 * pessoa e escritório aparecem só como hash curto.
 */

import { shortHash } from "./guard"

export interface AILogEvent {
  operation: string
  organizationId: string
  userId: string
  provider?: string
  model?: string
  durationMs: number
  ok: boolean
  code?: string
  cached?: boolean
  inputTokens?: number
  outputTokens?: number
}

export type AILogger = (event: AILogEvent) => void

export const logAIEvent: AILogger = ({ organizationId, userId, ...event }) => {
  const line = JSON.stringify({ ...event, org: shortHash(organizationId), user: shortHash(userId) })
  if (event.ok) console.info("[lexa-ia]", line)
  else console.warn("[lexa-ia]", line)
}
