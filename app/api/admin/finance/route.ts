import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { loadAudit, loadOrganizations } from "@/lib/admin/data"
import { parseRange, type FinanceData, type PaymentStatus } from "@/lib/admin/catalog"

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

/**
 * Qual gateway está configurado no servidor — só o nome, nunca a chave. Enquanto
 * nenhum estiver, a cobrança é "manual" e a receita é estimada pelos planos.
 */
function gatewayStatus() {
  if (process.env.STRIPE_SECRET_KEY) return { connected: true, provider: "stripe" }
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) return { connected: true, provider: "mercadopago" }
  return { connected: false, provider: null }
}

interface PaymentRow {
  id: string
  organization_id: string
  amount_cents: number
  status: PaymentStatus
  description: string | null
  due_date: string | null
  paid_at: string | null
  created_at: string
}

export const GET = route(async (request) => {
  await requireAdmin(request)
  const now = new Date()
  const { from, to } = parseRange(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"), now)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [orgs, paymentsRes, planChanges] = await Promise.all([
    loadOrganizations(),
    getSupabaseAdmin()
      .from("payments")
      .select("*")
      .gte("created_at", (from < sixMonthsAgo ? from : sixMonthsAgo).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
    loadAudit({ from, to, group: "plan", limit: 100 }),
  ])
  const names = new Map(orgs.map((o) => [o.id, o.name]))
  const today = now.toISOString().slice(0, 10)

  const subs = orgs
    .filter((o) => o.subscription)
    .map((o) => ({
      organizationId: o.id,
      organizationName: o.name,
      organizationStatus: o.status,
      plan: o.plan,
      monthlyCents: o.planMonthlyCents,
      status: o.subscription!.status,
      trialEndsAt: o.subscription!.trialEndsAt,
      since: o.subscription!.currentPeriodStart ?? o.subscription!.createdAt,
      canceledAt: o.subscription!.canceledAt,
      cancelReason: o.subscription!.cancelReason,
      gateway: o.subscription!.gateway,
    }))

  const paying = subs.filter((s) => s.status === "active" && s.organizationStatus === "active")
  const pastDue = subs.filter((s) => s.status === "past_due")
  const mrrCents = paying.reduce((acc, s) => acc + s.monthlyCents, 0)

  const byPlan = new Map<string, { organizations: number; mrrCents: number }>()
  for (const s of paying) {
    const cur = byPlan.get(s.plan) ?? { organizations: 0, mrrCents: 0 }
    byPlan.set(s.plan, { organizations: cur.organizations + 1, mrrCents: cur.mrrCents + s.monthlyCents })
  }

  const payments = ((paymentsRes.data ?? []) as PaymentRow[]).map((p) => ({
    id: p.id,
    organizationId: p.organization_id,
    organizationName: names.get(p.organization_id) ?? "Escritório removido",
    amountCents: p.amount_cents,
    status: p.status,
    description: p.description ?? undefined,
    dueDate: p.due_date ?? undefined,
    paidAt: p.paid_at ?? undefined,
    createdAt: p.created_at,
    overdue: p.status === "pending" && !!p.due_date && p.due_date < today,
  }))

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const inMonth = payments.filter((p) => (p.paidAt ?? p.dueDate ?? p.createdAt).slice(0, 7) === key)
    return {
      month: key,
      label: MONTHS[d.getMonth()],
      paidCents: inMonth.filter((p) => p.status === "paid").reduce((a, p) => a + p.amountCents, 0),
      pendingCents: inMonth.filter((p) => p.status === "pending").reduce((a, p) => a + p.amountCents, 0),
    }
  })

  const inPeriod = (iso?: string) => !!iso && new Date(iso) >= from && new Date(iso) < to
  const changes = planChanges.entries.filter((e) => e.action === "organization.plan_changed")

  const data: FinanceData = {
    range: { from: from.toISOString(), to: to.toISOString() },
    gateway: gatewayStatus(),
    mrrCents,
    arrCents: mrrCents * 12,
    arpaCents: paying.length ? Math.round(mrrCents / paying.length) : 0,
    counts: {
      paying: paying.length,
      trialing: subs.filter((s) => s.status === "trialing" && s.organizationStatus !== "inactive").length,
      pastDue: pastDue.length,
      canceled: subs.filter((s) => s.status === "canceled").length,
      canceledInPeriod: subs.filter((s) => s.status === "canceled" && inPeriod(s.canceledAt)).length,
    },
    pastDueCents: pastDue.reduce((a, s) => a + s.monthlyCents, 0),
    potentialCents: subs.filter((s) => s.status === "trialing" && s.organizationStatus !== "inactive").reduce((a, s) => a + s.monthlyCents, 0),
    revenueByPlan: [...byPlan.entries()].map(([plan, v]) => ({ plan, ...v })).sort((a, b) => b.mrrCents - a.mrrCents),
    monthly,
    subscriptions: subs,
    payments: payments.slice(0, 100),
    paymentTotals: {
      paidPeriodCents: payments.filter((p) => p.status === "paid" && inPeriod(p.paidAt)).reduce((a, p) => a + p.amountCents, 0),
      pendingCents: payments.filter((p) => p.status === "pending" && !p.overdue).reduce((a, p) => a + p.amountCents, 0),
      overdueCents: payments.filter((p) => p.overdue).reduce((a, p) => a + p.amountCents, 0),
      failed: payments.filter((p) => p.status === "failed" && inPeriod(p.createdAt)).length,
    },
    changes: {
      upgrades: changes.filter((e) => e.metadata.direction === "upgrade").length,
      downgrades: changes.filter((e) => e.metadata.direction === "downgrade").length,
      entries: changes.slice(0, 20),
    },
  }
  return NextResponse.json(data)
})
