"use client"

import { cn } from "cn"

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  renderIcon,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  renderIcon?: (v: T) => React.ReactNode
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt === value
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] font-medium outline-none transition-[background-color,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-gold/40 [&_svg]:size-3.5",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {renderIcon?.(opt)}
            {opt}
          </button>
        )
      })}
    </div>
  )
}
