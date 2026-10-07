"use client"

import * as React from "react"
import { Check, ChevronDown, History, ListChecks, PauseCircle, ShieldAlert, Sparkles } from "lucide-react"
import { cn } from "cn"
import { AIDock, type DockPrompt } from "@/components/ai/ai-dock"
import { OFFICE_PROMPTS } from "@/components/ai/ai-context"
import { SignalList } from "@/components/shared/signal-list"
import { BRAND } from "@/lib/core/brand"
import { countByLevel, type AttentionSignal } from "@/lib/dashboard/attention"
import { SinceLastVisit } from "./attention-panel"

/** Ícone de cada pergunta sugerida (as perguntas vêm de `OFFICE_PROMPTS`). */
const ICONS = [ShieldAlert, History, PauseCircle, ListChecks]
const PROMPTS: DockPrompt[] = OFFICE_PROMPTS.slice(0, 4).map((label, i) => ({ label, icon: ICONS[i] ?? Sparkles }))

/** Quantos sinais aparecem antes de "Ver todos". */
const VISIBLE = 5

/**
 * Assistente fixo ao lado do Painel (telas largas). O destaque é "O que merece sua
 * atenção": os sinais calculados dos dados (não uma resposta da IA), na própria coluna
 * da Íntegra — assim a lista não ocupa a coluna principal do Painel.
 */
export function OfficeAIDock({ signals, empty = false }: { signals: AttentionSignal[]; /** Escritório sem processos nem tarefas ainda. */ empty?: boolean }) {
  const [showAll, setShowAll] = React.useState(false)
  const counts = countByLevel(signals)
  const shown = showAll ? signals : signals.slice(0, VISIBLE)
  const summary = [
    counts.critical && `${counts.critical} urgente${counts.critical > 1 ? "s" : ""}`,
    counts.warning && `${counts.warning} para verificar`,
    counts.info && `${counts.info} informativo${counts.info > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <AIDock
      className="h-full"
      intro={`Sou a ${BRAND.name}, sua assistente jurídica. Como posso te ajudar hoje?`}
      prompts={PROMPTS}
      highlight={
        <section aria-label="O que merece sua atenção">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Sparkles className="size-4 shrink-0 text-brand" strokeWidth={1.8} />O que merece sua atenção
          </p>
          {summary && <p className="mt-0.5 pl-6 text-[12px] text-muted-foreground">{summary}</p>}
          <div className="mt-2.5">
            <SinceLastVisit embedded />
          </div>
          {signals.length ? (
            <>
              <SignalList signals={shown} dense className="-mx-2 mt-1" />
              {signals.length > VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  className="touch-target relative mt-1 flex items-center gap-1 rounded-md px-0.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {showAll ? "Mostrar só o principal" : `Ver todos (${signals.length})`}
                  <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
                </button>
              )}
            </>
          ) : empty ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              Quando houver processos e tarefas, prazos e movimentações que precisarem de você aparecem aqui.
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Check className="size-4 shrink-0 text-success" /> Tudo em dia nos dados do escritório.
            </p>
          )}
        </section>
      }
    />
  )
}
