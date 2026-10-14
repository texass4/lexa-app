/**
 * "Resumir com a Íntegra" da Consulta processual — sob demanda, sobre o relatório já
 * gravado (nenhuma fonte nova é consultada). Medido como as demais análises.
 */

import { AIError } from "@/lib/ai/errors"
import { buildEnrichmentContext } from "@/lib/ai/context/enrichment"
import { ENRICHMENT_SUMMARY_TASK } from "@/lib/ai/prompts/tasks"
import { enrichmentSummarySchema } from "@/lib/ai/schemas"
import type { AIResult, EnrichmentSummary } from "@/lib/ai/types"
import type { EnrichmentRun } from "@/lib/services/consulta/types"
import { runStructured, withKnownRefs, type AIServiceDeps } from "./run"

export async function summarizeEnrichment(deps: AIServiceDeps, run: EnrichmentRun | null): Promise<AIResult<EnrichmentSummary>> {
  if (!deps.repo.can("processes.view")) throw new AIError("FORBIDDEN")
  if (!run) throw new AIError("NOT_FOUND")
  if (!run.report || run.status === "running") throw new AIError("INSUFFICIENT_DATA")
  const report = run.report

  return runStructured({
    deps,
    operation: "consulta.summary",
    built: buildEnrichmentContext(run),
    task: ENRICHMENT_SUMMARY_TASK,
    request: "Resuma a consulta.",
    schema: enrichmentSummarySchema,
    finalize: (summary, sources) => ({
      ...summary,
      // Fato sem fonte existente não é fato: sai da lista.
      fatos_confirmados: withKnownRefs(summary.fatos_confirmados, sources).filter((f) => f.refs.length > 0),
      inferencias: withKnownRefs(summary.inferencias, sources),
      // O que faltou vem do relatório (determinístico), não do modelo.
      ausentes: report.unavailable.map((u) => `${u.label} — ${u.reason}`),
    }),
  })
}
