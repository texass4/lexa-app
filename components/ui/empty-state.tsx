import { cn } from "cn"
import { CircleAlert, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16", className)}>
      {icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 -m-3 rounded-full bg-gold-soft/70 blur-md" aria-hidden />
          <div className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground shadow-xs [&_svg]:size-5">
            {icon}
          </div>
        </div>
      )}
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = "Não conseguimos carregar estas informações.",
  description = "Verifique sua conexão e tente novamente. Se o problema persistir, fale com o suporte da LEXA.",
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-danger/15 bg-danger-soft text-danger">
        <CircleAlert className="size-5" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw /> Recarregar
        </Button>
      )}
    </div>
  )
}
