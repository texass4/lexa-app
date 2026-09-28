/** Panorama do escritório: números do banco, interpretação da IA. */

import { AIError } from "@/lib/ai/errors"
import { keepKnownNotes } from "@/lib/ai/grounding"
import { buildOfficeContext, loadOfficeData } from "@/lib/ai/context/office"
import { OFFICE_OVERVIEW_TASK } from "@/lib/ai/prompts/tasks"
import { officeOverviewSchema } from "@/lib/ai/schemas"
import type { OfficeOverviewResult } from "@/lib/ai/types"
import { nowOf, runStructured, withKnownRefs, type AIServiceDeps } from "./run"

export async function officeOverview(deps: AIServiceDeps): Promise<OfficeOverviewResult> {
  const data = await loadOfficeData(deps.repo)
  if (!data.clients.length && !data.processes.length && !data.tasks.length && !data.appointments.length && !data.invoices.length) {
    throw new AIError("INSUFFICIENT_DATA")
  }

  const built = buildOfficeContext(data, nowOf(deps))
  const result = await runStructured({
    deps,
    operation: "office.overview",
    built,
    task: OFFICE_OVERVIEW_TASK,
    request: "Gere o panorama do escritório.",
    schema: officeOverviewSchema,
    finalize: (overview, sources) => ({
      ...overview,
      processos_para_analise: keepKnownNotes(overview.processos_para_analise, sources),
      pontos_atencao: withKnownRefs(overview.pontos_atencao, sources),
    }),
  })
  // As métricas exibidas vêm do cálculo do LEXA, não do texto do modelo.
  return { ...result, metrics: built.metrics }
}
