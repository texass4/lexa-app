import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/cn"

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink"
type Size = "sm" | "md" | "icon" | "icon-sm"

const variants: Record<Variant, string> = {
  primary: "bg-cobalt text-white hover:bg-cobalt-ink active:bg-cobalt-ink border border-transparent",
  secondary: "bg-white text-ink border border-line hover:border-line-strong hover:bg-paper/60",
  ghost: "bg-transparent text-ink-3 hover:text-ink hover:bg-ink/5 border border-transparent",
  danger: "bg-clay text-white hover:bg-clay/90 border border-transparent",
  ink: "bg-ink text-paper hover:bg-ink-2 border border-transparent",
}
const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8.5 px-3.5 text-sm gap-2",
  icon: "h-8.5 w-8.5 justify-center",
  "icon-sm": "h-7 w-7 justify-center",
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }

export const buttonClass = (variant: Variant = "secondary", size: Size = "md", extra?: string) =>
  cn(
    "inline-flex shrink-0 items-center rounded-sm font-medium whitespace-nowrap transition-colors duration-100 select-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    extra,
  )

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", className, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />
})
