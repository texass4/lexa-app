import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

const control =
  "w-full min-w-0 rounded-[9px] border border-input bg-surface text-[14px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle hover:border-border-strong focus:border-gold/55 focus:ring-3 focus:ring-gold/12 aria-invalid:border-danger/60 aria-invalid:ring-danger/10 disabled:opacity-60 sm:text-[13.5px]"

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
  optional?: boolean
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
        {label}
        {optional && <span className="font-normal text-subtle">opcional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-9 px-3", className)} {...props} />
})

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[88px] resize-y px-3 py-2 leading-relaxed", className)} {...props} />
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-9 appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  )
}

export function CurrencyInput({
  value,
  onChange,
  id,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: number; onChange: (v: number) => void }) {
  const display = value ? value.toLocaleString("pt-BR") : ""
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-subtle">R$</span>
      <input
        id={id}
        inputMode="numeric"
        className={cn(control, "tabular h-9 pr-3 pl-9")}
        value={display}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        {...props}
      />
    </div>
  )
}
