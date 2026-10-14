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
}: {
  tabs: { value: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  /** Quebra em linhas em vez de rolar (colunas estreitas: nenhum filtro fica cortado). */
  wrap?: boolean
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[next].value)
    const el = e.currentTarget.parentElement?.children[next] as HTMLElement | undefined
    el?.focus()
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-1.5", wrap ? "flex-wrap" : "overflow-x-auto no-scrollbar", className)}>
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
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
              active
                ? "border-brand/25 bg-brand-soft text-brand-strong"
                : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("tabular text-[11px] font-semibold", active ? "text-brand-strong" : "text-subtle")}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
