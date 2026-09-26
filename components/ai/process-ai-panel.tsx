"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, FileText, ListChecks, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { MovementDetailSheet } from "@/components/processos/movement-detail-sheet"
import { aiApi } from "@/lib/ai/client"
import type { ActionSuggestion, AIResult, AISource, NextActions, ProcessSummary } from "@/lib/ai/types"
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
  isAIReady,
} from "./ai-blocks"
import { AIChatSheet } from "./ai-chat-sheet"
import { useAIAction, useAIChat, useAIStatus, useCreateTaskFromSuggestion } from "./use-ai"

type View = "summary" | "next"

const QUICK_PROMPTS = [
  "Me explique esse processo.",
  "Explique a última movimentação.",
  "Quais são os pontos de atenção?",
  "Sugira próximos passos.",
  "Existe alguma tarefa relacionada?",
]

/**
 * LEXA IA no perfil do processo. Montar com `key={process.id}`: cada processo
 * tem suas próprias análises e conversa. Nada é chamado sem clique.
 */
export function ProcessAIPanel({ process, client }: { process: Process; client?: Client }) {
  const status = useAIStatus()
  const ready = isAIReady(status)
  const summary = useAIAction<AIResult<ProcessSummary>>()
  const next = useAIAction<AIResult<NextActions>>()
  const chat = useAIChat({ type: "process", id: process.id })
  const [view, setView] = React.useState<View>("summary")
  const [chatOpen, setChatOpen] = React.useState(false)
  const [movement, setMovement] = React.useState<LexaMovement | null>(null)
  const [movementOpen, setMovementOpen] = React.useState(false)
  const createTask = useCreateTaskFromSuggestion({ processId: process.id })
  const { can } = useSession()

  const router = useRouter()

  /** Movimentação abre o detalhe aqui mesmo; as demais fontes levam ao registro. */
  const openSource = (source: AISource) => {
    const found = source.kind === "movement" ? process.movements.find((m) => m.id === source.id) : undefined
    if (found) {
      setMovement(interpretMovement(found, process.id))
      setMovementOpen(true)
    } else if (source.href) {
      router.push(source.href)
    }
  }

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
        description="Análises a partir dos dados deste processo salvos no LEXA."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={runSummary} disabled={!ready || summary.loading}>
              <FileText /> Resumir processo
            </Button>
            <Button variant="secondary" size="sm" onClick={runNext} disabled={!ready || next.loading}>
              <ListChecks /> Verificar próximos passos
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
                label={view === "summary" ? "LEXA IA está analisando o processo…" : "LEXA IA está verificando os próximos passos…"}
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
              Gerar panorama do cliente {client.name} <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        )}
      </AIPanel>

      <AIChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        chat={chat}
        subtitle={`Processo ${process.number}`}
        quickPrompts={QUICK_PROMPTS}
        status={status}
        onOpenSource={(source) => {
          setChatOpen(false)
          openSource(source)
        }}
      />
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
