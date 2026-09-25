import { Bell, CalendarCheck, CircleDollarSign, FileText, Gavel, ListChecks, RefreshCw, Scale, Signature, UsersRound } from "lucide-react"
import { cn } from "cn"
import type { ActivityType } from "@/types"

const MAP: Record<ActivityType, { icon: React.ElementType; cls: string }> = {
  document: { icon: FileText, cls: "text-info" },
  contract: { icon: Signature, cls: "text-success" },
  petition: { icon: Scale, cls: "text-foreground" },
  appointment: { icon: CalendarCheck, cls: "text-violet" },
  payment: { icon: CircleDollarSign, cls: "text-success" },
  task: { icon: ListChecks, cls: "text-muted-foreground" },
  client: { icon: UsersRound, cls: "text-gold-dark" },
  hearing: { icon: Gavel, cls: "text-violet" },
  summons: { icon: Bell, cls: "text-warning" },
  movement: { icon: RefreshCw, cls: "text-info" },
}

export function ActivityIconGlyph({ type }: { type: ActivityType }) {
  const { icon: Icon } = MAP[type]
  return <Icon strokeWidth={1.9} />
}

export function ActivityIcon({ type, className }: { type: ActivityType; className?: string }) {
  const { icon: Icon, cls } = MAP[type]
  return (
    <span
      className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface", cls, className)}
    >
      <Icon className="size-3.5" strokeWidth={1.9} />
    </span>
  )
}
