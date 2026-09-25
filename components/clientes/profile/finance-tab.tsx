"use client"

import { motion } from "framer-motion"
import { CircleCheck, CircleDollarSign, Clock3, Send, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDemoData } from "@/lib/store/demo-store"
import { clientFinance } from "@/lib/selectors"
import { INVOICE_STATUS } from "@/lib/config"
import { fmtDayMonthParts, fmtDueIn, fmtNumericDate } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import type { Client, Invoice } from "@/types"

const ICON: Record<Invoice["status"], React.ElementType> = { pago: CircleCheck, pendente: Clock3, atrasado: TriangleAlert }
const ICON_CLS: Record<Invoice["status"], string> = {
  pago: "border-success/25 bg-success-soft text-success",
  pendente: "border-border bg-surface text-muted-foreground",
  atrasado: "border-danger/25 bg-danger-soft text-danger",
}

export function FinanceTab({ client }: { client: Client }) {
  const data = useDemoData()
  const f = clientFinance(data, client.id)
  const invoices = [...f.invoices].sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const paidPct = f.contracted ? Math.round((f.paid / f.contracted) * 100) : 0

  if (!f.invoices.length) {
    return (
      <Panel>
        <EmptyState
          icon={<CircleDollarSign />}
          title="Nenhum lançamento financeiro."
          description={
            client.status === "novo"
              ? "O contrato de honorários ainda está em assinatura. Os lançamentos aparecem aqui após a confirmação."
              : "Cadastre os honorários contratados para acompanhar pagamentos."
          }
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">Honorários contratados</p>
            <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em]">{formatCurrency(f.contracted)}</p>
            <p className="mt-2 truncate text-[12px] text-muted-foreground">Total faturado para o cliente</p>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-5">
            <p className="text-[12px] font-medium text-muted-foreground">Pago</p>
            <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-success">{formatCurrency(f.paid)}</p>
            <p className="mt-2 text-[12px] text-muted-foreground">{paidPct}% do contrato</p>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-5">
            <p className="text-[12px] font-medium text-muted-foreground">Em aberto</p>
            <p
              className={cn("tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em]", f.overdue ? "text-danger" : "text-foreground")}
            >
              {formatCurrency(f.open)}
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {f.overdue ? `${formatCurrency(f.overdue)} vencidos` : "Nenhuma parcela vencida"}
            </p>
          </div>
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
              <span className="size-2 rounded-full bg-success" /> Pago
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

      <Panel>
        <PanelHeader
          title="Pagamentos"
          description={`${invoices.length} lançamentos`}
          action={
            f.open > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toast.success("Cobrança enviada.", { description: `Link de pagamento enviado para ${client.email}.` })}
              >
                <Send /> Enviar cobrança
              </Button>
            ) : undefined
          }
        />
        <ol className="relative px-5 pb-5">
          <span aria-hidden className="absolute top-3 bottom-8 left-[33px] w-px bg-border" />
          {invoices.map((inv) => {
            const Icon = ICON[inv.status]
            const status = INVOICE_STATUS[inv.status]
            const { day, month } = fmtDayMonthParts(inv.dueDate)
            return (
              <li key={inv.id} className="relative flex items-center gap-4 py-2.5">
                <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border", ICON_CLS[inv.status])}>
                  <Icon className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{inv.description}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {inv.status === "pago"
                        ? `Pago em ${fmtNumericDate(inv.paidAt!)} · ${inv.method}`
                        : `Vence ${fmtDueIn(inv.dueDate)} · ${inv.method}`}
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
                <span className="tabular w-24 shrink-0 text-right text-[13.5px] font-semibold">{formatCurrency(inv.amount)}</span>
              </li>
            )
          })}
        </ol>
      </Panel>
    </div>
  )
}
