import { cn } from "cn"
import { getNow, diffInDays, fmtDueIn, fmtShortDate, parse } from "@/lib/dates"

export function DeadlineLabel({ date, compact }: { date?: string; compact?: boolean }) {
  if (!date) return <span className="text-[12.5px] text-subtle">—</span>
  const diff = diffInDays(parse(date), getNow())
  const tone = diff <= 2 ? "text-danger" : diff <= 5 ? "text-warning" : "text-muted-foreground"
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="tabular text-[13px] font-medium text-foreground">{fmtShortDate(date)}</span>
      {!compact && <span className={cn("text-[11.5px]", tone)}>{fmtDueIn(date)}</span>}
    </span>
  )
}
