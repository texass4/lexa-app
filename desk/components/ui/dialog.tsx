"use client"

import { Dialog as Base } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = "md",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  return (
    <Base.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-40 bg-ink/30 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-line bg-white shadow-float outline-none",
            "transition-[opacity,transform] duration-150 data-[ending-style]:translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0",
            size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 pt-4 pb-3">
            <div className="min-w-0">
              <Base.Title className="font-serif text-xl leading-tight text-ink">{title}</Base.Title>
              {description ? <Base.Description className="mt-1 text-sm text-ink-3">{description}</Base.Description> : null}
            </div>
            <Base.Close aria-label="Fechar" className="-mr-1.5 rounded-sm p-1.5 text-ink-4 hover:bg-ink/5 hover:text-ink">
              <X className="size-4" />
            </Base.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  )
}
