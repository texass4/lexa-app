"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowDown, ArrowUpRight, CircleCheck, CircleDollarSign, Download, Ellipsis, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { IndicatorStrip } from "@/components/ui/indicator-strip"
import { Button } from "@/components/ui/button"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { UserAvatar } from "@/components/ui/user-avatar"
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { FadeIn } from "@/components/ui/motion"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RevenueBarChart } from "./revenue-chart"
import { FinanceAIPanel } from "./finance-ai-panel"
import { NewInvoiceDialog } from "./new-invoice-dialog"
import { PayInvoiceDialog } from "./pay-invoice-dialog"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useDebounced, useHistoryStats, usePagedHistory } from "@/lib/store/on-demand"
import { invoiceKey, invoiceSearch, olderInvoices, type InvoiceHistoryTab } from "@/lib/store/history-lists"
import { byId } from "@/lib/store/indexes"
import { searchFilter } from "@/lib/store/storage"
import { LimitedList } from "@/components/ui/show-more"
import { matches } from "@/lib/core/format"
import { INVOICE_STATUS } from "@/lib/core/config"
import { addDays, fmtDayMonthParts, fmtDueIn, fmtNumericDate, getNow, toLocalISO } from "@/lib/core/dates"
import { downloadCSV } from "@/lib/core/csv"
import { formatCurrency } from "@/lib/core/format"
import {
  financeSummary,
  invoiceListTab,
  invoiceStatus,
  monthlyRevenue,
  openReceivables,
  revenueByArea,
  type InvoiceListTab,
} from "@/lib/store/selectors"
import { useSession, Can } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import type { Invoice } from "@/types"

const TABS: { value: InvoiceListTab; label: string }[] = [
  { value: "receber", label: "A receber" },
  { value: "recebidos", label: "Recebidos" },
  { value: "atraso", label: "Em atraso" },
  { value: "cancelados", label: "Cancelados" },
]

/** `?aba=` (links do Painel e de outras telas) → aba aberta. */
const TAB_PARAM: Record<string, InvoiceListTab> = { receber: "receber", recebidos: "recebidos", atraso: "atraso", atrasados: "atraso", cancelados: "cancelados" }

