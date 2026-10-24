import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export type Tone = "neutral" | "active" | "done" | "danger" | "muted" | "warning" | "cobalt"

const tones: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink-3",
  active: "bg-cobalt-soft text-cobalt-ink",
  cobalt: "bg-cobalt text-white",
  done: "bg-sage-soft text-sage-ink",
  danger: "bg-clay-soft text-clay",
  warning: "bg-amber-soft text-amber",
  muted: "bg-paper-2 text-ink-4",
}

export function Badge({ tone = "neutral", children, className, mono }: { tone?: Tone; children: ReactNode; className?: string; mono?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-xs px-1.5 text-2xs leading-none font-medium whitespace-nowrap",
        mono && "font-mono tracking-wide uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Prioridade como três barras (alta = 3), legível sem depender só de cor. */
export function PriorityMark({ priority, className }: { priority: "low" | "medium" | "high"; className?: string }) {
  const level = priority === "high" ? 3 : priority === "medium" ? 2 : 1
  const label = priority === "high" ? "Prioridade alta" : priority === "medium" ? "Prioridade média" : "Prioridade baixa"
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex h-3 items-end gap-[2px]", className)}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px]", i <= level ? (priority === "high" ? "bg-clay" : "bg-ink-3") : "bg-line-strong")} style={{ height: `${4 + i * 2.5}px` }} />
      ))}
    </span>
  )
}
