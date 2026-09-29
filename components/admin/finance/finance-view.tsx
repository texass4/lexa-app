"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowDownRight, ArrowUpRight, CircleAlert, CreditCard, PlugZap, Receipt, RefreshCw, TrendingUp, Wallet, CircleX } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { Skeleton, SkeletonStats } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useAdminData } from "@/lib/admin/client"
import { formatCents, formatCentsCompact, PAYMENT_STATUS, SUBSCRIPTION_STATUS, type FinanceData, type SubscriptionStatus } from "@/lib/admin/catalog"
import { fmtNumericDate, fmtRelative } from "@/lib/dates"
import { AdminHeader } from "../ui/admin-header"
import { StatCard } from "../ui/stat-card"
import { PeriodFilter, usePeriod } from "../ui/period-filter"
import { BarList, BarsChart } from "../ui/charts"
import { SubscriptionBadge } from "../ui/badges"

type SubFilter = "all" | SubscriptionStatus

function GatewayBanner({ gateway }: { gateway: FinanceData["gateway"] }) {
  if (gateway.connected) {
    return (
      <Panel className="flex items-center gap-3 p-4">
        <PlugZap className="size-5 text-success" />
        <p className="text-[13px]">
          Gateway <strong className="font-semibold capitalize">{gateway.provider}</strong> configurado no servidor. Pagamentos gravados pelo webhook aparecem abaixo.
        </p>
      </Panel>
    )
  }
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--brand)_10%,transparent),transparent_60%)] p-5 md:flex-row md:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-brand/25 bg-brand-soft text-brand-strong">
          <CreditCard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Cobrança ainda não integrada</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Os valores abaixo são <strong className="font-medium text-foreground">estimados</strong> pelo preço dos planos e pela situação das assinaturas (controlada
            manualmente em cada escritório). A estrutura já está pronta para Stripe ou Mercado Pago: configure a chave no servidor e o webhook passa a gravar os
            pagamentos, que alimentam receita, inadimplência e histórico.
          </p>
        </div>
        <Link href="/admin/planos" className="shrink-0 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          Revisar preços →
        </Link>
      </div>
    </Panel>
  )
}

