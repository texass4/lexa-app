"use client"

import { FileText, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SignalList } from "@/components/shared/signal-list"
import { aiApi } from "@/lib/ai/client"
import type { AIResult, ClientSummary } from "@/lib/ai/types"
import type { AttentionSignal } from "@/lib/attention"
import type { Client } from "@/types"
import { AIErrorNotice, AIFooter, AIText, AIList, AIPanel, AISection, AIThinking, AIUnavailable, AttentionList, NoteList } from "./ai-blocks"
import { CLIENT_PROMPTS, clientContext } from "./ai-context"
import { useLexaAI } from "./lexa-ai-provider"
import { useAIAction } from "./use-ai"

/** O resumo estruturado tem botão próprio; as demais perguntas vão para a conversa. */
const SHORTCUTS = CLIENT_PROMPTS.filter((prompt) => !prompt.startsWith("Resuma"))

const headline = (count: number) =>
  count === 0 ? "Nada pede atenção agora" : count === 1 ? "1 ponto merece sua atenção" : `${count} pontos merecem sua atenção`

/**
 * Inteligência do cliente: primeiro o que os dados já mostram (sinais), depois
 * a interpretação da LEXA IA, sob demanda. Montar com `key={client.id}`.
 */
export function ClientAIPanel({ client, signals }: { client: Client; signals: AttentionSignal[] }) {
  const lexa = useLexaAI()
  const { status, ready } = lexa
  const summary = useAIAction<AIResult<ClientSummary>>()
  const run = () => summary.run((signal) => aiApi.clientSummary(client.id, signal))
  const result = summary.data
  const context = clientContext(client.id, client.name)
  const visible = signals.slice(0, 4)

  return (
    <AIPanel
      title="Como está este cliente?"
      description={
        signals.length
          ? `${headline(signals.length)} — a partir de processos, tarefas e financeiro.`
          : "Sem prazos próximos, atrasos ou valores vencidos nos dados do cliente."
      }
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={run} disabled={!ready || summary.loading}>
            <FileText /> {result ? "Atualizar análise" : "Ver análise da LEXA"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => lexa.open(context)}>
            <MessageSquare /> Perguntar
          </Button>
        </>
      }
    >
      {visible.length > 0 && (
        <div className="px-3 pb-3">
          <SignalList signals={visible} />
          {signals.length > visible.length && <p className="px-2 pt-1 text-[12px] text-subtle">e mais {signals.length - visible.length}</p>}
        </div>
      )}
      {status && !ready ? (
        <div className="px-5 pb-5">
          <AIUnavailable status={status} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3">
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
      )}
      {(summary.loading || summary.error || result) && (
        <div className="space-y-5 border-t border-border px-5 pt-4 pb-5">
          {summary.error && <AIErrorNotice error={summary.error} onRetry={run} />}
          {summary.loading && <AIThinking label={`LEXA está analisando ${client.name}…`} onCancel={summary.cancel} />}
          {result && !summary.loading && (
            <>
              <p className="text-[14px] leading-relaxed text-foreground">
                <AIText text={result.data.resumo} sources={result.sources} />
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  {result.data.processos.length > 0 && (
                    <AISection title="Processos">
                      <NoteList notes={result.data.processos} sources={result.sources} />
                    </AISection>
                  )}
                  {result.data.atividades_recentes.length > 0 && (
                    <AISection title="Atividades recentes">
                      <AIList items={result.data.atividades_recentes} sources={result.sources} />
                    </AISection>
                  )}
                  {result.data.pendencias.length > 0 && (
                    <AISection title="Pendências">
                      <AIList items={result.data.pendencias} sources={result.sources} />
                    </AISection>
                  )}
                </div>
                <div className="space-y-5">
                  <AISection title="Pontos de atenção">
                    <AttentionList points={result.data.pontos_atencao} sources={result.sources} />
                  </AISection>
                  {result.data.proximas_acoes.length > 0 && (
                    <AISection title="Próximas ações sugeridas">
                      <AIList items={result.data.proximas_acoes} sources={result.sources} />
                    </AISection>
                  )}
                  {result.data.informacoes_ausentes.length > 0 && (
                    <AISection title="Informações que faltam">
                      <AIList items={result.data.informacoes_ausentes} sources={result.sources} />
                    </AISection>
                  )}
                </div>
              </div>
              <AIFooter result={result} confidence={result.data.nivel_confianca} />
            </>
          )}
        </div>
      )}
    </AIPanel>
  )
}
