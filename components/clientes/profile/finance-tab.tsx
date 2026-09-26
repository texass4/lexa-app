"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { CircleCheck, CircleDollarSign, Clock3, Ellipsis, Plus, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { invoiceStatus, type clientFinance } from "@/lib/selectors"
import { INVOICE_STATUS } from "@/lib/config"
import { fmtDayMonthParts, fmtDueIn, fmtNumericDate, getNow, toLocalISO } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import type { Client, Invoice } from "@/types"
import { Can } from "@/lib/auth/session"

const ICON: Record<Invoice["status"], React.ElementType> = { pago: CircleCheck, pendente: Clock3, atrasado: TriangleAlert }
const ICON_CLS: Record<Invoice["status"], string> = {
  pago: "border-success/25 bg-success-soft text-success",
  pendente: "border-border bg-surface text-muted-foreground",
  atrasado: "border-danger/25 bg-danger-soft text-danger",
}

export function FinanceTab({ client, finance: f }: { client: Client; finance: ReturnType<typeof clientFinance> }) {
  const data = useDemoData()
  const { openDialog } = useUI()
  const { markInvoicePaid, deleteInvoice } = useDemoActions()
  const [toDelete, setToDelete] = React.useState<Invoice | null>(null)
  const invoices = [...f.invoices].sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const paidPct = f.contracted ? Math.round((f.paid / f.contracted) * 100) : 0
  const newInvoice = () => openDialog("invoice", { clientId: client.id })

  const markPaid = (inv: Invoice) => {
    const today = toLocalISO(getNow()).slice(0, 10)
    markInvoicePaid(inv.id, today)
    toast.success("Pagamento registrado.", { description: `${inv.description} · ${formatCurrency(inv.amount)} · ${fmtNumericDate(today)}` })
  }

  if (!f.invoices.length) {
    return (
      <Panel>
        <EmptyState
          icon={<CircleDollarSign />}
          title="Nenhum lançamento financeiro."
          description="Lance os honorários contratados para acompanhar o que foi recebido, o que está em aberto e o que venceu."
          action={
            <Can permission="finance.edit">
              <Button size="sm" onClick={newInvoice}>
                <Plus /> Novo lançamento
              </Button>
            </Can>
          }
        />
      </Panel>
    )
  }

  const metric = (label: string, value: number, hint: string, cls?: string) => (
    <div className="min-w-0 sm:border-l sm:border-border sm:pl-5 sm:first:border-0 sm:first:pl-0">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-2 truncate text-[24px] font-semibold leading-none tracking-[-0.03em]", cls)}>{formatCurrency(value)}</p>
      <p className="mt-2 truncate text-[12px] text-muted-foreground">{hint}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {metric("Contratado", f.contracted, "Total lançado para o cliente")}
          {metric("Recebido", f.paid, `${paidPct}% do contratado`, "text-success")}
          {metric("Em aberto", f.open, `${f.upcoming.length} a vencer`)}
          {metric(
            "Vencido",
            f.overdue,
            f.overdueCount ? `${f.overdueCount} parcela${f.overdueCount > 1 ? "s" : ""} em atraso` : "Nenhuma parcela vencida",
            f.overdue ? "text-danger" : undefined,
          )}
        </div>
        <div className="mt-6">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${paidPct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-success"
            />
            {f.overdue > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(f.overdue / f.contracted) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="ml-0.5 h-full rounded-full bg-danger/70"
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success" /> Recebido
            </span>
            {f.overdue > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-danger/70" /> Em atraso
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-surface-muted ring-1 ring-border" /> A vencer
            </span>
          </div>
        </div>
      </Panel>

      {f.upcoming.length > 0 && (
        <Panel>
          <PanelHeader
            title="Próximos vencimentos"
            description={`${f.upcoming.length} a vencer · ${formatCurrency(f.upcoming.reduce((a, i) => a + i.amount, 0))}`}
          />
          <ul className="flex gap-3 overflow-x-auto px-5 pb-5 no-scrollbar">
            {f.upcoming.slice(0, 4).map((inv) => (
              <li key={inv.id} className="min-w-[180px] flex-1 rounded-[12px] border border-border bg-surface-muted/40 p-3.5">
                <p className="text-[12px] text-muted-foreground">
                  {fmtNumericDate(inv.dueDate)} · {fmtDueIn(inv.dueDate)}
                </p>
                <p className="tabular mt-1 text-[16px] font-semibold">{formatCurrency(inv.amount)}</p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{inv.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Lançamentos"
          description={`${invoices.length} ${invoices.length === 1 ? "lançamento" : "lançamentos"}`}
          action={
            <Can permission="finance.edit">
              <Button size="sm" onClick={newInvoice}>
                <Plus /> Novo lançamento
              </Button>
            </Can>
          }
        />
        <ol className="relative px-5 pb-5">
          <span aria-hidden className="absolute top-3 bottom-8 left-[33px] w-px bg-border" />
          {invoices.map((inv) => {
            const current = invoiceStatus(inv)
            const Icon = ICON[current]
            const status = INVOICE_STATUS[current]
            const { day, month } = fmtDayMonthParts(inv.dueDate)
            const process = inv.processId ? data.processes.find((p) => p.id === inv.processId) : undefined
            const method = inv.method ? ` · ${inv.method}` : ""
            return (
              <li key={inv.id} className="relative flex items-center gap-4 py-2.5">
                <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border", ICON_CLS[current])}>
                  <Icon className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{inv.description}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {current === "pago"
                        ? `Pago em ${inv.paidAt ? fmtNumericDate(inv.paidAt) : "data não informada"}${method}`
                        : current === "atrasado"
                          ? `${fmtDueIn(inv.dueDate).replace(/^v/, "V")}${method}`
                          : `Vence ${fmtDueIn(inv.dueDate)}${method}`}
                      {process && (
                        <>
                          {" · "}
                          <Link href={`/processos/${process.id}`} className="hover:text-foreground hover:underline">
                            {process.code}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular hidden text-[12px] text-subtle sm:inline">
                      {day} {month}
                    </span>
                    <StatusBadge tone={status.tone} size="sm">
                      {status.label}
                    </StatusBadge>
                  </div>
                </div>
                <span className={cn("tabular w-24 shrink-0 text-right text-[13.5px] font-semibold", current === "atrasado" && "text-danger")}>
                  {formatCurrency(inv.amount)}
                </span>
                <Can permission="finance.edit">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Ações para ${inv.description}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
                    >
                      <Ellipsis className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
                      <DropdownMenuGroup>
                        {current !== "pago" && (
                          <DropdownMenuItem className="h-8 px-2" onClick={() => markPaid(inv)}>
                            <CircleCheck /> Registrar pagamento hoje
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setToDelete(inv)}>
                          <Trash2 /> Excluir lançamento
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Can>
              </li>
            )
          })}
        </ol>
      </Panel>

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
