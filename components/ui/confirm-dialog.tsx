"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"

/**
 * Confirmação antes de uma ação destrutiva (excluir cliente, processo, tarefa,
 * documento ou compromisso). Não fecha sozinho ao clicar fora — só por "Cancelar",
 * "Excluir" ou Esc, para evitar exclusão por engano.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
}) {
  // Mantém o último conteúdo enquanto a animação de fechar roda — o chamador costuma
  // zerar `title`/`description` (ex.: para undefined) no mesmo instante em que fecha.
  const [shown, setShown] = React.useState({ title, description, confirmLabel, cancelLabel })
  if (open && shown.title !== title) setShown({ title, description, confirmLabel, cancelLabel })
  const content = open ? { title, description, confirmLabel, cancelLabel } : shown

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#171717]/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/55" />
        <AlertDialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-popover text-popover-foreground shadow-float outline-none",
            "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "inset-x-0 top-[max(env(safe-area-inset-top),12px)] bottom-0 rounded-t-[18px] data-[ending-style]:translate-y-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-6 data-[starting-style]:opacity-0",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-[420px] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:data-[ending-style]:-translate-y-[48%] sm:data-[ending-style]:scale-[0.98] sm:data-[starting-style]:-translate-y-[48%] sm:data-[starting-style]:scale-[0.98]",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start gap-3 px-5 pt-5 pb-2 sm:px-6">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-danger/20 bg-danger-soft text-danger [&_svg]:size-4">
              <TriangleAlert />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogPrimitive.Title className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
                {content.title}
              </AlertDialogPrimitive.Title>
              {content.description && (
                <AlertDialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {content.description}
                </AlertDialogPrimitive.Description>
              )}
            </div>
          </div>
          <footer className="flex shrink-0 flex-col-reverse gap-2 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:flex-row sm:justify-end sm:px-6 sm:pb-5">
            <AlertDialogPrimitive.Close className={cn(buttonVariants({ variant: "secondary" }))}>{content.cancelLabel}</AlertDialogPrimitive.Close>
            <Button
              variant="destructive"
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {content.confirmLabel}
            </Button>
          </footer>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
