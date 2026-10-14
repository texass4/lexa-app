"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/field"
import { aiApi } from "@/lib/ai/client"
import type { AIResult, JurisprudenceAnalysis } from "@/lib/ai/types"
import { AIErrorNotice, AIFooter, AIList, AISection, AIThinking, AIUnavailable } from "@/components/ai/ai-blocks"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useAIAction } from "@/components/ai/use-ai"
import { useOfficeData } from "@/lib/store/office-store"

/**
 * "Análise da Íntegra" de uma decisão: só ao clicar. A decisão vem da base oficial; a IA
 * interpreta e diz o que não consta. Opcionalmente compara com um processo do escritório.
 */
export function DecisionAI({ decisionId, processId, query }: { decisionId: string; processId?: string; query?: string }) {
  const { status, ready } = useLexaAI()
  const data = useOfficeData()
  const analysis = useAIAction<AIResult<JurisprudenceAnalysis>>()
  const [compareWith, setCompareWith] = React.useState(processId ?? "")
  const run = () =>
    analysis.run((signal) => aiApi.jurisprudenceAnalysis({ jurisprudenceId: decisionId, processId: compareWith || undefined, query }, signal))
  const result = analysis.data?.data

  return (
    <section aria-label="Análise da Íntegra" className="ai-surface rounded-[14px] border border-border/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Sparkles className="size-4 text-brand" strokeWidth={1.8} /> Análise da Íntegra
        </p>
        {!(status && !ready) && (
          <Button size="sm" variant="secondary" onClick={run} disabled={!ready || analysis.loading}>
            {result ? "Analisar de novo" : "Analisar com a Íntegra"}
          </Button>
        )}
      </div>
      {status && !ready ? (
        <AIUnavailable status={status} className="mt-3" />
      ) : (
        !result &&
        !analysis.loading && (
          <div className="mt-2 space-y-2">
            <p className="text-[12.5px] text-muted-foreground">Resumo, tese, resultado e fundamentos — só com o que está na decisão.</p>
            {data.processes.length > 0 && (
              <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                Comparar com
                <NativeSelect value={compareWith} onChange={(e) => setCompareWith(e.target.value)} className="h-8 w-auto max-w-full text-[12.5px]">
                  <option value="">nenhum processo</option>
                  {data.processes.slice(0, 300).map((p) => (
                    <option key={p.id} value={p.id}>
                      Processo {p.code}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
          </div>
        )
      )}
      {analysis.error && <AIErrorNotice error={analysis.error} onRetry={run} className="mt-3" />}
      {analysis.loading && <AIThinking label="Lendo a decisão…" onCancel={analysis.cancel} className="mt-3" />}
      {result && !analysis.loading && analysis.data && (
        <div className="mt-3 space-y-4">
          <p className="text-[13.5px] leading-relaxed text-foreground">{result.resumo}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <AISection title="Tese principal">
              <p className="text-[13px] leading-relaxed">{result.tese_principal || "Não consta da decisão."}</p>
            </AISection>
            <AISection title="Resultado">
              <p className="text-[13px] leading-relaxed">{result.resultado || "Não consta da decisão."}</p>
            </AISection>
          </div>
          {result.pontos_relevantes.length > 0 && (
            <AISection title="Pontos relevantes">
              <AIList items={result.pontos_relevantes} />
            </AISection>
          )}
          <AISection title="Fundamentos mencionados na decisão">
            <AIList items={result.fundamentos_mencionados} empty="A decisão não menciona dispositivos, súmulas ou precedentes no texto disponível." />
          </AISection>
          {result.relevancia_para_pesquisa && (
            <AISection title="Por que é relevante">
              <p className="text-[13px] leading-relaxed">{result.relevancia_para_pesquisa}</p>
            </AISection>
          )}
          {result.comparacao_com_processo && (
            <AISection title="Comparação com o processo">
              <p className="text-[13px] leading-relaxed">{result.comparacao_com_processo}</p>
            </AISection>
          )}
          {result.informacoes_ausentes.length > 0 && (
            <AISection title="Não consta da decisão">
              <AIList items={result.informacoes_ausentes} />
            </AISection>
          )}
          <AIFooter result={analysis.data} />
        </div>
      )}
    </section>
  )
}
