"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"

/**
 * Modal padrão da LEXA: centralizado no desktop, quase tela cheia (bottom sheet)
 * no mobile. Fecha com ESC, clique no overlay ou botão de fechar.
 * O conteúdo é desmontado ao fechar, então formulários começam limpos a cada abertura.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  bare = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "sm" | "md" | "lg"
  /** Quando true, os filhos renderizam o próprio ModalBody/ModalFooter (estado local reinicia a cada abertura). */
  bare?: boolean
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#171717]/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/55" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-popover text-popover-foreground shadow-float outline-none",
            "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            // mobile: sheet quase tela cheia
            "inset-x-0 top-[max(env(safe-area-inset-top),12px)] bottom-0 rounded-t-[18px] data-[ending-style]:translate-y-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-6 data-[starting-style]:opacity-0",
            // desktop: centralizado
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[min(88vh,760px)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:data-[ending-style]:-translate-y-[48%] sm:data-[ending-style]:scale-[0.98] sm:data-[starting-style]:-translate-y-[48%] sm:data-[starting-style]:scale-[0.98]",
            size === "sm" && "sm:max-w-[420px]",
            size === "md" && "sm:max-w-[560px]",
            size === "lg" && "sm:max-w-[720px]",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 pt-4 pb-4 sm:px-6 sm:pt-5">
            {icon && (
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-muted/60 text-foreground [&_svg]:size-4">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">{description}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="-mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/45"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          {bare ? (
            children
          ) : (
            <>
              <ModalBody>{children}</ModalBody>
              {footer && <ModalFooter>{footer}</ModalFooter>}
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 thin-scrollbar sm:px-6">{children}</div>
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted/40 px-5 py-3.5 pb-[max(env(safe-area-inset-bottom),14px)] sm:flex-row sm:justify-end sm:px-6 sm:pb-3.5">
      {children}
    </footer>
  )
}
