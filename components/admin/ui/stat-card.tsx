import Link from "next/link"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import type { Tone } from "@/lib/config"

const HINT_TONE: Partial<Record<Tone, string>> = {
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
  info: "text-info",
  gold: "text-gold-dark",
}

/**
 * Indicador com contexto e ação: número → frase curta que dá sentido → link para agir.
 * Ex.: "12 escritórios ativos" / "2 próximos do limite" / "Ver uso".
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  hintTone,
  delta,
  href,
  action,
  className,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  hint?: React.ReactNode
  hintTone?: Tone
  /** Variação contra o período anterior (0.12 = +12%). null = sem base de comparação. */
  delta?: number | null
  href?: string
  action?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface-muted/60 text-muted-foreground transition-colors group-hover:border-gold/30 group-hover:text-gold-dark [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="tabular text-[28px] font-semibold leading-none tracking-[-0.025em] text-foreground">{value}</p>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      {(hint || (href && action)) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2.5">
          {hint ? <p className={cn("min-w-0 truncate text-[12px] text-muted-foreground", hintTone && HINT_TONE[hintTone])}>{hint}</p> : <span />}
          {href && action && (
            <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              {action}
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      )}
    </>
  )
  const cls = cn(
    "group relative flex min-w-0 flex-col rounded-[14px] border border-border bg-card p-4.5 shadow-card transition-[border-color,box-shadow,transform] duration-200",
    href && "outline-none hover:-translate-y-px hover:border-border-strong hover:shadow-float focus-visible:ring-2 focus-visible:ring-gold/45",
    className,
  )
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function Delta({ value, suffix = "vs. período anterior" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-[11.5px] font-medium text-info">novo</span>
  const pct = Math.round(value * 100)
  const up = pct > 0
  const flat = pct === 0
  return (
    <span
      title={`${up ? "+" : ""}${pct}% ${suffix}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[5px] px-1 py-px text-[11.5px] font-medium tabular",
        flat ? "text-muted-foreground" : up ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {!flat && (up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />)}
      {up ? "+" : ""}
      {pct}%
    </span>
  )
}
