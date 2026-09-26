"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { aiApi } from "@/lib/ai/client"
import type { ActionSuggestion, AIResult, MovementAnalysis } from "@/lib/ai/types"
import { AIErrorNotice, AIFooter, AIList, AIText, AISection, AIThinking, AIUnavailable, SuggestionList, isAIReady } from "./ai-blocks"
import { useAIAction, useAIStatus } from "./use-ai"

/**
 * "Analisar com LEXA IA" dentro do detalhe da movimentação. Montar com
 * `key={movement.id}`: cada movimentação tem sua própria análise.
 */
export function MovementAISection({
  processId,
  movementId,
  onCreateTask,
}: {
  processId: string
  movementId: string
  onCreateTask?: (suggestion: ActionSuggestion) => void
}) {
  const status = useAIStatus()
  const ready = isAIReady(status)
  const analysis = useAIAction<AIResult<MovementAnalysis>>()
  const run = () => analysis.run((signal) => aiApi.analyzeMovement(processId, movementId, signal))
  const result = analysis.data

  return (
    <section className="rounded-[12px] border border-border">
      <div className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">LEXA IA</p>
          <p className="text-[12px] text-muted-foreground">Explica o registro sem ir além do que ele informa.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={run} disabled={!ready || analysis.loading} className="shrink-0 self-start sm:self-auto">
          <Sparkles /> {result ? "Analisar de novo" : "Analisar com LEXA IA"}
        </Button>
      </div>

      {(status && !ready) || analysis.loading || analysis.error || result ? (
        <div className="space-y-4 border-t border-border px-3.5 pt-3.5 pb-4">
          {status && !ready && <AIUnavailable status={status} />}
          {analysis.error && <AIErrorNotice error={analysis.error} onRetry={run} />}
          {analysis.loading && <AIThinking label="LEXA IA está analisando a movimentação…" onCancel={analysis.cancel} />}
          {result && !analysis.loading && (
            <>
              <p className="text-[13.5px] leading-relaxed text-foreground">
                <AIText text={result.data.o_que_aconteceu} sources={result.sources} />
              </p>
              <AISection title="O que o registro informa">
                <AIList items={result.data.o_que_o_registro_informa} sources={result.sources} />
              </AISection>
              <AISection title="O que não é possível concluir">
                <AIList items={result.data.o_que_nao_e_possivel_concluir} empty="Nada relevante a destacar." sources={result.sources} />
              </AISection>
              {result.data.pontos_atencao.length > 0 && (
                <AISection title="Pontos de atenção">
                  <AIList items={result.data.pontos_atencao} sources={result.sources} />
                </AISection>
              )}
              {result.data.sugestoes_tarefa.length > 0 && (
                <AISection title="Tarefa sugerida">
                  <SuggestionList suggestions={result.data.sugestoes_tarefa} sources={result.sources} onCreate={onCreateTask} />
                </AISection>
              )}
              <AIFooter result={result} confidence={result.data.nivel_confianca} />
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
