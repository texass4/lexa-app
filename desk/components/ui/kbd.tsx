import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-xs border border-current/25 px-1 font-mono text-[10px] leading-none opacity-70", className)}>{children}</kbd>
}
