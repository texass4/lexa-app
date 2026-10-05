"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowUpRight, CircleCheck, CircleDollarSign, Download, Ellipsis, Pencil, Plus, Trash2, TrendingUp, TriangleAlert, Wallet, Percent } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { MetricCard } from "@/components/ui/metric-card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { FadeIn } from "@/components/ui/motion"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RevenueBarChart } from "./revenue-chart"
import { NewInvoiceDialog } from "./new-invoice-dialog"
import { PayInvoiceDialog } from "./pay-invoice-dialog"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { INVOICE_STATUS } from "@/lib/core/config"
import { fmtDayMonthParts, fmtDueIn, fmtNumericDate, getNow, toLocalISO } from "@/lib/core/dates"
import { downloadCSV } from "@/lib/core/csv"
import { formatCurrency } from "@/lib/core/format"
import { financeSummary, invoiceListTab, invoiceStatus, monthlyRevenue, openReceivables, revenueByArea, type InvoiceListTab } from "@/lib/store/selectors"
import { useSession, Can } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import type { Invoice } from "@/types"

const TABS: { value: InvoiceListTab; label: string }[] = [
  { value: "receber", label: "A receber" },
  { value: "recebidos", label: "Recebidos" },
  { value: "atraso", label: "Em atraso" },
  { value: "cancelados", label: "Cancelados" },
]

const EMPTY_TAB: Record<InvoiceListTab, { title: string; description: string }> = {
  receber: { title: "Nada a receber.", description: "Lançamentos previstos e ainda no prazo aparecem aqui." },
  recebidos: { title: "Nenhum recebimento.", description: "Quando um lançamento for marcado como recebido, ele entra aqui." },
  atraso: { title: "Nada em atraso.", description: "Previstos com vencimento passado aparecem aqui." },
  cancelados: { title: "Nenhum lançamento cancelado.", description: "Cancelamentos ficam registrados nesta lista." },
}

