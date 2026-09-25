"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"

/** Painel lateral de detalhes. No mobile ocupa a tela quase inteira, vindo de baixo. */
export function SideSheet({
  open,
  onOpenChange,
  title,
  children,
  header,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#171717]/20 backdrop-blur-[1.5px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/50" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border-border bg-popover shadow-float outline-none transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "inset-x-0 top-[max(env(safe-area-inset-top),10px)] bottom-0 rounded-t-[18px] border-t data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
            "sm:inset-y-2 sm:right-2 sm:left-auto sm:top-2 sm:w-[500px] sm:rounded-[16px] sm:border sm:data-[ending-style]:translate-x-[calc(100%+1rem)] sm:data-[ending-style]:translate-y-0 sm:data-[starting-style]:translate-x-[calc(100%+1rem)] sm:data-[starting-style]:translate-y-0",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="relative shrink-0">
            {header}
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/45"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-border bg-surface-muted/40 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:pb-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
