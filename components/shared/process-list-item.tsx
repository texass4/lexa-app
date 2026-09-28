import Link from "next/link"
import { ChevronRight, History, Hourglass, Landmark } from "lucide-react"
import { cn } from "cn"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { PROCESS_STATUS } from "@/lib/config"
import { getNow, diffInDays, fmtDayMonth, fmtDueIn, fmtNumericDate, parse } from "@/lib/dates"
import { getUser } from "@/lib/account"
import type { Process } from "@/types"

export function ProcessListItem({ process: p }: { process: Process }) {
  const status = PROCESS_STATUS[p.status]
  const owner = getUser(p.ownerId)
  const due = p.nextDeadline ? diffInDays(parse(p.nextDeadline.date), getNow()) : undefined
  const urgent = due !== undefined && due <= 3
  const lastMovement = p.movements.reduce<Process["movements"][number] | undefined>((last, m) => (!last || m.at > last.at ? m : last), undefined)
  const court = p.judicialUnit ?? p.court

  return (
    <Link
      href={`/processos/${p.id}`}
      className="group flex flex-col gap-4 rounded-[14px] border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[0_8px_24px_-16px_rgb(23_23_23/0.25)] focus-visible:ring-2 focus-visible:ring-gold/40 sm:flex-row sm:items-center sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-medium tracking-tight text-foreground">{p.number}</span>
          <span className="text-[11.5px] text-subtle">{p.code}</span>
          {p.tribunal && <span className="text-[11.5px] font-medium text-muted-foreground">· {p.tribunal}</span>}
        </div>
        <p className="mt-1 truncate text-[14px] font-semibold text-foreground">{p.className ?? p.type}</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
          <Landmark className="size-3.5 shrink-0 text-subtle" />
          <span className="truncate">{court || "Órgão julgador não informado"}</span>
        </p>
        {lastMovement && (
          <p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
            <History className="size-3.5 shrink-0 text-subtle" />
            <span className="tabular shrink-0">{fmtNumericDate(lastMovement.at)}</span>
            <span className="truncate">· {lastMovement.title}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:flex-nowrap">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <UserAvatar name={owner.name} size="xs" />
          {owner.firstName}
        </div>
        <div className="min-w-[128px]">
          {p.nextDeadline ? (
            <>
              <p className={cn("flex items-center gap-1.5 text-[12.5px] font-medium", urgent ? "text-danger" : "text-foreground")}>
                <Hourglass className="size-3.5" />
                {fmtDayMonth(p.nextDeadline.date)} · {fmtDueIn(p.nextDeadline.date)}
              </p>
              <p className="mt-0.5 max-w-[180px] truncate text-[11.5px] text-muted-foreground">{p.nextDeadline.title}</p>
            </>
          ) : (
            <p className="text-[12.5px] text-subtle">Sem prazos</p>
          )}
        </div>
        <ChevronRight className="hidden size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
      </div>
    </Link>
  )
}
