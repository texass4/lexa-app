import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

const control =
  "w-full min-w-0 rounded-control border border-input bg-surface text-[14px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-border-strong focus:border-brand/60 focus:ring-4 focus:ring-brand/10 aria-invalid:border-danger/60 aria-invalid:ring-danger/10 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 sm:text-[13.5px]"

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
        <p role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-10 px-3.5", className)} {...props} />
})

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[96px] resize-y px-3.5 py-2.5 leading-relaxed", className)} {...props} />
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-10 appearance-none pr-9 pl-3.5", className)} {...props}>
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
        className={cn(control, "tabular h-10 pr-3.5 pl-9")}
        value={display}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        {...props}
      />
    </div>
  )
}
