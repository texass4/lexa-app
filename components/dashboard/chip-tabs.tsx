"use client"

import { cn } from "cn"

/** Filtros em pílulas dos cartões do Início (dias da agenda, períodos das tarefas). Setas trocam de aba. */
export function ChipTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
  wrap = false,
  variant = "soft",
}: {
  tabs: { value: T; label: string; count?: number; title?: string; alert?: boolean }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  /** Quebra em linhas em vez de rolar (colunas estreitas: nenhum filtro fica cortado). */
  wrap?: boolean
  /**
   * `solid`: a aba ativa preenchida em azul (dias da agenda, como na referência).
   * `segmented`: controle segmentado compacto numa só faixa (períodos das tarefas).
   */
  variant?: "soft" | "solid" | "segmented"
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[next].value)
    const el = e.currentTarget.parentElement?.children[next] as HTMLElement | undefined
    el?.focus()
  }
  const segmented = variant === "segmented"
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        segmented ? "flex w-full gap-0.5 rounded-[10px] border border-border bg-surface-muted/70 p-0.5" : "flex gap-1.5",
        wrap ? "flex-wrap" : "overflow-x-auto no-scrollbar",
        className,
      )}
    >
      {tabs.map((t, i) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(t.value)}
            title={t.title}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
              segmented ? "h-7 flex-1 justify-center gap-1 rounded-[8px] px-1.5 text-[12px]" : "h-8 rounded-full px-3 text-[12.5px]",
              segmented
                ? active
                  ? "border-brand/30 bg-card text-brand-strong shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                : active
                  ? variant === "solid"
                    ? "border-brand bg-brand text-brand-foreground shadow-xs"
                    : "border-brand/25 bg-brand-soft text-brand-strong"
                  : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && !(segmented && t.count === 0) && (
              <span
                className={cn(
                  "tabular text-[11px] font-semibold",
                  active ? (variant === "solid" ? "text-brand-foreground/85" : "text-brand-strong") : "text-subtle",
                  segmented && "text-[10.5px]",
                  t.alert && "text-danger",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
