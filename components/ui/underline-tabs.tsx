"use client"

import { motion } from "framer-motion"
import { cn } from "cn"

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
  className,
  ariaLabel,
}: {
  tabs: { value: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
  layoutId: string
  className?: string
  ariaLabel: string
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
    <div className={cn("-mx-4 overflow-x-auto border-b border-border px-4 no-scrollbar sm:mx-0 sm:px-0", className)}>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-6">
        {tabs.map((tab, i) => {
          const active = tab.value === value
          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap text-[13.5px] font-medium outline-none transition-colors focus-visible:text-foreground",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 py-px text-[11px] font-semibold",
                    active ? "bg-brand-soft text-brand" : "bg-surface-muted text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              )}
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
