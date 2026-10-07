"use client"

import { BookOpenText, FileText, History, Lightbulb, ListChecks, MessageSquareText, Sparkles } from "lucide-react"
import { AIDock, type DockPrompt } from "@/components/ai/ai-dock"
import { PROCESS_PROMPTS, processContext } from "@/components/ai/ai-context"
import { SignalList } from "@/components/shared/signal-list"
import type { AttentionSignal } from "@/lib/dashboard/attention"
import type { Process } from "@/types"

const ICONS = [FileText, History, ListChecks, MessageSquareText, Lightbulb, BookOpenText]
const PROMPTS: DockPrompt[] = PROCESS_PROMPTS.map((label, i) => ({ label, icon: ICONS[i] ?? Sparkles }))

/** Quantos sinais cabem no destaque sem empurrar as sugestões. */
const VISIBLE_SIGNALS = 3

/**
 * Íntegra IA no detalhe do processo, no mesmo formato do perfil do cliente: perguntas
 * sobre este processo (a conversa usa só os dados dele) e, no destaque, o que os dados
 * já mostram — prazos, tarefas atrasadas, movimentação recente.
 */
export function ProcessAIDock({ process, signals, className }: { process: Process; signals: AttentionSignal[]; className?: string }) {
  const visible = signals.slice(0, VISIBLE_SIGNALS)
  return (
    <AIDock
      className={className}
      context={processContext(process.id, process.code)}
      intro={`Pergunte sobre o processo ${process.code}: movimentações, prazos, tarefas e próximos passos.`}
      prompts={PROMPTS}
      highlight={
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <Sparkles className="size-4 shrink-0 text-brand" strokeWidth={1.8} />
            {signals.length === 0
              ? "Nada pede atenção agora."
              : signals.length === 1
                ? "1 ponto merece atenção"
                : `${signals.length} pontos merecem atenção`}
          </p>
          {visible.length > 0 && (
            <>
              {/* Já estamos no processo: os sinais não levam a outra tela. */}
              <SignalList signals={visible} linked={false} className="-mx-2 mt-2" />
              {signals.length > visible.length && <p className="mt-1 text-[12px] text-subtle">e mais {signals.length - visible.length}</p>}
            </>
          )}
        </div>
      }
    />
  )
}
