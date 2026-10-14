import Link from "next/link"
import { ChevronRight, History, Hourglass, Landmark } from "lucide-react"
import { cn } from "cn"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { PROCESS_STATUS } from "@/lib/core/config"
import { getNow, diffInDays, fmtDayMonth, fmtDueIn, fmtNumericDate, parse } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { PRAZO_ALERT_DAYS } from "@/lib/dashboard/attention"
import type { Prazo, Process } from "@/types"

/** `nextPrazo`: o próximo prazo aberto do processo (calculado por quem lista, a partir dos prazos). */
export function ProcessListItem({ process: p, nextPrazo }: { process: Process; nextPrazo?: Prazo }) {
  const status = PROCESS_STATUS[p.status]
  const owner = getUser(p.ownerId)
  const next = p.status === "concluido" ? undefined : nextPrazo
  const due = next ? diffInDays(parse(next.fatalDate), getNow()) : undefined
  const urgent = due !== undefined && due <= PRAZO_ALERT_DAYS.soon
  const lastMovement = p.movements.reduce<Process["movements"][number] | undefined>((last, m) => (!last || m.at > last.at ? m : last), undefined)
  const court = p.judicialUnit ?? p.court

  return (
    <Link
      href={`/processos/${p.id}`}
      className="group flex flex-col gap-4 rounded-card border border-border/90 bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/40 sm:flex-row sm:items-center sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-medium tracking-tight text-foreground">{p.number || "Sem número"}</span>
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
          {next ? (
            <>
              <p className={cn("flex items-center gap-1.5 text-[12.5px] font-medium", urgent ? "text-danger" : "text-foreground")}>
                <Hourglass className="size-3.5" />
                {fmtDayMonth(next.fatalDate)} · {fmtDueIn(next.fatalDate)}
              </p>
              <p className="mt-0.5 max-w-[180px] truncate text-[11.5px] text-muted-foreground">{next.description}</p>
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
