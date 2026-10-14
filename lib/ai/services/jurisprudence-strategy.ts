/**
 * Análise comparativa de jurisprudência — o caso do advogado (pergunta + processo do
 * escritório, com as permissões de quem pede) contra os precedentes REAIS da base.
 *
 *   caso estruturado → consultas por questão → classificação jurídica e comparação
 *   (`retrievePrecedents`, sem IA) → UMA chamada ao modelo, só com os precedentes
 *   selecionados → conferência: referências, trechos literais, citações, termos proibidos.
 *
 * Sem precedente pertinente, ou com a base fora do ar, NÃO chama o modelo: a resposta diz
 * que a pesquisa não encontrou suporte (ou que a base não respondeu) — nunca preenche com
 * decisões superficialmente relacionadas.
 */

import { AIError } from "@/lib/ai/errors"
import { citationWarnings, decisionTexts, verifyLiteral } from "@/lib/ai/jurisprudence-citations"
import { logComparative, retrievePrecedents, type RetrievalResult } from "@/lib/ai/jurisprudence-pipeline"
import { BASE_NOTE, describeCase, describePrecedent, describeQueries, retrievalOutcome } from "@/lib/ai/context/jurisprudence-comparative"
import { SourceRegistry, fmtToday, type BuiltContext } from "@/lib/ai/context/shared"
import { keepKnownRefs, stripUnknownRefs } from "@/lib/ai/grounding"
import { JURISPRUDENCE_STRATEGY_TASK } from "@/lib/ai/prompts/tasks"
import { jurisprudenceStrategySchema } from "@/lib/ai/schemas"
import type { AIResult, AISources, JurisprudenceStrategy, StrategyRetrievalView } from "@/lib/ai/types"
import { jurisprudenceConfig } from "@/lib/services/jurisprudence/config"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import { nowOf, runStructured, type AIServiceDeps } from "./run"

export interface JurisprudenceStrategyResult extends AIResult<JurisprudenceStrategy> {
  /** O que a pesquisa encontrou e como comparou — calculado pela Íntegra. */
  retrieval: StrategyRetrievalView
}

const EMPTY: JurisprudenceStrategy = {
  sintese: "",
  precedentes: [],
  teses_favoraveis: [],
  contrarios_e_distincoes: [],
  riscos: [],
  lacunas_probatorias: [],
  cenarios: [],
  proximos_pontos: [],
  informacoes_ausentes: [],
}

/** Mensagem pública do resultado da pesquisa (nunca "não há jurisprudência"). */
export function retrievalMessage(result: RetrievalResult): string {
  switch (result.status) {
    case "indisponivel":
      return "A base de jurisprudência não respondeu agora (erro técnico, não ausência de decisões). Tente de novo em instantes."
    case "cancelada":
      return "A pesquisa foi interrompida antes de terminar."
    case "nao_executada":
      return result.notRun ?? "A pesquisa não foi feita: faltou o tema."
    default:
      if (result.support === "suficiente") return "A pesquisa encontrou decisões diretamente pertinentes às questões do caso."
      if (result.support === "parcial") return "A pesquisa encontrou decisões pertinentes a parte das questões; para as demais, não encontrou suporte suficiente na base."
      if (result.precedents.length) return "A pesquisa não encontrou decisão diretamente pertinente; só decisões relacionadas, que não bastam para sustentar uma conclusão."
      return "A pesquisa não encontrou suporte suficiente na base para estes termos. Isso não significa que não existam decisões sobre o tema (podem usar outras palavras ou estar fora da base)."
  }
}

