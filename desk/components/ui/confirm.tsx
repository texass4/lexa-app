"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { Button } from "./button"

type ConfirmOptions = { title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean }
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** `const confirm = useConfirm(); if (await confirm({...})) …` — confirmação para ações destrutivas. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error("useConfirm fora do ConfirmProvider")
  return fn
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={options !== null} onOpenChange={(open) => !open && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-[60] bg-ink/30" />
          <AlertDialog.Popup className="fixed top-[20vh] left-1/2 z-[61] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-md border border-line bg-white p-5 shadow-float outline-none">
            <AlertDialog.Title className="font-serif text-lg leading-snug text-ink">{options?.title}</AlertDialog.Title>
            {options?.description ? <AlertDialog.Description className="mt-2 text-sm text-ink-3">{options.description}</AlertDialog.Description> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => close(false)}>Cancelar</Button>
              <Button variant={options?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
                {options?.confirmLabel ?? "Confirmar"}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  )
}
