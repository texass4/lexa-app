"use client"

import { Sparkles } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLexaAI } from "./lexa-ai-provider"
import { BRAND } from "@/lib/brand"

/** Presença discreta da Íntegra IA no topo de todas as telas — abre a conversa no contexto atual. */
export function LexaTrigger() {
  const lexa = useLexaAI()
  const label = `Perguntar à ${BRAND.name} — ${lexa.context.subtitle}`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => lexa.open()}
            aria-label={label}
            aria-expanded={lexa.isOpen}
            className="group flex h-9 items-center gap-1.5 rounded-[9px] border border-brand/25 bg-brand-soft/70 px-2.5 text-[13px] font-medium text-brand-strong outline-none transition-[border-color,background-color,transform] hover:border-brand/50 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/45 active:scale-[0.97]"
          />
        }
      >
        <Sparkles className="size-4 transition-transform duration-300 group-hover:rotate-12" strokeWidth={1.8} />
        <span className="max-sm:hidden">Perguntar</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
