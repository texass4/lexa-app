"use client"

import { motion } from "framer-motion"
import { cn } from "cn"

export function AnimatedCheckbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean
  onChange: () => void
  label: string
  className?: string
}) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      whileTap={{ scale: 0.86 }}
      className={cn(
        "relative flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "border-foreground bg-foreground text-background" : "border-border-strong bg-surface hover:border-foreground/40",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
        <motion.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      </svg>
      {checked && (
        <motion.span
          aria-hidden
          initial={{ scale: 0.6, opacity: 0.45 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-[5px] bg-gold/40"
        />
      )}
    </motion.button>
  )
}
