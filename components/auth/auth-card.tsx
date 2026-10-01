import { cn } from "cn"
import { Logo } from "@/components/brand/logo"
import { BRAND } from "@/lib/brand"

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
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      {/* Painel da marca (desktop): marinho, como a barra lateral do app. */}
      <aside className="sidebar-surface relative hidden flex-col justify-between overflow-hidden p-12 text-sidebar-foreground lg:flex xl:p-16">
        <Logo tone="inverse" size="lg" />
        <div className="max-w-[460px]">
          <p className="font-display text-[34px] leading-[1.15] font-semibold tracking-[-0.03em] xl:text-[40px]">
            {BRAND.tagline}
            <span className="text-sidebar-highlight">.</span>
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-sidebar-muted">{BRAND.description}</p>
        </div>
        <div aria-hidden className="h-px w-16 bg-sidebar-highlight/60" />
      </aside>

      <main className="flex flex-col items-center justify-center bg-[radial-gradient(90%_60%_at_50%_0%,color-mix(in_oklab,var(--brand)_6%,transparent),transparent_70%)] px-4 py-10 sm:px-6">
        <Logo size="lg" className="mb-8 lg:hidden" />
        <div className={cn("w-full max-w-[420px] rounded-[20px] border border-border/90 bg-card p-6 shadow-raised sm:p-9", className)}>
          <h1 className="font-display text-[24px] leading-tight font-semibold tracking-[-0.025em] text-foreground">{title}</h1>
          {description && <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
          {children && <div className="mt-7">{children}</div>}
        </div>
        {footer && <div className="mt-6 text-center text-[13px] text-muted-foreground">{footer}</div>}
      </main>
    </div>
  )
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-control border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      {children}
    </p>
  )
}
