import { cn } from "cn"

export function MiniStat({
  label,
  value,
  hint,
  icon,
  tone,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: "danger" | "gold"
  className?: string
}) {
  return (
    <div className={cn("min-w-0 rounded-[14px] border border-border bg-card p-4 shadow-card", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      </div>
      <p
        className={cn(
          "tabular mt-2.5 truncate text-[22px] font-semibold leading-none tracking-[-0.025em]",
          tone === "danger" ? "text-danger" : tone === "gold" ? "text-gold-dark" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 truncate text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
