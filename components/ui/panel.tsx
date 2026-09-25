import { cn } from "cn"

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-[14px] border border-border bg-card shadow-card", className)} {...props} />
}

export function PanelHeader({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-4.5 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          {description && <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </header>
  )
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground", className)} {...props} />
}
