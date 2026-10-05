import { cn } from "cn"

export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-hidden rounded-card border border-border/90 bg-card shadow-card", className)}>{children}</div>
}

export function Th({ className, children, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap border-b border-border bg-surface-muted/45 px-4 text-left text-[11.5px] font-medium tracking-[0.01em] text-muted-foreground first:pl-6 last:pr-6",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className, children, ...props }: React.ComponentProps<"td">) {
  return (
    <td className={cn("border-b border-border/80 px-4 py-3.5 align-middle text-[13px] first:pl-6 last:pr-6", className)} {...props}>
      {children}
    </td>
  )
}