export function FinanceView() {
  const params = useSearchParams()
  const { period, update, query } = usePeriod("30d")
  const { data, error, loading, reload } = useAdminData<FinanceData>(`/api/admin/finance?${query}`)
  const [subFilter, setSubFilter] = React.useState<SubFilter>((params.get("assinatura") as SubFilter | null) ?? "all")

  const subs = (data?.subscriptions ?? []).filter((s) => subFilter === "all" || s.status === subFilter)
  const subCount = (s: SubFilter) => (data?.subscriptions ?? []).filter((x) => s === "all" || x.status === s).length
  const hasPayments = !!data?.payments.length

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Negócio"
        title="Financeiro"
        description="Receita recorrente, assinaturas, inadimplência e movimentações de plano."
        actions={
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <PeriodFilter period={period} onChange={update} />
            <Button variant="ghost" size="icon-sm" aria-label="Atualizar" onClick={reload} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {error && !data ? (
        <Panel>
          <ErrorState onRetry={reload} description={error} />
        </Panel>
      ) : !data ? (
        <div className="space-y-4">
          <Skeleton className="h-[96px] rounded-[14px]" />
          <SkeletonStats />
          <Skeleton className="h-[300px] rounded-[14px]" />
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <GatewayBanner gateway={data.gateway} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={data.gateway.connected ? "MRR" : "MRR estimado"}
              value={formatCents(data.mrrCents)}
              icon={<Wallet />}
              hint={`ARR ${formatCentsCompact(data.arrCents)} · ticket médio ${formatCents(data.arpaCents)}`}
            />
            <StatCard
              label="Assinaturas ativas"
              value={data.counts.paying}
              icon={<TrendingUp />}
              hint={`${data.counts.trialing} em teste · potencial +${formatCentsCompact(data.potentialCents)}/mês`}
              hintTone="info"
              href="/admin/escritorios?assinatura=trialing"
              action="Testes"
            />
            <StatCard
              label="Inadimplência"
              value={data.counts.pastDue}
              icon={<CircleAlert />}
              hint={data.counts.pastDue ? `${formatCents(data.pastDueCents)}/mês em risco` : "Nenhuma assinatura em atraso"}
              hintTone={data.counts.pastDue ? "danger" : "success"}
            />
            <StatCard
              label="Cancelamentos no período"
              value={data.counts.canceledInPeriod}
              icon={<CircleX />}
              hint={`${data.counts.canceled} canceladas no total`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Panel className="lg:col-span-3">
              <PanelHeader
                title="Receita mensal"
                description={hasPayments ? "Pagamentos recebidos por mês (últimos 6 meses)" : "Aparece quando houver pagamentos registrados pelo gateway"}
              />
              <div className="px-3 pb-4">
                {hasPayments ? (
                  <BarsChart
                    data={data.monthly.map((m) => ({ label: m.label, full: m.month, value: m.paidCents / 100 }))}
                    unit="recebidos"
                    label="Receita recebida por mês"
                    format={(v) => formatCentsCompact(v * 100)}
                  />
                ) : (
                  <EmptyState compact icon={<Receipt />} title="Nenhum pagamento registrado ainda." description="Com o gateway conectado, cada cobrança paga entra aqui." />
                )}
              </div>
            </Panel>
            <Panel className="lg:col-span-2">
              <PanelHeader title="Receita por plano" description="Assinaturas ativas × preço mensal" />
              <div className="px-5 pb-5">
                <BarList
                  items={data.revenueByPlan.map((p) => ({ label: p.plan, value: p.mrrCents, detail: `${p.organizations} escr.` }))}
                  format={(v) => formatCents(v)}
                  empty="Nenhuma assinatura ativa com preço definido."
                />
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel>
              <PanelHeader title="Upgrades e downgrades" description="Mudanças de plano no período" />
              <div className="grid grid-cols-2 gap-3 px-5 pb-4">
                <div className="rounded-[12px] bg-success-soft/70 px-4 py-3">
                  <p className="flex items-center gap-1 text-[12px] text-success">
                    <ArrowUpRight className="size-3.5" /> Upgrades
                  </p>
                  <p className="tabular text-[22px] font-semibold">{data.changes.upgrades}</p>
                </div>
                <div className="rounded-[12px] bg-danger-soft/70 px-4 py-3">
                  <p className="flex items-center gap-1 text-[12px] text-danger">
                    <ArrowDownRight className="size-3.5" /> Downgrades
                  </p>
                  <p className="tabular text-[22px] font-semibold">{data.changes.downgrades}</p>
                </div>
              </div>
              {data.changes.entries.length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {data.changes.entries.slice(0, 6).map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate">{e.summary}</span>
                      <span className="shrink-0 text-[11.5px] text-subtle">{fmtRelative(e.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border px-5 py-4 text-[12.5px] text-muted-foreground">Nenhuma mudança de plano no período.</p>
              )}
            </Panel>

            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Pagamentos"
                description={
                  hasPayments
                    ? `Recebido no período ${formatCents(data.paymentTotals.paidPeriodCents)} · a vencer ${formatCents(data.paymentTotals.pendingCents)} · vencido ${formatCents(data.paymentTotals.overdueCents)}`
                    : "Histórico de cobranças do gateway"
                }
              />
              {hasPayments ? (
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full min-w-[560px] border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <Th>Escritório</Th>
                        <Th className="text-right">Valor</Th>
                        <Th>Status</Th>
                        <Th>Vencimento</Th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child_td]:border-0">
                      {data.payments.slice(0, 12).map((p) => (
                        <tr key={p.id}>
                          <Td>
                            <Link href={`/admin/escritorios/${p.organizationId}`} className="hover:underline">
                              {p.organizationName}
                            </Link>
                          </Td>
                          <Td className="tabular text-right">{formatCents(p.amountCents)}</Td>
                          <Td>
                            <StatusBadge tone={p.overdue ? "danger" : PAYMENT_STATUS[p.status].tone}>{p.overdue ? "Vencido" : PAYMENT_STATUS[p.status].label}</StatusBadge>
                          </Td>
                          <Td className="tabular text-muted-foreground">{p.dueDate ? fmtNumericDate(p.dueDate) : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact icon={<Receipt />} title="Sem pagamentos." description="Pagamentos, falhas e estornos aparecem aqui quando o gateway estiver conectado." />
              )}
            </Panel>
          </div>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Assinaturas</h2>
                <p className="text-[12.5px] text-muted-foreground">Situação de cobrança de cada escritório. Altere na página do escritório › Configurações.</p>
              </div>
              <FilterTabs
                ariaLabel="Situação da assinatura"
                layoutId="finance-subs"
                value={subFilter}
                onChange={setSubFilter}
                options={[
                  { value: "all", label: "Todas", count: subCount("all") },
                  ...(Object.keys(SUBSCRIPTION_STATUS) as SubscriptionStatus[]).map((s) => ({ value: s, label: SUBSCRIPTION_STATUS[s].label, count: subCount(s) })),
                ]}
              />
            </div>
            <TableShell>
              {subs.length ? (
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full min-w-[760px] border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <Th>Escritório</Th>
                        <Th>Plano</Th>
                        <Th className="text-right">Valor/mês</Th>
                        <Th>Situação</Th>
                        <Th>Detalhe</Th>
                        <Th>Cobrança</Th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child_td]:border-0">
                      {subs.map((s) => (
                        <tr key={s.organizationId} className="hover:bg-surface-muted/40">
                          <Td>
                            <Link href={`/admin/escritorios/${s.organizationId}?aba=config`} className="font-medium hover:underline">
                              {s.organizationName}
                            </Link>
                          </Td>
                          <Td>{s.plan}</Td>
                          <Td className="tabular text-right">{s.monthlyCents ? formatCents(s.monthlyCents) : <span className="text-subtle">sem preço</span>}</Td>
                          <Td>
                            <SubscriptionBadge status={s.status} />
                          </Td>
                          <Td className="text-[12.5px] text-muted-foreground">
                            {s.status === "trialing" && s.trialEndsAt
                              ? `Teste até ${fmtNumericDate(s.trialEndsAt)}`
                              : s.status === "canceled" && s.canceledAt
                                ? `Cancelada em ${fmtNumericDate(s.canceledAt)}${s.cancelReason ? ` · ${s.cancelReason}` : ""}`
                                : `Desde ${fmtNumericDate(s.since)}`}
                          </Td>
                          <Td className="text-[12.5px] text-muted-foreground">{s.gateway === "manual" ? "Manual" : s.gateway}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact icon={<CreditCard />} title="Nenhuma assinatura nesta situação." />
              )}
            </TableShell>
          </section>
        </div>
      )}
    </div>
  )
}
