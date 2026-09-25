import { cn } from "cn"

export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-hidden rounded-[14px] border border-border bg-card shadow-card", className)}>{children}</div>
}

export function Th({ className, children, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap border-b border-border bg-surface-muted/40 px-4 text-left text-[11.5px] font-medium text-muted-foreground first:pl-5 last:pr-5",
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
    <td className={cn("border-b border-border px-4 py-3 align-middle text-[13px] first:pl-5 last:pr-5", className)} {...props}>
      {children}
    </td>
  )
}