/** A visão da tela: identificação como está na base, posição e comparação calculadas pela Íntegra. */
export function retrievalView(result: RetrievalResult, refs: Map<string, string>): StrategyRetrievalView {
  const a = result.analysis
  return {
    status: result.status,
    support: result.support,
    message: retrievalMessage(result),
    caso: {
      profundidade: a.depth,
      questoes: a.issues.map((i) => ({ questao: i.question, tese: i.thesis, ampla: i.vague, roteiro: i.requirements.map((r) => ({ texto: r.text, situacao: r.status, detalhe: r.detail })) })),
      fatos: a.facts.map((f) => ({ fato: f.label, origem: f.source, trecho: f.quote })),
      provas: a.evidence.map((e) => ({ prova: e.label, situacao: e.status, origem: e.source })),
      posicao: a.position,
      fase: a.phase?.text,
      lacunas: a.gaps,
    },
    precedentes: result.precedents.map((p) => {
      const d = p.decision
      return {
        ref: refs.get(d.id) ?? "",
        id: d.id,
        label: [d.tribunal, [d.classCode, d.processNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
        href: `/jurisprudencia?id=${d.id}`,
        questao: p.issueQuestion,
        tribunal: d.tribunal,
        orgao: d.court,
        relator: d.rapporteur,
        dataJulgamento: d.judgmentDate,
        publicacao: d.publication ?? d.publicationDate,
        assunto: d.subject,
        nivel: p.level,
        posicao: p.stance,
        posicaoCliente: p.stanceForClient,
        trechoPosicao: p.stanceEvidence?.sentence,
        ressalva: p.stanceEvidence?.exception,
        resultado: p.outcome,
        trecho: p.lexical.excerpt ? { campo: p.lexical.excerpt.field, texto: p.lexical.excerpt.text, cortado: p.lexical.excerpt.cut } : undefined,
        fatosEmComum: p.sharedFacts.map((f) => f.label),
        distincoes: p.distinctions.map((x) => x.text),
        metadadosAusentes: p.missingMetadata,
        pontuacao: p.score,
      }
    }),
    consultas: describeQueries(result),
    metricas: {
      candidatas: result.metrics.candidates,
      unicas: result.metrics.unique,
      duplicatas: result.metrics.duplicatesRemoved,
      pertinentes: result.metrics.approved,
      selecionadas: result.metrics.selected,
      aplicaveis: result.metrics.applicable,
      contrarias: result.metrics.contrary,
      cobertura: result.metrics.coverage,
      ms: result.metrics.ms,
    },
  }
}

/** Contexto do modelo: caso, consultas e só os precedentes selecionados. */
export function buildStrategyContext(result: RetrievalResult, now: Date): BuiltContext & { refs: Map<string, string> } {
  const registry = new SourceRegistry()
  const refs = new Map<string, string>()
  const precedentes = result.precedents.map((p) => describePrecedent(registry, refs, p, result.analysis, { full: true }))
  return {
    context: {
      data_de_hoje: fmtToday(now),
      base: BASE_NOTE,
      pergunta_do_advogado: result.analysis.question,
      caso: describeCase(result.analysis, { withProcessData: true }),
      pesquisa: {
        consultas_executadas: describeQueries(result),
        candidatas_avaliadas: result.metrics.unique,
        suporte: result.support,
        resultado: retrievalOutcome(result),
      },
      precedentes,
    },
    sources: registry.sources,
    refs,
    basis: `Baseado em ${result.precedents.length} ${result.precedents.length === 1 ? "decisão recuperada" : "decisões recuperadas"} da base de jurisprudência da Íntegra e nos dados do caso.`,
  }
}

/** Texto livre sem referências inventadas; listas de refs só com decisões reais. */
const clean = (text: string, sources: AISources) =>
  stripUnknownRefs(text, sources)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim()

/**
 * Conferência da resposta: referências que não existem saem (e os itens que dependiam
 * só delas); tese favorável sem precedente sai; trecho "literal" que não confere com a
 * decisão vira paráfrase, com nota.
 */
export function finalizeStrategy(data: JurisprudenceStrategy, sources: AISources, decisions: Map<string, JurisprudenceDecision>): JurisprudenceStrategy {
  const known = (ref: string) => keepKnownRefs([ref], sources)[0]
  const jRefs = (list: string[]) => keepKnownRefs(list, sources).filter((r) => sources[r]?.kind === "jurisprudence")
  const decisionOf = (ref: string) => decisions.get(sources[ref]?.id ?? "")
  const t = (text: string) => clean(text, sources)
  const ts = (list: string[]) => list.map(t).filter(Boolean)
  const seen = new Set<string>()
  return {
    sintese: t(data.sintese),
    precedentes: data.precedentes
      .map((p) => ({ ...p, ref: known(p.ref) ?? "" }))
      .filter((p) => p.ref && sources[p.ref]?.kind === "jurisprudence" && !seen.has(p.ref) && !!seen.add(p.ref))
      .map((p) => {
        const decision = decisionOf(p.ref)
        return {
          ref: p.ref,
          por_que_importa: t(p.por_que_importa),
          semelhancas: ts(p.semelhancas),
          distincoes: ts(p.distincoes),
          compatibilidade: t(p.compatibilidade),
          limitacoes: ts(p.limitacoes),
          trechos: p.trechos
            .filter((x) => x.texto.trim())
            .map((x) => {
              if (x.tipo !== "literal") return { texto: t(x.texto), tipo: "parafrase" as const }
              const literal = x.texto.replace(/^[\s"“”'«»]+|[\s"“”'«»]+$/g, "")
              return decision && verifyLiteral(literal, decisionTexts(decision))
                ? { texto: literal, tipo: "literal" as const }
                : { texto: t(literal), tipo: "parafrase" as const, nota: "Apresentado como literal, mas não confere com o texto da decisão na base: tratado como paráfrase." }
            }),
        }
      }),
    teses_favoraveis: data.teses_favoraveis
      .map((x) => ({ ...x, tese: t(x.tese), justificativa: t(x.justificativa), requisitos: ts(x.requisitos), elementos_do_caso: ts(x.elementos_do_caso), refs: jRefs(x.refs), distincoes: ts(x.distincoes), riscos: ts(x.riscos), informacoes_necessarias: ts(x.informacoes_necessarias) }))
      .filter((x) => x.refs.length > 0),
    contrarios_e_distincoes: data.contrarios_e_distincoes
      .map((x) => ({ ref: known(x.ref) ?? "", fundamento_contrario: t(x.fundamento_contrario), distincao_possivel: t(x.distincao_possivel), como_demonstrar: t(x.como_demonstrar) }))
      .filter((x) => x.ref && sources[x.ref]?.kind === "jurisprudence"),
    riscos: data.riscos.map((x) => ({ texto: t(x.texto), refs: jRefs(x.refs) })).filter((x) => x.texto),
    lacunas_probatorias: data.lacunas_probatorias.map((x) => ({ ...x, fato: t(x.fato), observacao: t(x.observacao) })),
    cenarios: data.cenarios.map((x) => ({ se: t(x.se), entao: t(x.entao), refs: jRefs(x.refs) })).filter((x) => x.se && x.entao),
    proximos_pontos: ts(data.proximos_pontos),
    informacoes_ausentes: ts(data.informacoes_ausentes),
  }
}

export async function analyzeJurisprudenceStrategy(deps: AIServiceDeps, input: { question: string; processId?: string }): Promise<JurisprudenceStrategyResult> {
  if (!deps.repo.can("processes.view")) throw new AIError("FORBIDDEN")
  // Processo só do escritório de quem pede (repositório com a sessão e RLS).
  const process = input.processId ? await deps.repo.getProcess(input.processId) : null
  if (input.processId && !process) throw new AIError("NOT_FOUND")
  if (!jurisprudenceConfig().enabled) throw new AIError("INSUFFICIENT_DATA", { message: "A pesquisa de jurisprudência ainda não está configurada no escritório." })

  const result = await retrievePrecedents(
    { question: input.question, process },
    {
      candidates: (groups, filters, limit, options) => deps.repo.jurisprudenceCandidates(groups, filters, limit, options),
      loadFull: (ids) => deps.repo.getJurisprudence(ids),
      signal: deps.signal,
      cacheScope: deps.repo.organizationId,
      cache: deps.jurisprudenceCache,
    },
  )
  ;(deps.jurisprudenceLog ?? logComparative)(result)
  if (result.status === "cancelada" || deps.signal?.aborted) throw new AIError("CANCELLED")

  const now = nowOf(deps)
  const built = buildStrategyContext(result, now)
  const retrieval = retrievalView(result, built.refs)

  // Nada pertinente (ou base fora do ar): resposta da Íntegra, sem modelo e sem custo.
  if (!result.precedents.length || result.status !== "ok") {
    return {
      data: { ...EMPTY, sintese: retrieval.message, informacoes_ausentes: result.analysis.gaps },
      sources: {},
      warnings: [],
      basis: "Resultado da pesquisa na base de jurisprudência da Íntegra (nenhuma decisão foi enviada à IA).",
      generatedAt: now.toISOString(),
      cached: false,
      retrieval,
    }
  }

  const decisions = new Map(result.precedents.map((p) => [p.decision.id, p.decision]))
  const analysis = await runStructured({
    deps,
    operation: "jurisprudence.strategy",
    built,
    task: JURISPRUDENCE_STRATEGY_TASK,
    request: "Faça a análise comparativa do caso com os precedentes recuperados.",
    schema: jurisprudenceStrategySchema,
    alwaysCite: [...built.refs.values()],
    finalize: (data, sources) => finalizeStrategy(data, sources, decisions),
  })
  const contextText = JSON.stringify(built.context)
  const literalDowngrades = analysis.data.precedentes.flatMap((p) => p.trechos).filter((x) => x.nota).length
  return {
    ...analysis,
    warnings: [
      ...analysis.warnings,
      ...citationWarnings(analysis.data, contextText),
      ...(literalDowngrades ? [`${literalDowngrades} trecho(s) apresentado(s) como literal não conferem com a decisão na base e foram marcados como paráfrase.`] : []),
    ],
    retrieval,
  }
}
