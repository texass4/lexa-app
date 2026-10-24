import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

/** Estado vazio: explica em uma frase e oferece o primeiro passo. */
export function EmptyState({ title, children, action, className, compact }: { title: string; children?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("grid-paper rounded-md border border-dashed border-line-strong/80 text-center", compact ? "px-4 py-6" : "px-6 py-12", className)}>
      <p className={cn("font-serif text-ink", compact ? "text-base" : "text-xl")}>{title}</p>
      {children ? <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-3">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  )
}
