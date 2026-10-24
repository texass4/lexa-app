"use client"

import { AlertTriangle, Check, CloudOff, RotateCw } from "lucide-react"
import { cn } from "@/lib/cn"
import type { SaveStatus } from "@/lib/client/autosave"

/** Mostra o estado do salvamento automático: Salvando…, Salvo, Erro ao salvar (com nova tentativa). */
export function SaveIndicator({ status, onRetry, className }: { status: SaveStatus; onRetry?: () => void; className?: string }) {
  const base = cn("meta inline-flex items-center gap-1.5 whitespace-nowrap", className)
  switch (status) {
    case "idle":
      return null
    case "dirty":
    case "saving":
      return (
        <span className={base} role="status" aria-live="polite">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-cobalt" />
          Salvando…
        </span>
      )
    case "saved":
      return (
        <span className={cn(base, "text-sage-ink")} role="status" aria-live="polite">
          <Check className="size-3" />
          Salvo
        </span>
      )
    case "offline":
      return (
        <span className={cn(base, "text-amber")} role="status" aria-live="polite">
          <CloudOff className="size-3" />
          Sem conexão — guardado neste aparelho
          {onRetry ? (
            <button onClick={onRetry} className="ml-1 underline underline-offset-2 hover:text-ink">
              tentar agora
            </button>
          ) : null}
        </span>
      )
    case "error":
      return (
        <span className={cn(base, "text-clay")} role="alert">
          <AlertTriangle className="size-3" />
          Erro ao salvar
          {onRetry ? (
            <button onClick={onRetry} className="ml-1 inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink">
              <RotateCw className="size-3" />
              tentar de novo
            </button>
          ) : null}
        </span>
      )
    case "conflict":
      return (
        <span className={cn(base, "text-clay")} role="alert">
          <AlertTriangle className="size-3" />
          Alterado em outra aba
        </span>
      )
  }
}
