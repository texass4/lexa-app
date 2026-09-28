import { TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { formatLimitValue, LIMIT_META, USAGE_LEVEL, usageLevel, type LimitKey } from "@/lib/admin/catalog"

/**
 * Uso atual / limite com barra. Cor por estado (normal, próximo, no limite, excedido)
 * sempre acompanhada de rótulo — nunca só a cor.
 */
export function UsageMeter({
  limitKey,
  used,
  limit,
  warnAt = 0.8,
  compact,
  className,
}: {
  limitKey: LimitKey
  used: number
  limit: number | null
  warnAt?: number
  compact?: boolean
  className?: string
}) {
  const meta = LIMIT_META[limitKey]
  const level = usageLevel(used, limit, warnAt)
  const ratio = limit ? Math.min(used / limit, 1) : 0
  const pct = limit ? Math.round((used / limit) * 100) : null
  const cfg = level === "unlimited" ? null : USAGE_LEVEL[level]
  const alert = level === "warning" || level === "critical" || level === "exceeded"

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("truncate font-medium text-muted-foreground", compact ? "text-[11.5px]" : "text-[12.5px]")}>
          {compact ? meta.short : meta.label}
          {meta.monthly && !compact && <span className="font-normal text-subtle"> · mês</span>}
        </span>
        <span className={cn("tabular shrink-0 text-foreground", compact ? "text-[11.5px]" : "text-[12.5px]")}>
          <span className="font-semibold">{formatLimitValue(limitKey, used)}</span>
          <span className="text-subtle"> / {formatLimitValue(limitKey, limit)}</span>
        </span>
      </div>
      <div
        className={cn("mt-1.5 overflow-hidden rounded-full bg-surface-muted", compact ? "h-1" : "h-1.5")}
        role="meter"
        aria-label={meta.label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={Math.round(used)}
        aria-valuetext={limit === null ? `${formatLimitValue(limitKey, used)} (sem limite)` : `${pct}% do limite`}
      >
        {limit === null ? (
          <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--border)_0_4px,transparent_4px_8px)]" />
        ) : (
          <div
            className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", cfg?.bar)}
            style={{ width: `${Math.max(ratio * 100, used > 0 ? 2 : 0)}%` }}
          />
        )}
      </div>
      {!compact && alert && cfg && (
        <p className={cn("mt-1 flex items-center gap-1 text-[11.5px]", level === "warning" ? "text-warning" : "text-danger")}>
          <TriangleAlert className="size-3" /> {cfg.label} · {pct}%
        </p>
      )}
    </div>
  )
}
