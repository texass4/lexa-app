"use client"

import { FileText, ListChecks, Scale, ShieldAlert, Sparkles } from "lucide-react"
import { AIDock, type DockPrompt } from "@/components/ai/ai-dock"
import { CLIENT_PROMPTS, clientContext } from "@/components/ai/ai-context"
import { SignalList } from "@/components/shared/signal-list"
import type { AttentionSignal } from "@/lib/dashboard/attention"
import type { Client } from "@/types"

const ICONS = [FileText, ShieldAlert, ListChecks, Scale]
const PROMPTS: DockPrompt[] = CLIENT_PROMPTS.map((label, i) => ({ label, icon: ICONS[i] ?? Sparkles }))

/** Quantos sinais cabem no destaque sem empurrar as sugestões. */
const VISIBLE_SIGNALS = 3

/**
 * Íntegra IA no perfil do cliente, no mesmo formato do Painel: perguntas sobre este
 * cliente e, no destaque, o que os dados dele já mostram (prazos, tarefas, valores).
 */
export function ClientAIDock({ client, signals, className }: { client: Client; signals: AttentionSignal[]; className?: string }) {
  const visible = signals.slice(0, VISIBLE_SIGNALS)
  return (
    <AIDock
      className={className}
      context={clientContext(client.id, client.name)}
      intro={`Pergunte sobre ${client.name}: processos, prazos, tarefas e o que mudou.`}
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
              <SignalList signals={visible} className="-mx-2 mt-2" />
              {signals.length > visible.length && <p className="mt-1 text-[12px] text-subtle">e mais {signals.length - visible.length}</p>}
            </>
          )}
        </div>
      }
    />
  )
}
