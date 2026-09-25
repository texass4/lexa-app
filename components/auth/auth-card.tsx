import { cn } from "cn"
import { Logo } from "@/components/layout/logo"

/** Moldura das telas de entrada (login, cadastro, senha) e de status da conta. */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(90%_60%_at_50%_0%,color-mix(in_oklab,var(--gold)_9%,transparent),transparent_70%)] px-4 py-10">
      <Logo className="mb-8" />
      <div className={cn("w-full max-w-[400px] rounded-[18px] border border-border bg-card p-6 shadow-card sm:p-8", className)}>
        <h1 className="font-serif text-[26px] leading-tight tracking-[-0.01em] text-foreground">{title}</h1>
        {description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
      {footer && <div className="mt-5 text-center text-[13px] text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-[9px] border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      {children}
    </p>
  )
}
