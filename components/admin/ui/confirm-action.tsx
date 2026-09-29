"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { LoaderCircle, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { TextArea, TextInput } from "@/components/ui/field"

export interface ConfirmRequest {
  title: string
  description: React.ReactNode
  confirmLabel: string
  /** "danger" para ações destrutivas/críticas; "default" para confirmações simples. */
  tone?: "danger" | "default"
  /** Exige digitar este texto (ex.: o nome do escritório) antes de confirmar. */
  requireText?: string
  /** Pede um motivo (vai para a auditoria). */
  askReason?: boolean | "required"
  reasonLabel?: string
  onConfirm: (reason: string) => Promise<void> | void
}

/**
 * Confirmação de ação crítica do Admin: fica aberta até a ação terminar (mostra
 * progresso), pode exigir digitar o nome do alvo e registrar um motivo.
 */
export function ConfirmAction({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const [shown, setShown] = React.useState<ConfirmRequest | null>(request)
  if (request && request !== shown) setShown(request)
  const r = request ?? shown
  const [typed, setTyped] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [lastRequest, setLastRequest] = React.useState(request)
  if (request !== lastRequest) {
    setLastRequest(request)
    setTyped("")
    setReason("")
    setBusy(false)
  }

  const textOk = !r?.requireText || typed.trim().toLowerCase() === r.requireText.trim().toLowerCase()
  const reasonOk = r?.askReason !== "required" || reason.trim().length >= 3
  const danger = (r?.tone ?? "danger") === "danger"

  const confirm = async () => {
    if (!r || !textOk || !reasonOk) return
    setBusy(true)
    try {
      await r.onConfirm(reason.trim())
      onClose()
    } catch {
      // Quem chamou já mostrou o erro (toast); mantém o diálogo para tentar de novo.
      setBusy(false)
    }
  }

  return (
    <AlertDialogPrimitive.Root open={!!request} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#0e1726]/30 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/60" />
        <AlertDialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-popover text-popover-foreground shadow-float outline-none",
            "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[18px] data-[ending-style]:translate-y-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-6 data-[starting-style]:opacity-0",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:data-[ending-style]:-translate-y-[48%] sm:data-[ending-style]:scale-[0.98] sm:data-[starting-style]:-translate-y-[48%] sm:data-[starting-style]:scale-[0.98]",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start gap-3 px-5 pt-5 pb-2 sm:px-6">
            <div
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] border [&_svg]:size-4",
                danger ? "border-danger/20 bg-danger-soft text-danger" : "border-brand/25 bg-brand-soft text-brand-strong",
              )}
            >
              <TriangleAlert />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogPrimitive.Title className="text-[16px] font-semibold tracking-[-0.01em]">{r?.title}</AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r?.description}</AlertDialogPrimitive.Description>
            </div>
          </div>
          {(r?.askReason || r?.requireText) && (
            <div className="space-y-3 px-5 pt-2 sm:px-6">
              {r.askReason && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm-reason" className="text-[12.5px] font-medium">
                    {r.reasonLabel ?? "Motivo"} {r.askReason !== "required" && <span className="font-normal text-subtle">opcional</span>}
                  </label>
                  <TextArea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[68px]" maxLength={500} />
                </div>
              )}
              {r.requireText && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm-text" className="text-[12.5px] text-muted-foreground">
                    Para confirmar, digite <strong className="font-semibold text-foreground">{r.requireText}</strong>
                  </label>
                  <TextInput id="confirm-text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <footer className="flex shrink-0 flex-col-reverse gap-2 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),20px)] sm:flex-row sm:justify-end sm:px-6 sm:pb-5">
            <AlertDialogPrimitive.Close disabled={busy} className={cn(buttonVariants({ variant: "secondary" }))}>
              Cancelar
            </AlertDialogPrimitive.Close>
            <Button variant={danger ? "destructive" : "default"} disabled={busy || !textOk || !reasonOk} onClick={confirm}>
              {busy && <LoaderCircle className="animate-spin" />}
              {r?.confirmLabel}
            </Button>
          </footer>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
