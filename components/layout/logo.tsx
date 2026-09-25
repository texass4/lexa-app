import { cn } from "cn"

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-[#171717] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] dark:bg-[#ECEBE8]",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-full">
        <path d="M11 8.5v15h10" fill="none" stroke="#C4A274" strokeWidth="2.4" strokeLinecap="square" />
        <path d="M16 8.5h5" fill="none" stroke="#C4A274" strokeWidth="1.2" strokeLinecap="square" opacity="0.55" />
      </svg>
    </span>
  )
}

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && (
        <span className="flex flex-col leading-none">
          <span className="text-[14px] font-semibold tracking-[0.22em] text-foreground">LEXA</span>
          <span className="mt-1 text-[10.5px] tracking-[0.02em] text-muted-foreground">Almeida &amp; Associados</span>
        </span>
      )}
    </span>
  )
}
