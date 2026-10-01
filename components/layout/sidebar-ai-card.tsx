"use client"

import { ArrowRight, Sparkles } from "lucide-react"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { AI_NAME } from "@/lib/brand"

/** Atalho para a conversa com a Íntegra IA (a mesma do botão "IA" do topo). */
export function SidebarAICard({ onOpen }: { onOpen?: () => void }) {
  const lexa = useLexaAI()
  return (
    <div className="rounded-[14px] border border-sidebar-border bg-white/[0.04] p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sidebar-highlight ring-1 ring-white/10">
          <Sparkles className="size-4" strokeWidth={1.8} />
        </span>
        <p className="text-[13px] font-semibold text-sidebar-foreground">{AI_NAME}</p>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-sidebar-muted">Pergunte sobre processos, prazos, clientes e o financeiro do escritório.</p>
      <button
        type="button"
        onClick={() => {
          onOpen?.()
          lexa.open()
        }}
        aria-expanded={lexa.isOpen}
        className="group mt-3 inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-white/[0.08] px-3 text-[12.5px] font-medium text-sidebar-foreground outline-none ring-1 ring-white/10 transition-colors hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
      >
        Conversar com a IA
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  )
}
