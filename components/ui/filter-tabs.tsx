"use client"

import { motion } from "framer-motion"
import { cn } from "cn"

export interface FilterOption<T extends string> {
  value: T
  label: string
  count?: number
}

/** Filtros segmentados com indicador animado. Rola horizontalmente no mobile. */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  className,
  layoutId,
  ariaLabel,
}: {
  options: FilterOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  layoutId: string
  ariaLabel: string
}) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-surface-muted/60 p-[3px]"
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "relative inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="absolute inset-0 rounded-[7px] border border-border bg-surface shadow-xs"
                />
              )}
              <span className="relative">{opt.label}</span>
              {opt.count !== undefined && (
                <span className={cn("relative tabular text-[11px]", active ? "text-muted-foreground" : "text-subtle")}>{opt.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
