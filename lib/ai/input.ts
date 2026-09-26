/** Validação do corpo das rotas da LEXA IA. Qualquer desvio vira BAD_REQUEST. */

import { AIError } from "./errors"
import { CHAT_LIMITS, type AIMessage, type ChatScope } from "./types"

/** Ids internos do LEXA (`p_<uuid>`, `c_123`). */
const ID = /^[A-Za-z0-9_-]{1,80}$/

const bad = (message: string) => new AIError("BAD_REQUEST", { message })

function record(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Corpo da requisição inválido.")
  return body as Record<string, unknown>
}

export function readId(body: unknown, field: string): string {
  const value = record(body)[field]
  if (typeof value !== "string" || !ID.test(value)) throw bad(`Campo ${field} inválido.`)
  return value
}

export function readChatInput(body: unknown): { scope: ChatScope; messages: AIMessage[] } {
  const input = record(body)
  const scope = record(input.scope)
  let parsedScope: ChatScope
  if (scope.type === "office") parsedScope = { type: "office" }
  else if (scope.type === "process" || scope.type === "client") parsedScope = { type: scope.type, id: readId(scope, "id") }
  else throw bad("Escopo da conversa inválido.")

  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 40) throw bad("Mensagens inválidas.")
  const messages = input.messages.map((raw) => {
    const message = record(raw)
    if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") throw bad("Mensagem inválida.")
    return { role: message.role, content: message.content } as AIMessage
  })
  const last = messages[messages.length - 1]
  if (last.role !== "user" || !last.content.trim()) throw bad("A conversa precisa terminar numa pergunta.")
  if (last.content.length > CHAT_LIMITS.messageChars) throw bad(`A pergunta pode ter até ${CHAT_LIMITS.messageChars} caracteres.`)
  return { scope: parsedScope, messages }
}
