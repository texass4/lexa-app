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
import { contextKeys, sanitizeAIText } from "@/lib/ai/output-sanitizer"
import { buildClientContext, loadClientData } from "@/lib/ai/context/client"
import { buildOfficeContext, loadOfficeData } from "@/lib/ai/context/office"
import { buildProcessContext, loadProcessData } from "@/lib/ai/context/process"
import { buildDecisionContext, jurisprudenceChatSection, type ChatJurisprudence } from "@/lib/ai/context/jurisprudence"
import { asksForJurisprudence, asksForSaved } from "@/lib/ai/jurisprudence-intent"
import { analyzeCase, withoutProcessData } from "@/lib/ai/jurisprudence-case"
import { logComparative, retrievePrecedents } from "@/lib/ai/jurisprudence-pipeline"
import { jurisprudenceConfig } from "@/lib/services/jurisprudence/config"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import type { Process } from "@/types"
import { sanitizeAIContext } from "@/lib/ai/context/sanitize"
import type { BuiltContext } from "@/lib/ai/context/shared"
import { buildSystemPrompt } from "@/lib/ai/prompts/system"
import { CHAT_MODE_LABEL, CHAT_SCOPE_LABEL, CHAT_TASK } from "@/lib/ai/prompts/tasks"
import { CHAT_LIMITS, type AIMessage, type AIResult, type ChatMode, type ChatReply, type ChatScope } from "@/lib/ai/types"
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

/**
 * Jurisprudência na conversa — só decisões reais da base:
 * - processo: as vinculadas a ele, sempre;
 * - pergunta sobre jurisprudência: a pergunta e os dados do processo viram o CASO
 *   (questões jurídicas, fatos, lacunas — `analyzeCase`); cada questão vira consultas
 *   próprias à base e os precedentes passam pela classificação jurídica e pela
 *   comparação com o caso (`retrievePrecedents`). Sem tema na pergunta nem no processo,
 *   o assunto da decisão da conversa;
 * - pergunta sobre "salvas": as salvas pelo escritório.
 * A pesquisa é no banco (barata); o modelo nunca é a fonte.
 */
async function jurisprudenceFor(
  deps: AIServiceDeps,
  question: string,
  ctx: Partial<ScopeContext>,
  { always = false, withProcessData = true } = {},
): Promise<ChatJurisprudence> {
  const out: ChatJurisprudence = {}
  if (!deps.repo.can("processes.view")) return out
  if (ctx.process) out.linked = await deps.repo.linkedJurisprudence(ctx.process.id).catch(() => [])
  // Modo Jurisprudência: pesquisa a cada pergunta. Senão, só quando a pergunta pede decisões.
  if (!always && !asksForJurisprudence(question)) return out
  if (asksForSaved(question)) {
    out.saved = await deps.repo.savedJurisprudence(10).catch(() => [])
    return out
  }
  if (!jurisprudenceConfig().enabled) {
    out.search = { unavailable: "A pesquisa de jurisprudência ainda não está configurada no escritório: não há base para consultar." }
    return out
  }
  let analysis = analyzeCase({ question, process: ctx.process })
  if (!analysis.issues.length && ctx.decision?.subject) analysis = analyzeCase({ question: ctx.decision.subject.slice(0, 300) })
  // Modo Jurisprudência: o processo só identifica a questão; nada dele entra na comparação.
  if (!withProcessData) analysis = withoutProcessData(analysis)
  if (!analysis.issues.length) {
    out.search = { unavailable: "A pergunta não traz o tema a pesquisar. Peça, por exemplo: \"há jurisprudência sobre negativação indevida?\"" }
    return out
  }
  const result = await retrievePrecedents(analysis, {
    candidates: (groups, filters, limit, options) => deps.repo.jurisprudenceCandidates(groups, filters, limit, options),
    loadFull: (ids) => deps.repo.getJurisprudence(ids),
    signal: deps.signal,
    cacheScope: deps.repo.organizationId,
    cache: deps.jurisprudenceCache,
    // Na conversa sobre uma decisão, "semelhantes" não inclui ela mesma.
    excludeIds: ctx.decision ? [ctx.decision.id] : undefined,
  })
  ;(deps.jurisprudenceLog ?? logComparative)(result)
  if (result.status === "indisponivel" || result.status === "cancelada") {
    out.search = { unavailable: "A pesquisa de jurisprudência não respondeu agora. Tente de novo em instantes." }
    return out
  }
  out.search = { result, withProcessData }
  return out
}

