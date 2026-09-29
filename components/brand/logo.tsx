import { cn } from "cn"
import { BRAND, SYMBOL, WORDMARK } from "@/lib/brand"

/**
 * Marca da Íntegra: símbolo, logotipo tipográfico e a composição horizontal.
 *
 * As cores vêm dos tokens `--logo-*` (`app/globals.css`), então a mesma marca
 * se ajusta sozinha ao tema claro e ao escuro. `tone="inverse"` fixa a versão
 * clara, para superfícies sempre escuras (ex.: a barra do Admin).
 */

type Tone = "auto" | "inverse"

export function LogoMark({ className, tone = "auto" }: { className?: string; tone?: Tone }) {
  return (
    <svg viewBox={SYMBOL.viewBox} aria-hidden className={cn("size-8 shrink-0", tone === "inverse" && "brand-inverse", className)}>
      <rect width="32" height="32" rx={SYMBOL.radius} fill="var(--logo-tile)" />
      <path d={SYMBOL.beam} fill="var(--logo-glyph)" />
      <path d={SYMBOL.accent} fill="var(--logo-accent)" />
    </svg>
  )
}

export function Wordmark({ className, tone = "auto" }: { className?: string; tone?: Tone }) {
  return (
    <svg
      viewBox={WORDMARK.viewBox}
      aria-hidden
      style={{ aspectRatio: WORDMARK.ratio }}
      className={cn("h-[17px] w-auto shrink-0", tone === "inverse" && "brand-inverse", className)}
    >
      <path d={WORDMARK.letters} fill="var(--logo-text)" />
      <path d={WORDMARK.accent} fill="var(--logo-text-accent)" />
    </svg>
  )
}

const SIZES = {
  sm: { gap: "gap-2", mark: "size-7", word: "h-[15px]" },
  md: { gap: "gap-2.5", mark: "size-8", word: "h-[17px]" },
  lg: { gap: "gap-3", mark: "size-10", word: "h-[26px]" },
} as const

/** Símbolo + "Íntegra". `collapsed` mostra só o símbolo; `subtitle` entra abaixo do nome. */
export function Logo({
  collapsed,
  subtitle,
  size = "md",
  tone = "auto",
  className,
}: {
  collapsed?: boolean
  subtitle?: string
  size?: keyof typeof SIZES
  tone?: Tone
  className?: string
}) {
  const s = SIZES[size]
  return (
    <span className={cn("flex items-center", s.gap, className)}>
      <LogoMark tone={tone} className={s.mark} />
      <span className="sr-only">{BRAND.name}</span>
      {!collapsed && (
        <span className="flex min-w-0 flex-col items-start">
          <Wordmark tone={tone} className={s.word} />
          {subtitle && <span className="mt-0.5 max-w-full truncate text-[10.5px] tracking-[0.01em] text-muted-foreground">{subtitle}</span>}
        </span>
      )}
    </span>
  )
}
