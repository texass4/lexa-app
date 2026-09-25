import { cn } from "cn"

const STYLES: Record<string, string> = {
  pdf: "bg-danger-soft text-danger",
  docx: "bg-info-soft text-info",
  doc: "bg-info-soft text-info",
  txt: "bg-surface-muted text-muted-foreground",
  jpg: "bg-success-soft text-success",
  png: "bg-success-soft text-success",
}

export function FileIcon({ extension, className }: { extension: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex h-10 w-8 shrink-0 items-end justify-center rounded-[6px] pb-1.5 text-[8.5px] font-bold uppercase tracking-wide",
        STYLES[extension] ?? "bg-surface-muted text-muted-foreground",
        className,
      )}
    >
      <span className="absolute top-0 right-0 size-2.5 rounded-bl-[4px] bg-background/70" />
      {extension}
    </span>
  )
}
