import Link from "next/link"
import { Building2, CreditCard, KeyRound, Layers, Settings2, UserRound, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { AUDIT_ACTIONS, auditLabel, type AuditEntry, type AuditGroup } from "@/lib/admin/catalog"
import { fmtRelative } from "@/lib/core/dates"

export const AUDIT_ICON: Record<AuditGroup, LucideIcon> = {
  auth: KeyRound,
  organization: Building2,
  user: UserRound,
  plan: Layers,
  billing: CreditCard,
  settings: Settings2,
}

const SEVERITY_CLS = {
  info: "border-border bg-surface-muted/60 text-muted-foreground",
  warning: "border-warning/20 bg-warning-soft text-warning",
  critical: "border-danger/20 bg-danger-soft text-danger",
}

/** Linha do tempo compacta de auditoria (dashboard e página do escritório). */
export function AuditList({ entries, showOrganization = true, empty = "Nenhum registro ainda." }: { entries: AuditEntry[]; showOrganization?: boolean; empty?: string }) {
  if (!entries.length) return <p className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => {
        const Icon = AUDIT_ICON[AUDIT_ACTIONS[e.action]?.group ?? "settings"]
        return (
          <li key={e.id} className="flex items-start gap-3 px-5 py-3">
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] border", SEVERITY_CLS[e.severity])}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground">{auditLabel(e.action)}</p>
              {e.summary && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{e.summary}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-subtle">
                <span>{e.actorName ?? "Sistema"}</span>
                {showOrganization && e.organizationId && (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={`/admin/escritorios/${e.organizationId}`} className="hover:text-foreground hover:underline">
                      {e.organizationName}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <time dateTime={e.at} title={new Date(e.at).toLocaleString("pt-BR")} className="shrink-0 whitespace-nowrap text-[11.5px] text-subtle">
              {fmtRelative(e.at)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
