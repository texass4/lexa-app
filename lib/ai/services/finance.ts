/** Análise do financeiro: números das faturas, interpretação da IA. */

import { AIError } from "@/lib/ai/errors"
import { buildFinanceContext, loadFinanceData } from "@/lib/ai/context/finance"
import { FINANCE_ANALYSIS_TASK } from "@/lib/ai/prompts/tasks"
import { financeAnalysisSchema } from "@/lib/ai/schemas"
import type { FinanceAnalysisResult } from "@/lib/ai/types"
import { nowOf, runStructured, withKnownRefs, type AIServiceDeps } from "./run"

export async function financeAnalysis(deps: AIServiceDeps): Promise<FinanceAnalysisResult> {
  // A rota já exige `finance.view`; o repositório também não lê faturas sem ela.
  if (!deps.repo.can("finance.view")) throw new AIError("FORBIDDEN")
  const now = nowOf(deps)
  const data = await loadFinanceData(deps.repo, now)
  if (!data.invoices.some((i) => i.status !== "cancelado")) throw new AIError("INSUFFICIENT_DATA")

  const built = buildFinanceContext(data, now)
  const result = await runStructured({
    deps,
    operation: "finance.analysis",
    built,
    task: FINANCE_ANALYSIS_TASK,
    request: "Interprete o financeiro do escritório.",
    schema: financeAnalysisSchema,
    finalize: (analysis, sources) => ({ ...analysis, pontos_atencao: withKnownRefs(analysis.pontos_atencao, sources) }),
  })
  // Os números exibidos vêm do cálculo da Íntegra, não do texto do modelo.
  return { ...result, metrics: built.metrics }
}
