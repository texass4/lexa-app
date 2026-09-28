/** LEXA IA no cliente: panorama a partir dos dados reais do cadastro. */

import { AIError } from "@/lib/ai/errors"
import { keepKnownNotes } from "@/lib/ai/grounding"
import { buildClientContext, loadClientData } from "@/lib/ai/context/client"
import { CLIENT_SUMMARY_TASK } from "@/lib/ai/prompts/tasks"
import { clientSummarySchema } from "@/lib/ai/schemas"
import type { AIResult, ClientSummary } from "@/lib/ai/types"
import { nowOf, runStructured, withKnownRefs, type AIServiceDeps } from "./run"

export async function summarizeClient(deps: AIServiceDeps, clientId: string): Promise<AIResult<ClientSummary>> {
  const data = await loadClientData(deps.repo, clientId)
  const hasData = data.processes.length || data.tasks.length || data.appointments.length || data.invoices.length || data.activities.length
  if (!hasData) throw new AIError("INSUFFICIENT_DATA")

  return runStructured({
    deps,
    operation: "client.summary",
    built: buildClientContext(data, nowOf(deps)),
    task: CLIENT_SUMMARY_TASK,
    request: "Gere o panorama deste cliente.",
    schema: clientSummarySchema,
    finalize: (summary, sources) => ({
      ...summary,
      processos: keepKnownNotes(summary.processos, sources),
      pontos_atencao: withKnownRefs(summary.pontos_atencao, sources),
    }),
  })
}
