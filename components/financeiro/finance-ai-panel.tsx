"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { aiApi } from "@/lib/ai/client"
import type { FinanceAnalysisResult } from "@/lib/ai/types"
import { AIErrorNotice, AIFooter, AIList, AIPanel, AISection, AIText, AIThinking, AIUnavailable, AttentionList } from "@/components/ai/ai-blocks"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useAIAction } from "@/components/ai/use-ai"

/**
 * "Análise da Íntegra" no Financeiro: sob demanda, interpreta os números calculados
 * das faturas (atrasos por cliente, próximos 30 dias, mesmo período do mês anterior).
 * Não é uma conversa e não altera nada — os números da tela continuam vindo do cálculo.
 */
export function FinanceAIPanel() {
  const { status, ready } = useLexaAI()
  const analysis = useAIAction<FinanceAnalysisResult>()
  const run = () => analysis.run((signal) => aiApi.financeAnalysis(signal))
  const result = analysis.data

  return (
    <AIPanel
      title="Análise da Íntegra"
      description="Lê os lançamentos registrados e aponta o que merece ação: atrasos, próximos recebimentos e a comparação com o mês anterior."
      actions={
        !(status && !ready) && (
          <Button variant="secondary" size="sm" onClick={run} disabled={!ready || analysis.loading}>
            <Sparkles /> {result ? "Atualizar análise" : "Analisar o financeiro"}
          </Button>
        )
      }
    >
      {status && !ready && (
        <div className="px-5 pb-5 sm:px-6">
          <AIUnavailable status={status} />
        </div>
      )}
      {(analysis.loading || analysis.error || result) && (
        <div className="space-y-5 border-t border-border px-5 pt-4 pb-5 sm:px-6">
          {analysis.error && <AIErrorNotice error={analysis.error} onRetry={run} />}
          {analysis.loading && <AIThinking label="Lendo os lançamentos do escritório…" onCancel={analysis.cancel} />}
          {result && !analysis.loading && (
            <>
              <p className="max-w-3xl text-[14px] leading-relaxed text-foreground">
                <AIText text={result.data.leitura} sources={result.sources} />
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                {result.data.pontos_atencao.length > 0 && (
                  <AISection title="Pontos de atenção">
                    <AttentionList points={result.data.pontos_atencao} sources={result.sources} />
                  </AISection>
                )}
                <div className="space-y-5">
                  {result.data.sugestoes.length > 0 && (
                    <AISection title="Próximos passos sugeridos">
                      <AIList items={result.data.sugestoes} sources={result.sources} />
                    </AISection>
                  )}
                  {result.data.perguntas_para_verificar.length > 0 && (
                    <AISection title="Para conferir">
                      <AIList items={result.data.perguntas_para_verificar} sources={result.sources} />
                    </AISection>
                  )}
                </div>
              </div>
              <AIFooter result={result} />
            </>
          )}
        </div>
      )}
    </AIPanel>
  )
}
