import { cn } from "cn"

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-surface px-1 font-sans text-[10.5px] font-medium text-muted-foreground shadow-[0_1px_0_var(--border)]",
        className,
      )}
      {...props}
    />
  )
}
