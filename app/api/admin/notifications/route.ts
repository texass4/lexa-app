import { NextResponse } from "next/server"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { loadAudit, loadOrganizations, loadPlans } from "@/lib/admin/data"
import { loadSettings } from "@/lib/admin/platform"
import { attentionItems } from "@/lib/admin/attention"
import { auditLabel, type AdminNotification } from "@/lib/admin/catalog"

/**
 * Sino do Admin e contadores do menu: pendências (derivadas do estado atual, somem
 * sozinhas quando resolvidas) + eventos críticos das últimas 24 h.
 */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const now = new Date()
  const [orgs, plans, critical, settings] = await Promise.all([
    loadOrganizations(),
    loadPlans(),
    loadAudit({ severity: "critical", from: new Date(now.getTime() - 86_400_000), limit: 10 }),
    loadSettings(),
  ])
  const attention = attentionItems(orgs, plans, now)
  const notifications: AdminNotification[] = [
    ...attention.map((a) => ({ id: `attention-${a.kind}`, tone: a.tone, title: a.title, detail: a.detail, href: a.href })),
    ...critical.entries.map((e) => ({
      id: `audit-${e.id}`,
      tone: "danger" as const,
      title: auditLabel(e.action),
      detail: [e.summary, e.actorName].filter(Boolean).join(" · "),
      href: `/admin/atividade?severity=critical`,
      at: e.at,
    })),
  ]
  return NextResponse.json({
    notifications,
    badges: {
      pending: orgs.filter((o) => o.status === "pending").length,
      usage: orgs.filter((o) => o.status !== "inactive" && o.alerts.length).length,
      pastDue: orgs.filter((o) => o.status !== "inactive" && o.subscription?.status === "past_due").length,
    },
    maintenance: settings.maintenance.enabled,
  })
})
