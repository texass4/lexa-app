import { cn } from "cn"

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-card border border-border/90 bg-card shadow-card", className)} {...props} />
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
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-5 pb-3.5 sm:px-6", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-foreground/80 [&_svg]:size-[17px]">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-foreground">{title}</h2>
          {description && <p className="mt-1 truncate text-[12.5px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </header>
  )
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground", className)} {...props} />
}
