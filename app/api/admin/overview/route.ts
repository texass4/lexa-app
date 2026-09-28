import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { loadAudit, loadOrganizations, loadPlans, loadSeries, loadUsers } from "@/lib/admin/data"
import { loadSettings } from "@/lib/admin/platform"
import { attentionItems } from "@/lib/admin/attention"
import { parseRange, type OverviewData } from "@/lib/admin/catalog"

const within = (iso: string | undefined, from: Date, to: Date) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t < to.getTime()
}

/** Dashboard executivo: números, séries do período, distribuição de planos e o que pede ação. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const now = new Date()
  const { from, to } = parseRange(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"), now)
  const span = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - span)

  const [orgs, plans, users, series, recent, settings] = await Promise.all([
    loadOrganizations(),
    loadPlans(),
    loadUsers(),
    loadSeries(from, to),
    loadAudit({ limit: 6 }),
    loadSettings(),
  ])

  const count = (fn: (o: (typeof orgs)[number]) => boolean) => orgs.filter(fn).length
  const sum = (fn: (o: (typeof orgs)[number]) => number) => orgs.reduce((acc, o) => acc + fn(o), 0)
  const paying = orgs.filter((o) => o.status === "active" && o.subscription?.status === "active")

  // Séries acumuladas: o que já existia antes do período + o que entrou a cada dia.
  let totalOrganizations = count((o) => new Date(o.createdAt) < from)
  let totalUsers = users.filter((u) => new Date(u.createdAt) < from).length
  const cumulative = series.map((p) => {
    totalOrganizations += p.organizations
    totalUsers += p.users
    return { ...p, totalOrganizations, totalUsers }
  })

  const distribution = new Map<string, number>()
  for (const o of orgs) if (o.status !== "inactive") distribution.set(o.plan, (distribution.get(o.plan) ?? 0) + 1)

  const topUsage = orgs
    .filter((o) => o.status !== "inactive" && o.alerts.length)
    .map((o) => ({ id: o.id, name: o.name, plan: o.plan, ...o.alerts[0] }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5)
    .map(({ id, name, plan, key, ratio, used, limit }) => ({ id, name, plan, key, ratio, used, limit }))

  const data: OverviewData = {
    range: { from: from.toISOString(), to: to.toISOString() },
    kpis: {
      organizations: {
        active: count((o) => o.status === "active"),
        trial: count((o) => o.status !== "inactive" && o.subscription?.status === "trialing"),
        pending: count((o) => o.status === "pending"),
        suspended: count((o) => o.status === "suspended"),
        inactive: count((o) => o.status === "inactive"),
        total: orgs.length,
      },
      newOrganizations: { current: count((o) => within(o.createdAt, from, to)), previous: count((o) => within(o.createdAt, prevFrom, from)) },
      users: {
        total: users.length,
        active: users.filter((u) => u.active && u.organizationStatus === "active").length,
        signedInPeriod: users.filter((u) => within(u.lastSignInAt, from, to)).length,
        newCurrent: users.filter((u) => within(u.createdAt, from, to)).length,
        newPrevious: users.filter((u) => within(u.createdAt, prevFrom, from)).length,
      },
      totals: {
        clients: sum((o) => o.usage.clients),
        processes: sum((o) => o.usage.processes),
        tasks: sum((o) => o.usage.tasks),
        documents: sum((o) => o.usage.documents),
        appointments: sum((o) => o.usage.appointments),
        storageBytes: sum((o) => o.usage.storageBytes),
        whatsappMonth: sum((o) => o.usage.whatsappMonth),
        aiMonth: sum((o) => o.usage.aiMonth),
      },
      mrrCents: paying.reduce((acc, o) => acc + o.planMonthlyCents, 0),
      payingOrganizations: paying.length,
      unpricedPlans: plans.filter((p) => p.status === "active" && p.priceCents === 0).length,
    },
    series: cumulative,
    planDistribution: [...distribution.entries()]
      .map(([plan, n]) => {
        const p = plans.find((x) => x.name === plan)
        return { plan, count: n, monthlyCents: p ? (p.interval === "year" ? Math.round(p.priceCents / 12) : p.priceCents) : 0 }
      })
      .sort((a, b) => b.count - a.count),
    attention: attentionItems(orgs, plans, now),
    topUsage,
    recent: recent.entries,
    maintenance: settings.maintenance.enabled,
  }
  return NextResponse.json(data)
})
