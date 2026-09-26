"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, FileText, ListChecks, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SignalList } from "@/components/shared/signal-list"
import { MovementDetailSheet } from "@/components/processos/movement-detail-sheet"
import { aiApi } from "@/lib/ai/client"
import type { ActionSuggestion, AIResult, AISource, NextActions, ProcessSummary } from "@/lib/ai/types"
import type { AttentionSignal } from "@/lib/attention"
import { interpretMovement, type LexaMovement } from "@/lib/services/processes/movement-interpreter"
import { useSession } from "@/lib/auth/session"
import type { Client, Process } from "@/types"
import {
  AIErrorNotice,
  AIText,
  AIFooter,
  AIList,
  AIPanel,
  AISection,
  AIThinking,
  AIUnavailable,
  AttentionList,
  NoteList,
  SuggestionList,
} from "./ai-blocks"
import { PROCESS_PROMPTS, processContext } from "./ai-context"
import { useAISourceHandler, useLexaAI } from "./lexa-ai-provider"
import { useAIAction, useCreateTaskFromSuggestion } from "./use-ai"

type View = "summary" | "next"

/** Resumo e próximos passos têm botões próprios (análise estruturada); o resto vai para a conversa. */
const SHORTCUTS = PROCESS_PROMPTS.filter((prompt) => !prompt.startsWith("Resuma") && !prompt.startsWith("Sugira"))

/**
 * Inteligência do processo: o que os dados já mostram (sinais) e, sob demanda,
 * a interpretação da LEXA IA. Montar com `key={process.id}`: cada processo tem
 * suas próprias análises. Nada é chamado sem clique.
 */
