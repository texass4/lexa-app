/**
 * Análise da Íntegra sobre jurisprudência — sempre sob demanda, sobre decisões reais
 * da base (nunca geradas). Medida em `usage_events` pelo `runStructured`, como as
 * demais análises.
 */

import { AIError } from "@/lib/ai/errors"
import { buildDecisionContext, buildRelatedContext } from "@/lib/ai/context/jurisprudence"
import { JURISPRUDENCE_ANALYSIS_TASK, RELATED_JURISPRUDENCE_TASK } from "@/lib/ai/prompts/tasks"
import { jurisprudenceAnalysisSchema, relatedJurisprudenceSchema } from "@/lib/ai/schemas"
import type { AIResult, JurisprudenceAnalysis, RelatedJurisprudenceAnalysis, Similarity } from "@/lib/ai/types"
import { nowOf, runStructured, type AIServiceDeps } from "./run"

/** Até quantas decisões entram numa comparação com o processo. */
export const RELATED_MAX = 10

function requireView(deps: AIServiceDeps) {
  if (!deps.repo.can("processes.view")) throw new AIError("FORBIDDEN")
}

export async function analyzeJurisprudence(
  deps: AIServiceDeps,
  input: { jurisprudenceId: string; processId?: string; query?: string },
): Promise<AIResult<JurisprudenceAnalysis>> {
  requireView(deps)
  const [decision] = await deps.repo.getJurisprudence([input.jurisprudenceId])
  if (!decision) throw new AIError("NOT_FOUND")
  const process = input.processId ? await deps.repo.getProcess(input.processId) : null
  if (input.processId && !process) throw new AIError("NOT_FOUND")

  const built = buildDecisionContext(decision, { now: nowOf(deps), query: input.query, process })
  return runStructured({
    deps,
    operation: "jurisprudence.analysis",
    built,
    task: JURISPRUDENCE_ANALYSIS_TASK,
    request: "Interprete a decisão.",
    schema: jurisprudenceAnalysisSchema,
    alwaysCite: ["J1"],
    // Sem processo, não há comparação — mesmo que o modelo escreva alguma.
    finalize: (analysis) => (process ? analysis : { ...analysis, comparacao_com_processo: "" }),
  })
}

export interface RelatedAnalysisResult extends AIResult<RelatedJurisprudenceAnalysis> {
  /** Contagem por semelhança, das referências válidas (não do texto do modelo). */
  counts: Record<Similarity, number>
  analyzed: number
}

export async function analyzeRelatedJurisprudence(deps: AIServiceDeps, input: { processId: string; ids: string[] }): Promise<RelatedAnalysisResult> {
  requireView(deps)
  const process = await deps.repo.getProcess(input.processId)
  if (!process) throw new AIError("NOT_FOUND")
  const decisions = await deps.repo.getJurisprudence(input.ids.slice(0, RELATED_MAX))
  if (!decisions.length) throw new AIError("INSUFFICIENT_DATA")

  const built = buildRelatedContext(process, decisions, nowOf(deps))
  const result = await runStructured({
    deps,
    operation: "jurisprudence.related",
    built,
    task: RELATED_JURISPRUDENCE_TASK,
    request: "Compare o processo com as decisões encontradas.",
    schema: relatedJurisprudenceSchema,
    finalize: (analysis, sources) => {
      // Só referências que existem e uma vez cada: nada de decisão inventada.
      const seen = new Set<string>()
      const decisoes = analysis.decisoes
        .map((d) => ({ ...d, ref: d.ref.trim().replace(/^\[|\]$/g, "").toUpperCase() }))
        .filter((d) => sources[d.ref]?.kind === "jurisprudence" && !seen.has(d.ref) && seen.add(d.ref))
      return { ...analysis, decisoes }
    },
  })
  const counts: Record<Similarity, number> = { alta: 0, media: 0, baixa: 0 }
  for (const d of result.data.decisoes) counts[d.semelhanca] += 1
  return { ...result, counts, analyzed: decisions.length }
}