export function FinanceView() {
  const data = useOfficeData()
  const { can } = useSession()
  const { openDialog } = useUI()
  const { deleteInvoice } = useOfficeActions()
  const ready = data.hydrated
  const open = openReceivables(data)
  // Parcela prevista com vencimento passado já está em atraso, mesmo sem mudar o status salvo.
  const overdue = data.invoices.filter((i) => invoiceStatus(i) === "atrasado").sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const overdueTotal = overdue.reduce((a, i) => a + i.amount, 0)
  const oldest = overdue[0]
  const toReceive = data.invoices.filter((i) => invoiceListTab(i) === "receber").sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const received = data.invoices.filter((i) => invoiceListTab(i) === "recebidos").sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate))
  const cancelled = data.invoices.filter((i) => invoiceListTab(i) === "cancelados")
  const [tab, setTab] = React.useState<InvoiceListTab>("receber")
  const [query, setQuery] = React.useState("")
  const [editing, setEditing] = React.useState<Invoice | undefined>()
  const [paying, setPaying] = React.useState<Invoice | undefined>()
  const [toDelete, setToDelete] = React.useState<Invoice | null>(null)
  const counts: Record<InvoiceListTab, number> = {
    receber: toReceive.length,
    recebidos: received.length,
    atraso: overdue.length,
    cancelados: cancelled.length,
  }
  const needle = query.trim().toLowerCase()
  const listed = data.invoices
    .filter((i) => invoiceListTab(i) === tab)
    .filter((i) => {
      if (!needle) return true
      const client = data.clients.find((c) => c.id === i.clientId)?.name ?? ""
      const process = i.processId ? data.processes.find((p) => p.id === i.processId)?.code : ""
      return [client, process, i.description, i.category, i.notes, i.method].filter(Boolean).join(" ").toLowerCase().includes(needle)
    })
    .sort((a, b) => (tab === "recebidos" ? (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate) : a.dueDate.localeCompare(b.dueDate)))
  const summary = financeSummary(data.invoices)
  const series = monthlyRevenue(data.invoices)
  const byArea = revenueByArea(data.invoices, data.clients)
  const maxArea = byArea[0]?.amount ?? 0
  const pct = summary.expected > 0 ? Math.round((summary.received / summary.expected) * 100) : undefined
  const growth = summary.growth
  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.name ?? ""

  /** Exporta as faturas reais do escritório (arquivo gerado no navegador). */
  const exportInvoices = () => {
    const rows = [...data.invoices]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((i) => [
        clientName(i.clientId),
        i.processId ? (data.processes.find((p) => p.id === i.processId)?.code ?? "") : "",
        i.description,
        i.category ?? "",
        i.amount,
        fmtNumericDate(i.dueDate),
        INVOICE_STATUS[invoiceStatus(i)].label,
        i.paidAt ? fmtNumericDate(i.paidAt) : "",
        i.method ?? "",
        i.notes ?? "",
      ])
    const file = `financeiro-${toLocalISO(getNow()).slice(0, 10)}.csv`
    downloadCSV(file, [["Cliente", "Processo", "Descrição", "Categoria", "Valor (R$)", "Vencimento", "Situação", "Pago em", "Forma", "Observação"], ...rows])
    toast.success("Relatório exportado.", { description: `${file} · ${rows.length} lançamento${rows.length === 1 ? "" : "s"}` })
  }

  // "Como está o dinheiro do escritório?" em uma frase, com os números reais.
  const headline = !data.invoices.length
    ? "Honorários previstos, recebidos e em aberto aparecem aqui assim que houver lançamentos."
    : `${formatCurrency(summary.received)} recebidos de ${formatCurrency(summary.expected)} previstos em ${summary.month.split(" ")[0].toLowerCase()}${
        overdueTotal > 0 ? ` · ${formatCurrency(overdueTotal)} vencidos` : " · nada vencido"
      }.`

  const kpis = [
    { label: "Receita prevista", value: formatCurrency(summary.expected), hint: summary.month, icon: TrendingUp, tone: "brand" as const },
    {
      label: "Receita recebida",
      value: formatCurrency(summary.received),
      hint:
        growth === undefined && pct === undefined ? (
          summary.month
        ) : (
          <span>
            {growth !== undefined && (
              <>
                <span className={cn("font-medium", growth >= 0 ? "text-success" : "text-danger")}>
                  {growth >= 0 ? "+" : ""}
                  {growth.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>{" "}
                vs. {summary.previousMonth.split(" ")[0].toLowerCase()}
              </>
            )}
            {growth !== undefined && pct !== undefined && " · "}
            {pct !== undefined && <>{pct}% do previsto</>}
          </span>
        ),
      icon: Wallet,
      tone: "success" as const,
    },
    { label: "Em aberto", value: formatCurrency(open), hint: `${toReceive.length + overdue.length} parcelas a receber`, icon: CircleDollarSign, tone: "warning" as const },
    {
      label: "Inadimplência",
      value: `${summary.defaultRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      hint: <span className="text-danger">{formatCurrency(overdueTotal)} vencidos</span>,
      icon: Percent,
      tone: "danger" as const,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description={ready ? headline : "Honorários previstos, recebidos e em aberto do escritório."}
        actions={
          <>
            <Button variant="secondary" onClick={exportInvoices} disabled={!ready || data.invoices.length === 0}>
              <Download /> Exportar CSV
            </Button>
            <Can permission="finance.edit">
              <Button onClick={() => openDialog("invoice")} disabled={!ready}>
                <Plus /> Novo lançamento
              </Button>
            </Can>
          </>
        }
      />

      {!ready ? (
        <>
          <SkeletonStats />
          <div className="grid gap-5 @4xl/main:grid-cols-12">
            <SkeletonCard className="@4xl/main:col-span-8" lines={5} />
            <SkeletonCard className="@4xl/main:col-span-4" lines={5} />
          </div>
        </>
      ) : data.invoices.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CircleDollarSign />}
            title="Nenhum lançamento ainda."
            description="Registre a primeira receita para acompanhar o previsto, o recebido, o que está em aberto e o que venceu."
            action={
              can("finance.edit") ? (
                <Button size="sm" onClick={() => openDialog("invoice")}>
                  <Plus /> Novo lançamento
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 @4xl/main:grid-cols-4 @4xl/main:gap-5">
            {kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                <MetricCard label={k.label} value={k.value} foot={k.hint} icon={k.icon} tone={k.tone} />
              </motion.div>
            ))}
          </div>

          {overdueTotal > 0 && (
            <FadeIn className="flex flex-col gap-3 rounded-[14px] border border-danger/20 bg-danger-soft/60 p-4 sm:flex-row sm:items-center">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-danger ring-1 ring-danger/15">
                <TriangleAlert className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">
                  {overdue.length === 1 ? "1 parcela em atraso soma" : `${overdue.length} parcelas em atraso somam`} {formatCurrency(overdueTotal)}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Mais antiga: {clientName(oldest.clientId)} · vencida desde {fmtNumericDate(oldest.dueDate)}
                </p>
              </div>
              <Link href={`/clientes/${oldest.clientId}?tab=financeiro`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Abrir cliente <ArrowUpRight />
              </Link>
            </FadeIn>
          )}

          <Panel>
            <PanelHeader title="Lançamentos" description={needle ? `${listed.length} na busca` : `${counts[tab]} nesta situação`} />
            {/* Abas e busca numa linha própria: no celular as abas rolam sem estourar a largura. */}
            <div className="flex flex-col gap-3 px-5 pb-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <FilterTabs
                ariaLabel="Lançamentos"
                layoutId="finance-list"
                value={tab}
                onChange={setTab}
                className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0"
                options={TABS.map((item) => ({ ...item, count: counts[item.value] }))}
              />
              <SearchField value={query} onChange={setQuery} placeholder="Buscar cliente, processo ou descrição…" className="w-full lg:max-w-xs" />
            </div>
            {listed.length === 0 && (
              <EmptyState
                compact
                title={needle ? "Nenhum lançamento encontrado." : EMPTY_TAB[tab].title}
                description={needle ? "Tente outro nome, número ou descrição." : EMPTY_TAB[tab].description}
              />
            )}
            <ul className={cn("divide-y divide-border", listed.length > 0 && "border-t border-border")}>
              {listed.map((inv) => {
                const client = data.clients.find((c) => c.id === inv.clientId)
                const current = invoiceStatus(inv)
                const status = INVOICE_STATUS[current]
                const { day, month } = fmtDayMonthParts(inv.dueDate)
                return (
                  <li key={inv.id} className="flex items-center gap-3 px-4 py-3 sm:gap-3.5 sm:px-5">
                    <span
                      className={cn(
                        "flex w-11 shrink-0 flex-col items-center rounded-[8px] border py-1",
                        current === "atrasado" ? "border-danger/25 bg-danger-soft" : "border-border bg-surface",
                      )}
                    >
                      <span
                        className={cn("text-[9.5px] font-semibold tracking-[0.1em]", current === "atrasado" ? "text-danger" : "text-brand-strong")}
                      >
                        {month}
                      </span>
                      <span className="tabular text-[15px] font-semibold leading-tight">{day}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clientes/${inv.clientId}?tab=financeiro`}
                        className="flex items-center gap-2 truncate text-[13.5px] font-medium hover:underline pointer-coarse:-my-2 pointer-coarse:py-2"
                      >
                        {client && <UserAvatar name={client.name} size="xs" className="max-sm:hidden" />}
                        <span className="truncate">{client?.name}</span>
                      </Link>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {[
                          inv.category,
                          inv.description,
                          inv.method,
                          current === "pago"
                            ? `recebido em ${inv.paidAt ? fmtNumericDate(inv.paidAt) : "data não informada"}`
                            : current === "cancelado"
                              ? "cancelado"
                              : fmtDueIn(inv.dueDate),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {/* Celular: valor e situação abaixo do nome, para o nome não ser cortado. */}
                      <p className="mt-1 flex items-center gap-2 sm:hidden">
                        <span className={cn("tabular text-[13.5px] font-semibold", current === "atrasado" && "text-danger")}>{formatCurrency(inv.amount)}</span>
                        <StatusBadge tone={status.tone} size="sm">
                          {status.label}
                        </StatusBadge>
                      </p>
                    </div>
                    <span className="hidden sm:block">
                      <StatusBadge tone={status.tone} size="sm">
                        {status.label}
                      </StatusBadge>
                    </span>
                    <span className={cn("tabular w-24 shrink-0 text-right text-[13.5px] font-semibold max-sm:hidden", current === "atrasado" && "text-danger")}>
                      {formatCurrency(inv.amount)}
                    </span>
                    {can("finance.edit") && current !== "pago" && current !== "cancelado" && (
                      <Button variant="secondary" size="sm" className="max-sm:hidden" onClick={() => setPaying(inv)}>
                        <CircleCheck /> Recebido
                      </Button>
                    )}
                    {can("finance.edit") ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Ações para ${inv.description}`}
                          className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent"
                        >
                          <Ellipsis className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
                          <DropdownMenuGroup>
                            {current !== "pago" && current !== "cancelado" && (
                              <DropdownMenuItem className="h-8 px-2" onClick={() => setPaying(inv)}>
                                <CircleCheck /> Marcar como recebido
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="h-8 px-2" onClick={() => setEditing(inv)}>
                              <Pencil /> Editar lançamento
                            </DropdownMenuItem>
                            <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setToDelete(inv)}>
                              <Trash2 /> Excluir lançamento
                            </DropdownMenuItem>
                            <DropdownMenuItem className="h-8 px-2" render={<Link href={`/clientes/${inv.clientId}?tab=financeiro`} />}>
                              <ArrowUpRight /> Abrir cliente
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Link
                        href={`/clientes/${inv.clientId}?tab=financeiro`}
                        aria-label={`Abrir financeiro de ${client?.name}`}
                        className="hidden size-8 items-center justify-center rounded-[8px] text-subtle hover:bg-accent hover:text-foreground md:flex"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>

          <div className="grid grid-cols-1 gap-5 @4xl/main:grid-cols-12">
            <Panel className="@4xl/main:col-span-8">
              <PanelHeader
                title="Receita mensal"
                description={`${series[0].label} a ${series[series.length - 1].label}`}
                action={
                  <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[3px] bg-foreground" /> Recebida
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[3px] bg-border-strong" /> Prevista
                    </span>
                  </div>
                }
              />
              <div className="px-3 pb-4 sm:px-5">
                <RevenueBarChart data={series} height={280} />
              </div>
            </Panel>

            <Panel className="@4xl/main:col-span-4">
              <PanelHeader title="Receita por área" description={`Recebido em ${getNow().getFullYear()}`} />
              {byArea.length === 0 && (
                <EmptyState compact title="Nenhum recebimento neste ano." description="A divisão por área aparece com os primeiros pagamentos." />
              )}
              <ul className="space-y-3.5 px-5 pb-5">
                {byArea.map((a, i) => (
                  <li key={a.area}>
                    <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                      <span className="text-foreground">{a.area}</span>
                      <span className="tabular font-medium">{a.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${maxArea ? (a.amount / maxArea) * 100 : 0}%` }}
                        transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        className={cn("h-full rounded-full", i === 0 ? "bg-brand" : "bg-foreground/75")}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <NewInvoiceDialog open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)} invoice={editing} />
      <PayInvoiceDialog invoice={paying} onOpenChange={(o) => !o && setPaying(undefined)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir "${toDelete?.description}"?`}
        description="O lançamento sai do financeiro do escritório. Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (!toDelete) return
          deleteInvoice(toDelete.id)
          toast.success("Lançamento excluído.", { description: toDelete.description })
        }}
      />
    </div>
  )
}
