/** Validação do corpo das rotas da Íntegra IA. Qualquer desvio vira BAD_REQUEST. */

import { AIError } from "./errors"
import { CHAT_LIMITS, type AIMessage, type ChatScope } from "./types"

/** Ids internos da Íntegra (`p_<uuid>`, `c_123`). */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Análise de uma decisão: `{ jurisprudenceId, processId?, query? }`. */
export function readJurisprudenceInput(body: unknown): { jurisprudenceId: string; processId?: string; query?: string } {
  const input = record(body)
  if (typeof input.jurisprudenceId !== "string" || !UUID.test(input.jurisprudenceId)) throw bad("Decisão inválida.")
  const processId = input.processId === undefined || input.processId === null ? undefined : readId(input, "processId")
  if (input.query !== undefined && input.query !== null && (typeof input.query !== "string" || input.query.length > 300)) throw bad("Pesquisa inválida.")
  const query = typeof input.query === "string" && input.query.trim() ? input.query.trim() : undefined
  return { jurisprudenceId: input.jurisprudenceId, processId, query }
}

/** Comparação com o processo: `{ processId, ids }` (até 10 decisões). */
export function readRelatedInput(body: unknown): { processId: string; ids: string[] } {
  const input = record(body)
  const processId = readId(input, "processId")
  if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 10 || !input.ids.every((id) => typeof id === "string" && UUID.test(id))) {
    throw bad("Decisões inválidas.")
  }
  return { processId, ids: input.ids as string[] }
}
