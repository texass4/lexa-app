"use client"

import { ArrowUpRight, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { aiApi } from "@/lib/ai/client"
import type { OfficeMetrics, OfficeOverviewResult } from "@/lib/ai/types"
import { formatCurrency } from "@/lib/format"
import { AIErrorNotice, AIFooter, AIText, AIList, AIPanel, AISection, AIThinking, AIUnavailable, AttentionList, NoteList } from "./ai-blocks"
import { OFFICE_PROMPTS, officeContext } from "./ai-context"
import { useLexaAI } from "./lexa-ai-provider"
import { useAIAction } from "./use-ai"

/** O panorama estruturado tem botão próprio; as demais perguntas vão para a conversa. */
const SHORTCUTS = OFFICE_PROMPTS.filter((prompt) => !prompt.startsWith("Faça um panorama"))

/** Números exibidos direto do cálculo do LEXA — não do texto do modelo. */
function metricItems(m: OfficeMetrics) {
  return [
    m.processes && { label: "Processos ativos", value: String(m.processes.active), hint: `${m.processes.movedLast7Days} com movimentação em 7 dias` },
    m.processes && { label: "Sem movimentação há +60 dias", value: String(m.processes.staleOver60Days), hint: "processos ativos" },
    m.tasks && { label: "Tarefas atrasadas", value: String(m.tasks.overdue), hint: `${m.tasks.open} abertas` },
    m.agenda && { label: "Compromissos em 7 dias", value: String(m.agenda.next7Days), hint: `${m.agenda.today} hoje` },
    m.finance && {
      label: "Em atraso",
      value: formatCurrency(m.finance.overdueAmount),
      hint: `${m.finance.clientsWithOverdue} cliente(s) · ${formatCurrency(m.finance.openAmount)} em aberto`,
    },
  ].filter((item): item is { label: string; value: string; hint: string } => !!item)
}

export function OfficeAIPanel() {
  const lexa = useLexaAI()
  const { status, ready } = lexa
  const overview = useAIAction<OfficeOverviewResult>()
  const run = () => overview.run((signal) => aiApi.officeOverview(signal))
  const result = overview.data
  const context = officeContext("dashboard")

  return (
    <AIPanel
      title="Pergunte sobre seu escritório"
      description="A LEXA lê processos, tarefas, agenda e financeiro e responde citando as fontes."
      actions={
        <Button variant="secondary" size="sm" onClick={run} disabled={!ready || overview.loading}>
          <LayoutDashboard /> {result ? "Atualizar panorama" : "Panorama do escritório"}
        </Button>
      }
    >
      {status && !ready ? (
        <div className="px-5 pb-5">
          <AIUnavailable status={status} />
        </div>
      ) : (
        <div className="space-y-3 px-5 pb-4">
          <button
            type="button"
            onClick={() => lexa.open(context)}
            className="group flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 text-left text-[13px] text-subtle shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <span className="min-w-0 flex-1 truncate">Pergunte sobre prazos, clientes, tarefas ou valores…</span>
            <ArrowUpRight className="size-4 shrink-0 transition-colors group-hover:text-gold-dark" />
          </button>
          <div className="flex flex-wrap gap-1.5">
            {SHORTCUTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => lexa.ask(prompt, context)}
                className="h-7 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted-foreground outline-none transition-[border-color,color,transform] hover:border-gold/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 active:scale-[0.97]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {(overview.loading || overview.error || result) && (
        <div className="space-y-5 border-t border-border px-5 pt-4 pb-5">
          {overview.error && <AIErrorNotice error={overview.error} onRetry={run} />}
          {overview.loading && <AIThinking label="LEXA está analisando os dados do escritório…" onCancel={overview.cancel} />}
          {result && !overview.loading && (
            <>
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
                {metricItems(result.metrics).map((item) => (
                  <div key={item.label} className="min-w-0 rounded-[12px] border border-border bg-surface-muted/35 px-3 py-2.5">
                    <dt className="truncate text-[11.5px] text-muted-foreground">{item.label}</dt>
                    <dd className="tabular mt-1 truncate text-[18px] font-semibold tracking-[-0.02em] text-foreground">{item.value}</dd>
                    <dd className="mt-0.5 truncate text-[11px] text-subtle">{item.hint}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[14px] leading-relaxed text-foreground">
                <AIText text={result.data.visao_geral} sources={result.sources} />
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  <AISection title="Pontos de atenção">
                    <AttentionList points={result.data.pontos_atencao} sources={result.sources} />
                  </AISection>
                  {result.data.processos_para_analise.length > 0 && (
                    <AISection title="Processos que merecem análise">
                      <NoteList notes={result.data.processos_para_analise} sources={result.sources} />
                    </AISection>
                  )}
                  {result.data.pendencias.length > 0 && (
                    <AISection title="Pendências">
                      <AIList items={result.data.pendencias} sources={result.sources} />
                    </AISection>
                  )}
                </div>
                <div className="space-y-5">
                  {result.data.tarefas_atrasadas && (
                    <AISection title="Tarefas atrasadas">
                      <p className="text-[13px] leading-relaxed text-foreground">
                        <AIText text={result.data.tarefas_atrasadas} sources={result.sources} />
                      </p>
                    </AISection>
                  )}
                  {result.data.situacao_financeira && (
                    <AISection title="Situação financeira">
                      <p className="text-[13px] leading-relaxed text-foreground">
                        <AIText text={result.data.situacao_financeira} sources={result.sources} />
                      </p>
                    </AISection>
                  )}
                  {result.data.sugestoes_organizacao.length > 0 && (
                    <AISection title="Sugestões de organização">
                      <AIList items={result.data.sugestoes_organizacao} sources={result.sources} />
                    </AISection>
                  )}
                  {result.data.perguntas_para_verificar.length > 0 && (
                    <AISection title="Perguntas para verificar">
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
