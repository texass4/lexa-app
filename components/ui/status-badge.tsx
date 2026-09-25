import { cn } from "cn"
import type { Tone } from "@/lib/config"

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted-foreground border-border",
  success: "bg-success-soft text-success border-success/15",
  warning: "bg-warning-soft text-warning border-warning/15",
  danger: "bg-danger-soft text-danger border-danger/15",
  info: "bg-info-soft text-info border-info/15",
  gold: "bg-gold-soft text-gold-dark border-gold/20",
  violet: "bg-violet-soft text-violet border-violet/15",
}

const DOTS: Record<Tone, string> = {
  neutral: "bg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  gold: "bg-gold",
  violet: "bg-violet",
}

export function StatusBadge({
  tone = "neutral",
  children,
  dot = true,
  className,
  size = "default",
}: {
  tone?: Tone
  children: React.ReactNode
  dot?: boolean
  className?: string
  size?: "default" | "sm"
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border font-medium",
        size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-[22px] px-2 text-[11.5px]",
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function Tag({ children, className, icon }: { children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface px-1.5 text-[11.5px] font-medium text-muted-foreground [&_svg]:size-3",
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}
