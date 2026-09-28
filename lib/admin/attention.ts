import { LIMIT_META, type AdminOrganization, type AdminPlan, type AttentionItem } from "./catalog"

const DAY = 86_400_000

/**
 * O que pede ação do Admin agora, do mais urgente para o menos. Usado no dashboard
 * e no sino de notificações. Puro: recebe os dados já carregados.
 */
export function attentionItems(orgs: AdminOrganization[], plans: AdminPlan[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  const live = orgs.filter((o) => o.status !== "inactive")

  const pastDue = live.filter((o) => o.subscription?.status === "past_due")
  if (pastDue.length)
    items.push({
      kind: "past_due",
      tone: "danger",
      count: pastDue.length,
      title: `${pastDue.length} ${pastDue.length === 1 ? "escritório inadimplente" : "escritórios inadimplentes"}`,
      detail: pastDue.slice(0, 3).map((o) => o.name).join(", "),
      href: "/admin/financeiro?assinatura=past_due",
    })

  const pending = orgs.filter((o) => o.status === "pending")
  if (pending.length)
    items.push({
      kind: "pending",
      tone: "warning",
      count: pending.length,
      title: `${pending.length} ${pending.length === 1 ? "cadastro aguarda" : "cadastros aguardam"} aprovação`,
      detail: pending.slice(0, 3).map((o) => o.name).join(", "),
      href: "/admin/escritorios?status=pending",
    })

  const atLimit = live.filter((o) => o.alerts.length).sort((a, b) => b.alerts[0].ratio - a.alerts[0].ratio)
  if (atLimit.length) {
    const critical = atLimit.filter((o) => o.alerts.some((a) => a.level !== "warning")).length
    const top = atLimit[0].alerts[0]
    items.push({
      kind: "limit",
      tone: critical ? "danger" : "warning",
      count: atLimit.length,
      title: `${atLimit.length} ${atLimit.length === 1 ? "escritório próximo" : "escritórios próximos"} do limite`,
      detail: critical
        ? `${critical} já no limite ou acima. Ex.: ${atLimit[0].name} — ${LIMIT_META[top.key].label} em ${Math.round(top.ratio * 100)}%`
        : `Ex.: ${atLimit[0].name} — ${LIMIT_META[top.key].label} em ${Math.round(top.ratio * 100)}%`,
      href: "/admin/uso?alerta=1",
    })
  }

  const trialEnding = live.filter((o) => {
    const end = o.subscription?.status === "trialing" && o.subscription.trialEndsAt ? new Date(o.subscription.trialEndsAt).getTime() : NaN
    return !Number.isNaN(end) && end - now.getTime() <= 7 * DAY
  })
  if (trialEnding.length)
    items.push({
      kind: "trial_ending",
      tone: "info",
      count: trialEnding.length,
      title: `${trialEnding.length} ${trialEnding.length === 1 ? "teste termina" : "testes terminam"} em até 7 dias`,
      detail: trialEnding.slice(0, 3).map((o) => o.name).join(", "),
      href: "/admin/escritorios?assinatura=trialing",
    })

  const suspended = orgs.filter((o) => o.status === "suspended")
  if (suspended.length)
    items.push({
      kind: "suspended",
      tone: "neutral",
      count: suspended.length,
      title: `${suspended.length} ${suspended.length === 1 ? "escritório suspenso" : "escritórios suspensos"}`,
      detail: suspended.slice(0, 3).map((o) => o.name).join(", "),
      href: "/admin/escritorios?status=suspended",
    })

  const unpriced = plans.filter((p) => p.status === "active" && p.priceCents === 0)
  if (unpriced.length)
    items.push({
      kind: "unpriced",
      tone: "gold",
      count: unpriced.length,
      title: `${unpriced.length} ${unpriced.length === 1 ? "plano sem preço" : "planos sem preço"} definido`,
      detail: `A receita recorrente fica subestimada: ${unpriced.map((p) => p.name).join(", ")}`,
      href: "/admin/planos",
    })

  return items
}
