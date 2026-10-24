import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

/** Contêiner das telas: margens generosas e largura confortável. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 pt-6 pb-24 sm:px-6 md:px-10 md:pt-10", wide ? "max-w-[1400px]" : "max-w-5xl", className)}>{children}</div>
}

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:mb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h1 className="font-serif text-[2rem] leading-[1.1] tracking-tight text-ink md:text-[2.4rem]">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-[0.9375rem] text-ink-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

/** Título de seção editorial: "01 Hoje ——— ação". */
export function SectionTitle({ index, title, count, action, className }: { index?: string; title: ReactNode; count?: number; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      {index ? <span className="meta text-ink-5">{index}</span> : null}
      <h2 className="text-[0.8125rem] font-semibold tracking-wide text-ink uppercase">{title}</h2>
      {count !== undefined ? <span className="meta">{count}</span> : null}
      <span className="h-px flex-1 bg-line" aria-hidden />
      {action}
    </div>
  )
}
