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
        className="inline-flex items-center gap-0.5 rounded-[12px] border border-border/80 bg-surface-muted/70 p-1"
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
                "touch-target relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-control px-3 pointer-coarse:h-9 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="absolute inset-0 rounded-control border border-border/80 bg-surface shadow-xs"
                />
              )}
              <span className="relative">{opt.label}</span>
              {opt.count !== undefined && (
                <span
                  className={cn(
                    "relative tabular flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    active ? "bg-primary text-primary-foreground" : "bg-border/60 text-muted-foreground",
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