export function ProcessAIPanel({ process, client, signals }: { process: Process; client?: Client; signals: AttentionSignal[] }) {
  const lexa = useLexaAI()
  const { status, ready } = lexa
  const summary = useAIAction<AIResult<ProcessSummary>>()
  const next = useAIAction<AIResult<NextActions>>()
  const [view, setView] = React.useState<View>("summary")
  const [movement, setMovement] = React.useState<LexaMovement | null>(null)
  const [movementOpen, setMovementOpen] = React.useState(false)
  const createTask = useCreateTaskFromSuggestion({ processId: process.id })
  const { can } = useSession()
  const router = useRouter()
  const context = processContext(process.id, process.code)

  /** Movimentação abre o detalhe aqui mesmo; as demais fontes levam ao registro. */
  const openSource = React.useCallback(
    (source: AISource) => {
      const found = source.kind === "movement" ? process.movements.find((m) => m.id === source.id) : undefined
      if (found) {
        setMovement(interpretMovement(found, process.id))
        setMovementOpen(true)
      } else if (source.href) {
        router.push(source.href)
      }
    },
    [process.movements, process.id, router],
  )
  // Fontes citadas na conversa global também abrem aqui.
  useAISourceHandler(openSource)

  const runSummary = () => {
    setView("summary")
    summary.run((signal) => aiApi.processSummary(process.id, signal))
  }
  const runNext = () => {
    setView("next")
    next.run((signal) => aiApi.nextActions(process.id, signal))
  }

  const active = view === "summary" ? summary : next
  const hasAny = summary.data || next.data || summary.loading || next.loading || summary.error || next.error

  return (
    <>
      <AIPanel
        title="O que está acontecendo neste processo?"
        description={
          signals.length
            ? `${signals.length === 1 ? "1 ponto merece" : `${signals.length} pontos merecem`} sua atenção nos dados deste processo.`
            : "Nenhum prazo próximo, atraso ou paralisação nos dados deste processo."
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={runSummary} disabled={!ready || summary.loading}>
              <FileText /> Resumir processo
            </Button>
            <Button variant="secondary" size="sm" onClick={runNext} disabled={!ready || next.loading}>
              <ListChecks /> O que fazer agora
            </Button>
            <Button variant="ghost" size="sm" onClick={() => lexa.open(context)}>
              <MessageSquare /> Perguntar
            </Button>
          </>
        }
      >
        {signals.length > 0 && (
          <div className="px-3 pb-3">
            <SignalList signals={signals} linked={false} />
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

        {hasAny && (
          <div className="space-y-5 border-t border-border px-5 pt-4 pb-5">
            {(summary.data || summary.loading) && (next.data || next.loading) && (
              <FilterTabs
                ariaLabel="Análises da LEXA IA"
                layoutId="process-ai-view"
                value={view}
                onChange={setView}
                options={[
                  { value: "summary", label: "Resumo" },
                  { value: "next", label: "Próximos passos" },
                ]}
              />
            )}

            {active.error && <AIErrorNotice error={active.error} onRetry={view === "summary" ? runSummary : runNext} />}
            {active.loading && (
              <AIThinking
                label={view === "summary" ? `LEXA está analisando o processo ${process.code}…` : "LEXA está verificando o que fazer agora…"}
                onCancel={active.cancel}
              />
            )}

            {view === "summary" && summary.data && !summary.loading && <SummaryView result={summary.data} onOpen={openSource} />}
            {view === "next" && next.data && !next.loading && <NextView result={next.data} onOpen={openSource} onCreate={createTask} />}
          </div>
        )}

        {client && can("clients.view") && (
          <div className="border-t border-border px-5 py-3">
            <Link
              href={`/clientes/${client.id}`}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
            >
              Como está o cliente {client.name}? <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        )}
      </AIPanel>

      <MovementDetailSheet movement={movement} open={movementOpen} onOpenChange={setMovementOpen} />
    </>
  )
}

function SummaryView({ result, onOpen }: { result: AIResult<ProcessSummary>; onOpen: (source: AISource) => void }) {
  const s = result.data
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[14px] leading-relaxed text-foreground">
          <AIText text={s.resumo} sources={result.sources} onOpen={onOpen} />
        </p>
        {s.situacao && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Situação atual: </span>
            <AIText text={s.situacao} sources={result.sources} onOpen={onOpen} />
          </p>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {s.movimentacoes_relevantes.length > 0 && (
            <AISection title="Últimas movimentações">
              <NoteList notes={s.movimentacoes_relevantes} sources={result.sources} onOpen={onOpen} />
            </AISection>
          )}
          {s.fatos_relevantes.length > 0 && (
            <AISection title="Fatos registrados">
              <AIList items={s.fatos_relevantes} sources={result.sources} onOpen={onOpen} />
            </AISection>
          )}
        </div>
        <div className="space-y-5">
          <AISection title="Pontos de atenção">
            <AttentionList points={s.pontos_atencao} sources={result.sources} onOpen={onOpen} />
          </AISection>
          {s.proximas_acoes.length > 0 && (
            <AISection title="Próximas ações sugeridas">
              <AIList items={s.proximas_acoes} sources={result.sources} onOpen={onOpen} />
            </AISection>
          )}
          {s.informacoes_ausentes.length > 0 && (
            <AISection title="Informações que faltam">
              <AIList items={s.informacoes_ausentes} sources={result.sources} onOpen={onOpen} />
            </AISection>
          )}
        </div>
      </div>
      <AIFooter result={result} confidence={s.nivel_confianca} />
    </div>
  )
}

function NextView({
  result,
  onOpen,
  onCreate,
}: {
  result: AIResult<NextActions>
  onOpen: (source: AISource) => void
  onCreate?: (suggestion: ActionSuggestion) => void
}) {
  const n = result.data
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <AISection title="Pontos de atenção">
          <AttentionList points={n.pontos_atencao} sources={result.sources} onOpen={onOpen} />
        </AISection>
        <AISection title="Sugestões da LEXA IA">
          <SuggestionList suggestions={n.sugestoes} sources={result.sources} onOpen={onOpen} onCreate={onCreate} />
          {n.sugestoes.length > 0 && (
            <p className="mt-2 text-[11.5px] text-subtle">
              Nenhuma tarefa é criada automaticamente: &quot;Criar tarefa&quot; abre o formulário para você revisar e confirmar.
            </p>
          )}
        </AISection>
      </div>
      {n.informacoes_ausentes.length > 0 && (
        <AISection title="Informações que faltam">
          <AIList items={n.informacoes_ausentes} sources={result.sources} onOpen={onOpen} />
        </AISection>
      )}
      <AIFooter result={result} />
    </div>
  )
}
