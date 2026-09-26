"use client"

import * as React from "react"
import { LayoutDashboard, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { aiApi } from "@/lib/ai/client"
import type { OfficeMetrics, OfficeOverviewResult } from "@/lib/ai/types"
import { formatCurrency } from "@/lib/format"
import { AIErrorNotice, AIFooter, AIText, AIList, AIPanel, AISection, AIThinking, AIUnavailable, AttentionList, NoteList, isAIReady } from "./ai-blocks"
import { AIChatSheet } from "./ai-chat-sheet"
import { useAIAction, useAIChat, useAIStatus } from "./use-ai"

const QUICK_PROMPTS = [
  "Quantos processos estão ativos?",
  "Quais tarefas estão atrasadas?",
  "Quais processos tiveram movimentação esta semana?",
  "Quais processos não tiveram movimentação recente?",
  "Quais clientes possuem processos ativos?",
]

/** Atalhos que abrem o chat já com a pergunta (sempre por clique). */
const SHORTCUTS = [
  { label: "Tarefas atrasadas", prompt: "Quais tarefas estão atrasadas?" },
  { label: "Processos com movimentação recente", prompt: "Quais processos tiveram movimentação nos últimos 7 dias?" },
  { label: "Processos sem movimentação recente", prompt: "Quais processos ativos estão sem movimentação recente?" },
]

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
  const status = useAIStatus()
  const ready = isAIReady(status)
  const overview = useAIAction<OfficeOverviewResult>()
  const chat = useAIChat({ type: "office" })
  const [chatOpen, setChatOpen] = React.useState(false)
  const run = () => overview.run((signal) => aiApi.officeOverview(signal))
  const result = overview.data

  const ask = (prompt: string) => {
    setChatOpen(true)
    chat.send(prompt)
  }

  return (
    <>
      <AIPanel
        title="Panorama com LEXA IA"
        description="Métricas calculadas pelo LEXA, interpretadas pela IA."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={run} disabled={!ready || overview.loading}>
              <LayoutDashboard /> Panorama do escritório
            </Button>
            <Button size="sm" onClick={() => setChatOpen(true)} disabled={!ready}>
              <MessageSquare /> Perguntar à LEXA
            </Button>
          </>
        }
      >
        {status && !ready ? (
          <div className="px-5 pb-5">
            <AIUnavailable status={status} />
          </div>
        ) : (
          <div className="-mt-1 flex flex-wrap gap-1.5 px-5 pb-4">
            {SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => ask(shortcut.prompt)}
                disabled={chat.pending}
                className="h-7 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-50"
              >
                {shortcut.label}
              </button>
            ))}
          </div>
        )}

        {(overview.loading || overview.error || result) && (
          <div className="space-y-5 border-t border-border px-5 pt-4 pb-5">
            {overview.error && <AIErrorNotice error={overview.error} onRetry={run} />}
            {overview.loading && <AIThinking label="LEXA IA está analisando o escritório…" onCancel={overview.cancel} />}
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

      <AIChatSheet open={chatOpen} onOpenChange={setChatOpen} chat={chat} subtitle="Escritório" quickPrompts={QUICK_PROMPTS} status={status} />
    </>
  )
}