/** Janela de "próximos recebimentos". */
const NEXT_DAYS = 30

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
  const { deleteInvoice, windowBounds, fetchAll } = useOfficeActions()
  // Em aberto e os dos últimos meses estão na memória (a abertura traz); recebidos e
  // cancelados mais antigos vêm do banco em páginas — e são contados e somados lá.
  const bounds = windowBounds()
  const stats = useHistoryStats<{ counts: Record<string, number>; billed: number }>("invoice_history_stats", { p_from: bounds.finance })
  const inWindow = (i: Invoice) =>
    i.status === "pendente" || i.status === "atrasado" || i.dueDate >= bounds.finance || (i.paidAt ?? "") >= bounds.finance
  const windowInvoices = data.invoices.filter(inWindow)
  // Sem lançamentos recentes, espera a contagem do histórico para saber se o escritório tem algum.
  const ready = data.hydrated && (data.invoices.length > 0 || stats !== undefined)
  const open = openReceivables(data)
  // Parcela prevista com vencimento passado já está em atraso, mesmo sem mudar o status salvo.
  const overdue = data.invoices.filter((i) => invoiceStatus(i) === "atrasado").sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const overdueTotal = overdue.reduce((a, i) => a + i.amount, 0)
  const oldest = overdue[0]
  const toReceive = data.invoices.filter((i) => invoiceListTab(i) === "receber")
  // Próximos recebimentos: previstos (ainda no prazo) que vencem nos próximos 30 dias.
  const horizon = toLocalISO(addDays(getNow(), NEXT_DAYS)).slice(0, 10)
  const nextDue = toReceive.filter((i) => i.dueDate <= horizon)
  const nextDueTotal = nextDue.reduce((a, i) => a + i.amount, 0)
  const tabParam = useSearchParams().get("aba")
  const [tab, setTab] = React.useState<InvoiceListTab>(() => (tabParam && TAB_PARAM[tabParam]) || "receber")
  // Um link com `?aba=` aberto com a tela já montada também troca a aba.
  const [lastTabParam, setLastTabParam] = React.useState(tabParam)
  if (tabParam !== lastTabParam) {
    setLastTabParam(tabParam)
    if (tabParam && TAB_PARAM[tabParam]) setTab(TAB_PARAM[tabParam])
  }
  const listRef = React.useRef<HTMLElement>(null)
  const showOverdue = () => {
    setTab("atraso")
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const [query, setQuery] = React.useState("")
  const [editing, setEditing] = React.useState<Invoice | undefined>()
  const [paying, setPaying] = React.useState<Invoice | undefined>()
  const [toDelete, setToDelete] = React.useState<Invoice | null>(null)
  const historyTab: InvoiceHistoryTab | null = tab === "recebidos" || tab === "cancelados" ? tab : null
  const olderCount = (t: InvoiceHistoryTab) => (stats ? Number(stats.counts[t === "recebidos" ? "pago" : "cancelado"] ?? 0) : undefined)
  const windowCount = (t: InvoiceListTab) => windowInvoices.filter((i) => invoiceListTab(i) === t).length
  const counts: Record<InvoiceListTab, number | undefined> = {
    receber: toReceive.length,
    recebidos: stats ? windowCount("recebidos") + olderCount("recebidos")! : undefined,
    atraso: overdue.length,
    cancelados: stats ? windowCount("cancelados") + olderCount("cancelados")! : undefined,
  }

  const search = React.useDeferredValue(query)
  const term = useDebounced(query.trim())
  const serverSearch = React.useMemo(() => {
    const clients = data.clients.filter((c) => matches(term, c.name)).map((c) => c.id)
    const processes = data.processes.filter((p) => matches(term, p.number, p.code)).map((p) => p.id)
    return searchFilter(term, [
      { column: "data->>clientId", ids: clients },
      { column: "data->>processId", ids: processes },
    ])
  }, [term, data.clients, data.processes])
  const historyList = React.useMemo(
    () => (!historyTab ? null : serverSearch ? invoiceSearch(term, serverSearch, historyTab) : olderInvoices(bounds, historyTab)),
    [historyTab, serverSearch, term, bounds],
  )
  // Nada recente nesta aba (ex.: cancelados): a primeira página do histórico vem junto.
  const recentInTab = windowInvoices.filter((i) => invoiceListTab(i) === tab).length
  const history = usePagedHistory(historyList, bounds.finance, { auto: !!historyTab && (!!serverSearch || recentInTab === 0) })
  // Histórico só até onde a lista está completa (mais recentes primeiro, sem buracos).
  const shown = (i: Invoice) => !historyTab || history.cursor === null || invoiceKey(historyTab)(i) >= history.cursor

  const needle = search.trim().toLowerCase()
  const listed = data.invoices
    .filter((i) => invoiceListTab(i) === tab && shown(i))
    .filter((i) => {
      if (!needle) return true
      const client = byId(data.clients, i.clientId)?.name ?? ""
      const process = i.processId ? byId(data.processes, i.processId)?.code : ""
      return [client, process, i.description, i.category, i.notes, i.method].filter(Boolean).join(" ").toLowerCase().includes(needle)
    })
    // Recebidos e cancelados: os mais recentes primeiro (o histórico vem do banco nessa ordem).
    .sort((a, b) =>
      tab === "recebidos"
        ? (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate)
        : tab === "cancelados"
          ? b.dueDate.localeCompare(a.dueDate)
          : a.dueDate.localeCompare(b.dueDate),
    )
  // Indicadores: a janela da abertura (os últimos meses e tudo em aberto) e, na
  // inadimplência, o faturado de antes dela (somado no banco).
  const summary = financeSummary(windowInvoices, undefined, { billedBefore: stats ? Number(stats.billed) : undefined })
  const series = monthlyRevenue(windowInvoices)
  const byArea = revenueByArea(windowInvoices, data.clients)
  const maxArea = byArea[0]?.amount ?? 0
  const pct = summary.expected > 0 ? Math.round((summary.received / summary.expected) * 100) : undefined
  const growth = summary.growth
  const clientName = (id: string) => byId(data.clients, id)?.name ?? ""
  const [exporting, setExporting] = React.useState(false)

  /** Exporta todos os lançamentos do escritório (lidos do banco na hora; arquivo gerado no navegador). */
  const exportInvoices = async () => {
    setExporting(true)
    let all: Invoice[]
    try {
      all = await fetchAll<Invoice>("invoices")
    } catch (error) {
      console.error("[financeiro] Não foi possível exportar:", error)
      toast.error("Não foi possível exportar agora.", { description: "Verifique a conexão e tente de novo." })
      return
    } finally {
      setExporting(false)
    }
    const rows = all
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((i) => [
        clientName(i.clientId),
        i.processId ? (byId(data.processes, i.processId)?.code ?? "") : "",
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
    downloadCSV(file, [
      ["Cliente", "Processo", "Descrição", "Categoria", "Valor (R$)", "Vencimento", "Situação", "Pago em", "Forma", "Observação"],
      ...rows,
    ])
    toast.success("Relatório exportado.", { description: `${file} · ${rows.length} lançamento${rows.length === 1 ? "" : "s"}` })
  }

  const monthName = summary.month.split(" ")[0].toLowerCase()
  const previousName = summary.previousMonth.split(" ")[0].toLowerCase()
  // Os números ficam na faixa: cada um responde uma pergunta (entrou? vai entrar? atrasou?).
  const indicators = [
    {
      label: `Recebido em ${monthName}`,
      value: formatCurrency(summary.received),
      foot:
        growth !== undefined
          ? `${growth >= 0 ? "+" : ""}${growth.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. mesmo período de ${previousName}`
          : pct !== undefined
            ? `${pct}% do previsto`
            : "nenhum previsto no mês",
    },
    {
      label: `Previsto para ${monthName}`,
      value: formatCurrency(summary.expected),
      foot: pct !== undefined ? `${pct}% já recebido` : "nenhum vencimento no mês",
    },
    {
      label: `A receber em ${NEXT_DAYS} dias`,
      value: formatCurrency(nextDueTotal),
      foot: nextDue.length ? `${nextDue.length} ${nextDue.length === 1 ? "parcela" : "parcelas"} · ${formatCurrency(open)} em aberto` : `${formatCurrency(open)} em aberto`,
    },
    {
      label: "Em atraso",
      value: formatCurrency(overdueTotal),
      foot: overdue.length
        ? `${overdue.length} ${overdue.length === 1 ? "parcela" : "parcelas"} · ${summary.defaultRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de inadimplência`
        : "nenhuma parcela vencida",
      alert: overdue.length > 0,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Honorários previstos, recebidos e em aberto do escritório."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={exportInvoices}
              disabled={!ready || exporting || (data.invoices.length === 0 && !counts.recebidos && !counts.cancelados)}
            >
              <Download /> {exporting ? "Exportando…" : "Exportar CSV"}
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
      ) : data.invoices.length === 0 && !counts.recebidos && !counts.cancelados ? (
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
          <IndicatorStrip label="Indicadores do financeiro" items={indicators} />

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
                  Mais antiga:{" "}
                  <Link href={`/clientes/${oldest.clientId}?tab=financeiro`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {clientName(oldest.clientId)}
                  </Link>{" "}
                  · vencida desde {fmtNumericDate(oldest.dueDate)}
                </p>
              </div>
              {tab !== "atraso" && (
                <Button variant="secondary" size="sm" onClick={showOverdue}>
                  <ArrowDown /> Ver parcelas em atraso
                </Button>
              )}
            </FadeIn>
          )}

          <FinanceAIPanel />

          <Panel ref={listRef} className="scroll-mt-24">
            <PanelHeader
              title="Lançamentos"
              description={
                needle
                  ? `${listed.length} na busca`
                  : tab === "receber" && nextDue.length
                    ? `${counts.receber} previstos · ${formatCurrency(nextDueTotal)} vencem nos próximos ${NEXT_DAYS} dias`
                    : `${counts[tab] ?? listed.length} nesta situação`
              }
            />
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
            {listed.length === 0 && history.loading && historyTab && (
              <div className="border-t border-border px-5 py-4">
                <SkeletonCard lines={3} className="border-0 p-0 shadow-none" />
              </div>
            )}
            {listed.length === 0 && !(history.loading && historyTab) && (
              <EmptyState
                compact
                title={needle ? "Nenhum lançamento encontrado." : EMPTY_TAB[tab].title}
                description={needle ? "Tente outro nome, número ou descrição." : EMPTY_TAB[tab].description}
              />
            )}
            {/* 50 por vez; nos recebidos e cancelados, os anteriores vêm do banco. */}
            <LimitedList
              items={listed}
              listKey={`${tab}|${search}`}
              server={historyTab ? history : undefined}
              total={needle ? undefined : counts[tab]}
              className="mb-4"
            >
              {(visible) => (
                <ul className={cn("divide-y divide-border", visible.length > 0 && "border-t border-border")}>
                  {visible.map((inv) => {
                    const client = byId(data.clients, inv.clientId)
                    const current = invoiceStatus(inv)
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
                            className={cn(
                              "text-[9.5px] font-semibold tracking-[0.1em]",
                              current === "atrasado" ? "text-danger" : "text-brand-strong",
                            )}
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
                          {/* Celular: valor abaixo do nome, para o nome não ser cortado. A situação é a da aba. */}
                          <p className={cn("tabular mt-1 text-[13.5px] font-semibold sm:hidden", current === "atrasado" && "text-danger")}>
                            {formatCurrency(inv.amount)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "tabular w-24 shrink-0 text-right text-[13.5px] font-semibold max-sm:hidden",
                            current === "atrasado" && "text-danger",
                          )}
                        >
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
              )}
            </LimitedList>
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
