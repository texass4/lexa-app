"use client"

import Link from "next/link"
import { ArrowRight, History, ListChecks, PauseCircle, ShieldAlert, Sparkles } from "lucide-react"
import { AIDock, type DockPrompt } from "@/components/ai/ai-dock"
import { OFFICE_PROMPTS } from "@/components/ai/ai-context"
import { useOfficeData } from "@/lib/store/office-store"
import { officeDigest } from "@/lib/dashboard/dashboard"
import { BRAND } from "@/lib/core/brand"

/** Ícone de cada pergunta sugerida (as perguntas vêm de `OFFICE_PROMPTS`). */
const ICONS = [ShieldAlert, History, PauseCircle, ListChecks]
const PROMPTS: DockPrompt[] = OFFICE_PROMPTS.slice(0, 4).map((label, i) => ({ label, icon: ICONS[i] ?? Sparkles }))

/** Assistente fixo ao lado do Painel (telas largas). O destaque conta movimentações reais. */
export function OfficeAIDock() {
  const digest = officeDigest(useOfficeData())
  return (
    <AIDock
      className="h-full"
      intro={`Sou a ${BRAND.name}, sua assistente jurídica. Como posso te ajudar hoje?`}
      prompts={PROMPTS}
      highlight={
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 size-[18px] shrink-0 text-brand" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="text-[13px] leading-relaxed text-foreground">
              {digest.recentMovements
                ? `${digest.recentMovements} ${digest.recentMovements === 1 ? "processo teve movimentação" : "processos tiveram movimentação"} nos últimos 7 dias.`
                : "Nenhum processo teve movimentação nos últimos 7 dias."}
            </p>
            <Link
              href="/processos"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[12.5px] font-medium text-foreground outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Ver processos <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      }
    />
  )
}
