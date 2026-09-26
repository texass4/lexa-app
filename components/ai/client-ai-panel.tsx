"use client"

import * as React from "react"
import { FileText, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { aiApi } from "@/lib/ai/client"
import type { AIResult, ClientSummary } from "@/lib/ai/types"
import type { Client } from "@/types"
import { AIErrorNotice, AIFooter, AIText, AIList, AIPanel, AISection, AIThinking, AIUnavailable, AttentionList, NoteList, isAIReady } from "./ai-blocks"
import { AIChatSheet } from "./ai-chat-sheet"
import { useAIAction, useAIChat, useAIStatus } from "./use-ai"

const QUICK_PROMPTS = [
  "Quais processos deste cliente estão ativos?",
  "Existe alguma pendência com este cliente?",
  "Quais são os pontos de atenção?",
  "Há valores em aberto?",
  "Quais são os próximos compromissos?",
]

/** LEXA IA na página do cliente. Montar com `key={client.id}`. */
export function ClientAIPanel({ client }: { client: Client }) {
  const status = useAIStatus()
  const ready = isAIReady(status)
  const summary = useAIAction<AIResult<ClientSummary>>()
  const chat = useAIChat({ type: "client", id: client.id })
  const [chatOpen, setChatOpen] = React.useState(false)
  const run = () => summary.run((signal) => aiApi.clientSummary(client.id, signal))
  const result = summary.data

  return (
    <>
      <AIPanel
        description="Panorama do cliente a partir dos processos, tarefas, agenda e financeiro registrados."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={run} disabled={!ready || summary.loading}>
              <FileText /> Resumo do cliente
            </Button>
            <Button size="sm" onClick={() => setChatOpen(true)} disabled={!ready}>
              <MessageSquare /> Perguntar à LEXA
            </Button>
          </>
        }
      >
        {status && !ready && (
          <div className="px-5 pb-5">
            <AIUnavailable status={status} />
          </div>
        )}
        {(summary.loading || summary.error || result) && (
          <div className="space-y-5 border-t border-border px-5 pt-4 pb-5">
            {summary.error && <AIErrorNotice error={summary.error} onRetry={run} />}
            {summary.loading && <AIThinking label="LEXA IA está analisando o cliente…" onCancel={summary.cancel} />}
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

      <AIChatSheet open={chatOpen} onOpenChange={setChatOpen} chat={chat} subtitle={client.name} quickPrompts={QUICK_PROMPTS} status={status} />
    </>
  )
}
