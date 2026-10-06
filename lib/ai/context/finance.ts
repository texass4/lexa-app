/**
 * Análise do financeiro. O backend calcula todos os números a partir das faturas
 * registradas (`computeFinanceMetrics`) e monta listas curtas — atrasos por cliente e
 * próximos vencimentos; a IA só interpreta. Valores vão já formatados, para o modelo
 * citar exatamente o que está nos dados.
 *
 * Leitura enxuta: faturas em aberto e as com vencimento/pagamento desde o mês anterior.
 */

import { addDays, startOfDay, toLocalISO } from "@/lib/core/dates"
import { formatCurrency } from "@/lib/core/format"
import { financeSummary, invoiceStatus, isOpenInvoice } from "@/lib/store/selectors"
import type { FinanceMetrics } from "@/lib/ai/types"
import type { Invoice } from "@/types"
import type { AIRepository } from "./repository"
import { type BuiltContext, SourceRegistry, daysSince, daysUntil, fmtDate, fmtToday } from "./shared"

const LIMIT = 10
/** Janela de "próximos recebimentos". */
export const NEXT_DAYS = 30

export interface FinanceData {
  invoices: Invoice[]
  clientNames: Map<string, string>
}

export async function loadFinanceData(repo: AIRepository, now: Date = new Date()): Promise<FinanceData> {
  // O mês anterior inteiro entra para a comparação com o mesmo período.
  const invoices = await repo.listInvoices({ relevantSince: toLocalISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 10) })
  const clientNames = await repo.clientNames(invoices.map((i) => i.clientId))
  return { invoices, clientNames }
}

const sum = (invoices: Invoice[]) => invoices.reduce((acc, i) => acc + (Number.isFinite(i.amount) ? i.amount : 0), 0)

/** Previstas (não vencidas) com vencimento de hoje até `NEXT_DAYS` dias. */
const dueSoon = (invoices: Invoice[], now: Date) =>
  invoices.filter((i) => {
    if (!isOpenInvoice(i) || invoiceStatus(i, now) === "atrasado") return false
    const days = daysUntil(i.dueDate, now)
    return days !== undefined && days >= 0 && days <= NEXT_DAYS
  })

/** Números do financeiro, direto das faturas — nunca do modelo. */
export function computeFinanceMetrics(invoices: Invoice[], now: Date): FinanceMetrics {
  const summary = financeSummary(invoices, now)
  const overdue = invoices.filter((i) => invoiceStatus(i, now) === "atrasado")
  const soon = dueSoon(invoices, now)
  return {
    month: summary.month,
    previousMonth: summary.previousMonth,
    receivedThisMonth: summary.received,
    expectedThisMonth: summary.expected,
    receivedPreviousSamePeriod: summary.previousSamePeriod,
    openAmount: sum(invoices.filter(isOpenInvoice)),
    overdueAmount: sum(overdue),
    overdueInvoices: overdue.length,
    clientsWithOverdue: new Set(overdue.map((i) => i.clientId)).size,
    dueNext30Days: sum(soon),
    dueNext30DaysInvoices: soon.length,
  }
}

export function buildFinanceContext(data: FinanceData, now: Date): BuiltContext & { metrics: FinanceMetrics } {
  const registry = new SourceRegistry()
  const metrics = computeFinanceMetrics(data.invoices, now)
  const name = (id: string) => data.clientNames.get(id) ?? "Cliente sem acesso"
  const refs = new Map<string, string>()
  const clientRef = (id: string) => {
    let ref = refs.get(id)
    if (!ref) {
      ref = registry.add("client", { id, label: name(id), href: `/clientes/${id}?tab=financeiro` })
      refs.set(id, ref)
    }
    return ref
  }

  const overdue = data.invoices.filter((i) => invoiceStatus(i, now) === "atrasado")
  const byClient = new Map<string, Invoice[]>()
  for (const i of overdue) byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i])

  const today = startOfDay(now)
  const context = {
    data_de_hoje: fmtToday(now),
    metricas_calculadas_pelo_lexa: {
      mes_atual: metrics.month,
      recebido_no_mes: formatCurrency(metrics.receivedThisMonth),
      previsto_para_o_mes: formatCurrency(metrics.expectedThisMonth),
      recebido_no_mesmo_periodo_do_mes_anterior: formatCurrency(metrics.receivedPreviousSamePeriod),
      mes_anterior: metrics.previousMonth,
      em_aberto: formatCurrency(metrics.openAmount),
      em_atraso: formatCurrency(metrics.overdueAmount),
      parcelas_em_atraso: metrics.overdueInvoices,
      clientes_com_atraso: metrics.clientsWithOverdue,
      a_receber_nos_proximos_30_dias: formatCurrency(metrics.dueNext30Days),
      parcelas_nos_proximos_30_dias: metrics.dueNext30DaysInvoices,
    },
    clientes_com_valores_em_atraso: [...byClient.entries()]
      .map(([clientId, list]) => ({ clientId, list, total: sum(list), oldest: list.map((i) => i.dueDate).sort()[0] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, LIMIT)
      .map(({ clientId, list, total, oldest }) => ({
        ref: clientRef(clientId),
        cliente: name(clientId),
        valor_em_atraso: formatCurrency(total),
        parcelas: list.length,
        vencida_desde: fmtDate(oldest),
        dias_de_atraso_da_mais_antiga: daysSince(oldest, now),
      })),
    proximos_recebimentos_30_dias: dueSoon(data.invoices, now)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, LIMIT)
      .map((i) => ({
        ref: clientRef(i.clientId),
        cliente: name(i.clientId),
        valor: formatCurrency(i.amount),
        vencimento: fmtDate(i.dueDate),
        descricao: i.description,
      })),
    periodo_dos_proximos_recebimentos: `${fmtDate(toLocalISO(today))} a ${fmtDate(toLocalISO(addDays(today, NEXT_DAYS)))}`,
  }

  return { context, sources: registry.sources, metrics, basis: "Baseado nas faturas registradas no financeiro do escritório." }
}
