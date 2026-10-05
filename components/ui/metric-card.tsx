import Link from "next/link"
import { ArrowUpRight, type LucideIcon } from "lucide-react"
import { cn } from "cn"

const TONES = {
  brand: { tile: "bg-brand-soft text-brand", bar: "bg-brand" },
  info: { tile: "bg-info-soft text-info", bar: "bg-info" },
  warning: { tile: "bg-warning-soft text-warning", bar: "bg-warning" },
  success: { tile: "bg-success-soft text-success", bar: "bg-success" },
  danger: { tile: "bg-danger-soft text-danger", bar: "bg-danger" },
  gold: { tile: "bg-gold-soft text-gold-strong", bar: "bg-gold" },
} as const

export type MetricTone = keyof typeof TONES

/**
 * Indicador da Íntegra: selo colorido com ícone, rótulo, valor em destaque, uma frase
 * de contexto e uma linha de cor na base. Com `href`, o cartão inteiro é um link.
 */
export function MetricCard({
  label,
  short,
  value,
  foot,
  icon: Icon,
  tone = "brand",
  href,
  className,
}: {
  label: string
  /** Rótulo curto para telas estreitas. */
  short?: string
  value: React.ReactNode
  foot?: React.ReactNode
  icon: LucideIcon
  tone?: MetricTone
  href?: string
  className?: string
}) {
  const body = (
    <>
      {/* Cartão estreito (duas colunas num celular pequeno): ícone acima do rótulo, para o rótulo não ser cortado. */}
      <div className="flex flex-col items-start gap-2.5 @[10rem]:flex-row @[10rem]:items-center @[10rem]:gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full sm:size-10", TONES[tone].tile)}>
          <Icon className="size-[17px] sm:size-[18px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 max-w-full flex-1 truncate text-[13px] font-medium text-foreground/80">
          {short ? (
            <>
              <span className="sm:hidden">{short}</span>
              <span className="max-sm:hidden">{label}</span>
            </>
          ) : (
            label
          )}
        </span>
        {href && (
          <ArrowUpRight className="size-4 shrink-0 text-subtle transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground max-sm:hidden @max-[10rem]:hidden" />
        )}
      </div>
      <p className="tabular mt-4 truncate text-[22px] font-semibold leading-none tracking-[-0.03em] text-foreground min-[390px]:text-[26px] sm:mt-5 sm:text-[30px]">
        {value}
      </p>
      {foot && <p className="mt-2.5 line-clamp-2 text-[12.5px] text-muted-foreground sm:mt-3">{foot}</p>}
      <span aria-hidden className={cn("absolute inset-x-4 bottom-0 h-[3px] rounded-t-full opacity-80 sm:inset-x-5", TONES[tone].bar)} />
    </>
  )
  const cls = cn(
    "@container group relative flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-border/90 bg-card p-4 shadow-card sm:p-5 sm:pb-6",
    href &&
      "outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/40",
    className,
  )
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
