import Link from "next/link"
import { cn } from "cn"

export interface Indicator {
  label: string
  value: React.ReactNode
  /** Contexto curto abaixo do valor. */
  foot?: React.ReactNode
  /** Pede ação (vencido, atrasado): o contexto fica em vermelho. */
  alert?: boolean
  /** Com `href`, a célula leva à lista que resolve o indicador. */
  href?: string
}

/**
 * Faixa de indicadores: uma superfície só, com células divididas por linhas — os
 * números principais sem ocupar a tela com cartões. 2 colunas no celular; todas
 * numa linha a partir de `xl` (ou `sm`, com até 3).
 */
export function IndicatorStrip({ items, label, className }: { items: Indicator[]; label: string; className?: string }) {
  if (!items.length) return null
  const wide = items.length >= 4
  return (
    <section
      aria-label={label}
      className={cn(
        "grid overflow-hidden rounded-card border border-border/90 bg-card shadow-card",
        items.length === 1 ? "grid-cols-1" : wide ? "grid-cols-2 xl:grid-cols-4" : items.length === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2",
        className,
      )}
    >
      {items.map((item, index) => {
        const cell = cn(
          "relative flex min-w-0 flex-col gap-0.5 border-border/80 px-4 py-3 sm:px-5",
          // Linhas entre as células em qualquer número de colunas.
          index % 2 === 1 && "border-l",
          index >= 2 && "border-t",
          wide && "xl:border-t-0 xl:[&:not(:first-child)]:border-l",
          items.length === 3 && "sm:border-t-0 sm:[&:not(:first-child)]:border-l",
        )
        const body = (
          <>
            <span className="truncate text-[12px] font-medium text-muted-foreground">{item.label}</span>
            <span className="tabular truncate text-[22px] leading-tight font-semibold tracking-[-0.02em] text-foreground">{item.value}</span>
            {item.foot && <span className={cn("truncate text-[12px]", item.alert ? "font-medium text-danger" : "text-subtle")}>{item.foot}</span>}
          </>
        )
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={cn(cell, "outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset")}
          >
            {body}
          </Link>
        ) : (
          <div key={item.label} className={cell}>
            {body}
          </div>
        )
      })}
    </section>
  )
}
