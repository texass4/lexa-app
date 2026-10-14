"use client"

import { CircleHelp, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Kbd } from "@/components/ui/kbd"
import { useUI } from "@/lib/store/ui-store"
import { useIsMac } from "@/lib/core/hooks"
import { BRAND } from "@/lib/core/brand"

/**
 * Ajuda: só o que existe de fato — os atalhos de teclado da Íntegra e a busca rápida.
 * Não há central de ajuda no produto; nada aqui simula conteúdo que não existe.
 */
export function HelpMenu() {
  const { setCommandOpen } = useUI()
  const mod = useIsMac() ? "⌘" : "Ctrl"
  const shortcuts = [
    { keys: [mod, "K"], label: "Busca rápida e comandos" },
    { keys: [mod, "B"], label: "Recolher ou expandir a barra lateral" },
    { keys: ["Enter"], label: "Enviar a pergunta no assistente" },
    { keys: ["Shift", "Enter"], label: "Nova linha na pergunta" },
  ]
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Ajuda e atalhos"
        className="touch-target relative flex size-9 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/45 aria-expanded:bg-accent sm:size-10"
      >
        <CircleHelp className="size-[19px]" strokeWidth={1.8} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[300px] p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[14px] font-semibold text-foreground">Ajuda</p>
          <p className="text-[12.5px] text-muted-foreground">Atalhos para trabalhar mais rápido na {BRAND.name}.</p>
        </div>
        <ul className="space-y-2 px-4 py-3">
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-[13px] text-foreground">
              <span>{s.label}</span>
              <span className="flex shrink-0 items-center gap-0.5">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 w-full items-center gap-2 rounded-control px-2 text-[13px] font-medium text-brand-strong outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/45"
          >
            <Search className="size-4" /> Abrir a busca rápida
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