/** Só a jurisprudência: num processo, ele serve só para achar o tema e as decisões vinculadas — seus dados não vão ao modelo. */
async function jurisprudenceOnlyContext(deps: AIServiceDeps, scope: ChatScope, question: string): Promise<BuiltContext> {
  if (!deps.repo.can("processes.view")) throw new AIError("FORBIDDEN")
  const process = scope.type === "process" ? (await loadProcessData(deps.repo, scope.id, nowOf(deps))).process : undefined
  const juris = jurisprudenceChatSection(await jurisprudenceFor(deps, question, { process }, { always: true, withProcessData: false }))
  return { context: juris.context, sources: juris.sources, basis: "Decisões da base de jurisprudência da Íntegra (fontes oficiais)." }
}

/** Dados do escritório da conversa e, no modo All, a jurisprudência quando a pergunta pede. */
async function scopedContext(deps: AIServiceDeps, scope: ChatScope, question: string, withJurisprudence: boolean): Promise<BuiltContext> {
  const scoped = await buildScopeContext(deps, scope)
  if (!withJurisprudence) return scoped.built
  const juris = jurisprudenceChatSection(await jurisprudenceFor(deps, question, scoped))
  return {
    ...scoped.built,
    context: { ...scoped.built.context, ...juris.context },
    sources: { ...scoped.built.sources, ...juris.sources },
  }
}

export async function chat(deps: AIServiceDeps, scope: ChatScope, messages: AIMessage[], mode: ChatMode = "all"): Promise<AIResult<ChatReply>> {
  const history = trimHistory(messages)
  const question = history[history.length - 1].content
  // Numa conversa sobre uma decisão, a própria decisão é o contexto: o modo não se aplica.
  const effective: ChatMode = scope.type === "jurisprudence" ? "all" : mode
  const built =
    effective === "jurisprudence" ? await jurisprudenceOnlyContext(deps, scope, question) : await scopedContext(deps, scope, question, effective === "all")
  const context = sanitizeAIContext(built.context)
  const contextText = JSON.stringify(context)

  const operation = effective === "jurisprudence" ? "chat.jurisprudence-search" : `chat.${scope.type}`
  const labels = effective === "jurisprudence" ? [CHAT_MODE_LABEL.jurisprudence] : [CHAT_SCOPE_LABEL[scope.type], ...(scope.type === "jurisprudence" ? [] : [CHAT_MODE_LABEL[effective]])]
  return track(deps, operation, async () => {
    const system = buildSystemPrompt(`${CHAT_TASK}\n\n${labels.join("\n")}\n\nDADOS DA ÍNTEGRA (JSON):\n<dados>\n${contextText}\n</dados>`)
    const { value, usage } = await meteredCall(
      deps.meter,
      deps.provider,
      { organizationId: deps.repo.organizationId, userId: deps.userId, operation },
      "standard",
      () => deps.provider.generateText({ system, messages: history, temperature: 0.3, signal: deps.signal }),
    )
    // Limpeza final: nenhum nome interno dos dados (nem o nome antigo do produto) chega à pessoa.
    // (Referência inventada sai antes, para a limpeza arrumar o espaço que ela deixa.)
    const text = sanitizeAIText(stripUnknownRefs(value, built.sources), { contextKeys: contextKeys(context), sources: built.sources, linkBareRefs: true }).trim()
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
