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
  tone?: "danger" | "brand"
  className?: string
}) {
  return (
    <div className={cn("min-w-0 rounded-card border border-border/90 bg-card p-4 shadow-card sm:p-5", className)}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
              tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand",
            )}
          >
            {icon}
          </span>
        )}
        <span className="truncate text-[12.5px] font-medium text-foreground/75">{label}</span>
      </div>
      <p
        className={cn(
          "tabular mt-3.5 truncate text-[24px] font-semibold leading-none tracking-[-0.03em]",
          tone === "danger" ? "text-danger" : tone === "brand" ? "text-brand-strong" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2.5 truncate text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
