/**
 * LEXA IA no processo: resumo, análise de movimentação e próximos passos.
 * Nenhuma função aqui grava dados — sugestões de tarefa só viram tarefa
 * quando o usuário confirma no formulário normal do LEXA.
 */

import { AIError } from "@/lib/ai/errors"
import { keepKnownNotes } from "@/lib/ai/grounding"
import { buildMovementContext, buildProcessContext, loadProcessData, type ProcessData } from "@/lib/ai/context/process"
import { MOVEMENT_ANALYSIS_TASK, NEXT_ACTIONS_TASK, PROCESS_SUMMARY_TASK } from "@/lib/ai/prompts/tasks"
import { movementAnalysisSchema, nextActionsSchema, processSummarySchema } from "@/lib/ai/schemas"
import type { AIResult, MovementAnalysis, NextActions, ProcessSummary } from "@/lib/ai/types"
import { nowOf, runStructured, withKnownRefs, type AIServiceDeps } from "./run"

/** Sem movimentações, tarefas nem compromissos não há o que analisar — e não se gasta uma chamada. */
function assertEnoughData(data: ProcessData) {
  if (!data.process.movements.length && !data.tasks.length && !data.appointments.length) throw new AIError("INSUFFICIENT_DATA")
}

export async function summarizeProcess(deps: AIServiceDeps, processId: string): Promise<AIResult<ProcessSummary>> {
  const data = await loadProcessData(deps.repo, processId)
  assertEnoughData(data)
  return runStructured({
    deps,
    operation: "process.summary",
    built: buildProcessContext(data, nowOf(deps)),
    task: PROCESS_SUMMARY_TASK,
    request: "Resuma este processo.",
    schema: processSummarySchema,
    finalize: (summary, sources) => ({
      ...summary,
      movimentacoes_relevantes: keepKnownNotes(summary.movimentacoes_relevantes, sources),
      pontos_atencao: withKnownRefs(summary.pontos_atencao, sources),
    }),
  })
}

export async function analyzeMovement(deps: AIServiceDeps, processId: string, movementId: string): Promise<AIResult<MovementAnalysis>> {
  const data = await loadProcessData(deps.repo, processId)
  const built = buildMovementContext(data, movementId, nowOf(deps))
  const targetRef = Object.values(built.sources).find((s) => s.kind === "movement" && s.id === movementId)?.ref
  return runStructured({
    deps,
    operation: "process.movement",
    built,
    task: MOVEMENT_ANALYSIS_TASK,
    request: targetRef ? `Analise a movimentação ${targetRef}.` : "Analise a movimentação indicada.",
    schema: movementAnalysisSchema,
    finalize: (analysis, sources) => ({ ...analysis, sugestoes_tarefa: withKnownRefs(analysis.sugestoes_tarefa, sources) }),
    alwaysCite: targetRef ? [targetRef] : [],
  })
}

export async function suggestNextActions(deps: AIServiceDeps, processId: string): Promise<AIResult<NextActions>> {
  const data = await loadProcessData(deps.repo, processId)
  assertEnoughData(data)
  return runStructured({
    deps,
    operation: "process.next-actions",
    built: buildProcessContext(data, nowOf(deps)),
    task: NEXT_ACTIONS_TASK,
    request: "Quais são os pontos de atenção e os próximos passos sugeridos para este processo?",
    schema: nextActionsSchema,
    finalize: (result, sources) => ({
      ...result,
      pontos_atencao: withKnownRefs(result.pontos_atencao, sources),
      sugestoes: withKnownRefs(result.sugestoes, sources),
    }),
  })
}
