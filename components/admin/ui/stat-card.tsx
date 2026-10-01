import Link from "next/link"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import type { Tone } from "@/lib/core/config"

const HINT_TONE: Partial<Record<Tone, string>> = {
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
  info: "text-info",
  brand: "text-brand-strong",
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
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition-colors [&_svg]:size-[17px]">
            {icon}
          </span>
        )}
        <p className="min-w-0 flex-1 text-[13px] font-medium text-foreground/80">{label}</p>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <p className="tabular text-[28px] font-semibold leading-none tracking-[-0.03em] text-foreground">{value}</p>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      {(hint || (href && action)) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2.5">
          {hint ? <p className={cn("min-w-0 line-clamp-2 text-[12px] leading-snug text-muted-foreground", hintTone && HINT_TONE[hintTone])}>{hint}</p> : <span />}
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
    "group relative flex min-w-0 flex-col rounded-card border border-border/90 bg-card p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200",
    href && "outline-none hover:-translate-y-px hover:border-border-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/45",
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
