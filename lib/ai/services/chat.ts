/**
 * Chat da Íntegra IA.
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
import { buildDecisionContext, jurisprudenceChatSection, type ChatJurisprudence } from "@/lib/ai/context/jurisprudence"
import { asksForJurisprudence, asksForSaved, searchTermsFrom } from "@/lib/ai/jurisprudence-intent"
import { jurisprudenceConfig } from "@/lib/services/jurisprudence/config"
import { relatedQueryForProcess } from "@/lib/services/jurisprudence/service"
import type { JurisprudenceDecision, JurisprudenceFilters } from "@/lib/services/jurisprudence/types"
import type { Process } from "@/types"
import { sanitizeAIContext } from "@/lib/ai/context/sanitize"
import type { BuiltContext } from "@/lib/ai/context/shared"
import { buildSystemPrompt } from "@/lib/ai/prompts/system"
import { CHAT_SCOPE_LABEL, CHAT_TASK } from "@/lib/ai/prompts/tasks"
import { CHAT_LIMITS, type AIMessage, type AIResult, type ChatReply, type ChatScope } from "@/lib/ai/types"
import { meteredCall } from "@/lib/ai/metering"
import { citedSources, nowOf, track, type AIServiceDeps } from "./run"

/** Histórico enxuto: últimas mensagens, cada uma limitada, terminando numa pergunta. */
export function trimHistory(messages: AIMessage[]): AIMessage[] {
  const cleaned = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === "user" ? CHAT_LIMITS.messageChars : CHAT_LIMITS.messageChars * 2) }))
    .slice(-CHAT_LIMITS.history)
  // O Gemini exige que a conversa comece pelo usuário.
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift()
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user")
    throw new AIError("BAD_REQUEST", { message: "A conversa precisa terminar numa pergunta." })
  return cleaned
}

interface ScopeContext {
  built: BuiltContext
  /** Processo da conversa (para pesquisar jurisprudência a partir dele). */
  process?: Process
  /** Decisão da conversa (escopo "jurisprudence"). */
  decision?: JurisprudenceDecision
}

async function buildScopeContext(deps: AIServiceDeps, scope: ChatScope): Promise<ScopeContext> {
  const now = nowOf(deps)
  switch (scope.type) {
    case "process": {
      const data = await loadProcessData(deps.repo, scope.id, now)
      return { built: buildProcessContext(data, now), process: data.process }
    }
    case "client":
      return { built: buildClientContext(await loadClientData(deps.repo, scope.id, now), now) }
    case "office":
      return { built: buildOfficeContext(await loadOfficeData(deps.repo, now), now, { forChat: true }) }
    case "jurisprudence": {
      if (!deps.repo.can("processes.view")) throw new AIError("FORBIDDEN")
      const [decision] = await deps.repo.getJurisprudence([scope.id])
      if (!decision) throw new AIError("NOT_FOUND")
      return { built: buildDecisionContext(decision, { now }), decision }
    }
  }
}

/** Quantas decisões da base entram numa resposta da conversa. */
export const CHAT_JURISPRUDENCE_RESULTS = 5

/**
 * Jurisprudência na conversa — só decisões reais da base:
 * - processo: as vinculadas a ele, sempre;
 * - pergunta sobre jurisprudência: pesquisa na base com os termos da pergunta (ou, sem
 *   tema na pergunta, com o assunto/tipo/classe do processo ou o assunto da decisão);
 * - pergunta sobre "salvas": as salvas pelo escritório.
 * A pesquisa é no banco (barata); o modelo nunca é a fonte.
 */
async function jurisprudenceFor(deps: AIServiceDeps, scope: ChatScope, question: string, ctx: ScopeContext): Promise<ChatJurisprudence> {
  const out: ChatJurisprudence = {}
  if (!deps.repo.can("processes.view")) return out
  if (ctx.process) out.linked = await deps.repo.linkedJurisprudence(ctx.process.id).catch(() => [])
  if (!asksForJurisprudence(question)) return out
  if (asksForSaved(question)) {
    out.saved = await deps.repo.savedJurisprudence(10).catch(() => [])
    return out
  }
  if (!jurisprudenceConfig().enabled) {
    out.search = { unavailable: "A pesquisa de jurisprudência ainda não está configurada no escritório: não há base para consultar." }
    return out
  }
  let query = searchTermsFrom(question)
  let filters: JurisprudenceFilters = {}
  if (query.length < 4 && ctx.process) {
    const related = relatedQueryForProcess(ctx.process)
    query = related.text
    filters = related.filters
  } else if (query.length < 4 && ctx.decision) {
    query = (ctx.decision.subject ?? "").slice(0, 300)
  }
  if (query.length < 3) {
    out.search = { unavailable: "A pergunta não traz o tema a pesquisar. Peça, por exemplo: \"há jurisprudência sobre negativação indevida?\"" }
    return out
  }
  try {
    const { decisions, total } = await deps.repo.searchJurisprudence(query, filters, CHAT_JURISPRUDENCE_RESULTS + (ctx.decision ? 1 : 0))
    // Na conversa sobre uma decisão, "semelhantes" não inclui ela mesma.
    const others = decisions.filter((d) => d.id !== ctx.decision?.id).slice(0, CHAT_JURISPRUDENCE_RESULTS)
    out.search = { query, total: ctx.decision && others.length < decisions.length ? Math.max(0, total - 1) : total, decisions: others }
  } catch (error) {
    console.warn("[ia] pesquisa de jurisprudência na conversa falhou:", error instanceof Error ? error.message : error)
    out.search = { unavailable: "A pesquisa de jurisprudência não respondeu agora. Tente de novo em instantes." }
  }
  return out
}

export async function chat(deps: AIServiceDeps, scope: ChatScope, messages: AIMessage[]): Promise<AIResult<ChatReply>> {
  const history = trimHistory(messages)
  const scoped = await buildScopeContext(deps, scope)
  const juris = jurisprudenceChatSection(await jurisprudenceFor(deps, scope, history[history.length - 1].content, scoped))
  const built: BuiltContext = {
    ...scoped.built,
    context: { ...scoped.built.context, ...juris.context },
    sources: { ...scoped.built.sources, ...juris.sources },
  }
  const context = sanitizeAIContext(built.context)
  const contextText = JSON.stringify(context)

  const operation = `chat.${scope.type}`
  return track(deps, operation, async () => {
    const system = buildSystemPrompt(`${CHAT_TASK}\n\n${CHAT_SCOPE_LABEL[scope.type]}\n\nDADOS DA ÍNTEGRA (JSON):\n<dados>\n${contextText}\n</dados>`)
    const { value, usage } = await meteredCall(
      deps.meter,
      deps.provider,
      { organizationId: deps.repo.organizationId, userId: deps.userId, operation },
      "standard",
      () => deps.provider.generateText({ system, messages: history, temperature: 0.3, signal: deps.signal }),
    )
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
