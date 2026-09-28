/**
 * Chat da LEXA IA.
 *
 * O servidor não guarda conversa: o navegador envia o histórico curto e o
 * escopo (processo, cliente ou escritório). A cada pergunta o contexto é
 * remontado a partir do banco — sempre atual, sempre do escritório e com as
 * permissões de quem pergunta — e só do escopo pedido, então processos
 * diferentes nunca se misturam.
 */

import { AIError } from "@/lib/ai/errors"
import { stripUnknownRefs, groundingWarnings } from "@/lib/ai/grounding"
import { buildClientContext, loadClientData } from "@/lib/ai/context/client"
import { buildOfficeContext, loadOfficeData } from "@/lib/ai/context/office"
import { buildProcessContext, loadProcessData } from "@/lib/ai/context/process"
import { sanitizeAIContext } from "@/lib/ai/context/sanitize"
import type { BuiltContext } from "@/lib/ai/context/shared"
import { buildSystemPrompt } from "@/lib/ai/prompts/system"
import { CHAT_SCOPE_LABEL, CHAT_TASK } from "@/lib/ai/prompts/tasks"
import { CHAT_LIMITS, type AIMessage, type AIResult, type ChatReply, type ChatScope } from "@/lib/ai/types"
import { citedSources, consumeQuota, nowOf, track, type AIServiceDeps } from "./run"

/** Histórico enxuto: últimas mensagens, cada uma limitada, terminando numa pergunta. */
export function trimHistory(messages: AIMessage[]): AIMessage[] {
  const cleaned = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === "user" ? CHAT_LIMITS.messageChars : CHAT_LIMITS.messageChars * 2) }))
    .slice(-CHAT_LIMITS.history)
  // O Gemini exige que a conversa comece pelo usuário.
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift()
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") throw new AIError("BAD_REQUEST", { message: "A conversa precisa terminar numa pergunta." })
  return cleaned
}

async function buildScopeContext(deps: AIServiceDeps, scope: ChatScope): Promise<BuiltContext> {
  const now = nowOf(deps)
  switch (scope.type) {
    case "process":
      return buildProcessContext(await loadProcessData(deps.repo, scope.id), now)
    case "client":
      return buildClientContext(await loadClientData(deps.repo, scope.id), now)
    case "office":
      return buildOfficeContext(await loadOfficeData(deps.repo), now, { forChat: true })
  }
}

export async function chat(deps: AIServiceDeps, scope: ChatScope, messages: AIMessage[]): Promise<AIResult<ChatReply>> {
  const history = trimHistory(messages)
  const built = await buildScopeContext(deps, scope)
  const context = sanitizeAIContext(built.context)
  const contextText = JSON.stringify(context)

  return track(deps, `chat.${scope.type}`, async () => {
    consumeQuota(deps)
    const system = buildSystemPrompt(`${CHAT_TASK}\n\n${CHAT_SCOPE_LABEL[scope.type]}\n\nDADOS DO LEXA (JSON):\n<dados>\n${contextText}\n</dados>`)
    const { value, usage } = await deps.provider.generateText({ system, messages: history, temperature: 0.3, signal: deps.signal })
    const text = stripUnknownRefs(value, built.sources).trim()
    if (!text) throw new AIError("EMPTY_RESPONSE")

    return {
      data: { text },
      sources: citedSources(text, built.sources),
      warnings: groundingWarnings(text, contextText),
      basis: built.basis,
      generatedAt: nowOf(deps).toISOString(),
      cached: false,
      usage,
    }
  })
}
