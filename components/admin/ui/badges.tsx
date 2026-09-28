import { StatusBadge } from "@/components/ui/status-badge"
import { ORG_STATUS, SUBSCRIPTION_STATUS, type OrgStatus, type SeriesPoint, type SubscriptionStatus } from "@/lib/admin/catalog"
import { fmtDayLabel } from "@/lib/dates"
import type { ChartPoint } from "./charts"

export function OrgStatusBadge({ status, size }: { status: OrgStatus; size?: "sm" | "default" }) {
  return (
    <StatusBadge tone={ORG_STATUS[status].tone} size={size}>
      {ORG_STATUS[status].label}
    </StatusBadge>
  )
}

export function SubscriptionBadge({ status, size }: { status: SubscriptionStatus; size?: "sm" | "default" }) {
  return (
    <StatusBadge tone={SUBSCRIPTION_STATUS[status].tone} size={size} dot={false}>
      {SUBSCRIPTION_STATUS[status].label}
    </StatusBadge>
  )
}

/** Série diária → pontos de gráfico ("21/09" no eixo, "Seg, 21 set" no tooltip). */
export function toChart(series: SeriesPoint[], key: keyof SeriesPoint | "totalOrganizations" | "totalUsers"): ChartPoint[] {
  return series.map((p) => ({
    label: `${p.day.slice(8, 10)}/${p.day.slice(5, 7)}`,
    full: fmtDayLabel(p.day),
    value: Number((p as unknown as Record<string, number>)[key] ?? 0),
  }))
}
