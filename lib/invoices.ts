/**
 * Edição de lançamentos financeiros: o que mudou, em palavras, para a timeline do
 * cliente. Lógica pura — usada pelo store e pelos testes.
 */

import { fmtNumericDate } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import type { Invoice } from "@/types"

export interface InvoiceChange {
  /** Nada relevante mudou: não grava atividade. */
  changed: boolean
  /** Frase depois do nome de quem fez: "registrou um pagamento recebido." */
  message: string
  detail: string
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function describeInvoiceChange(before: Invoice, after: Invoice): InvoiceChange {
  const parts: string[] = []
  if (before.amount !== after.amount) parts.push(`valor de ${formatCurrency(before.amount)} para ${formatCurrency(after.amount)}`)
  if (before.dueDate !== after.dueDate) parts.push(`vencimento de ${fmtNumericDate(before.dueDate)} para ${fmtNumericDate(after.dueDate)}`)
  if (before.description !== after.description) parts.push("descrição")
  if (!same(before.method, after.method) && after.status !== "pago") parts.push("forma de pagamento")
  if (before.clientId !== after.clientId) parts.push("cliente")
  if (!same(before.processId, after.processId)) parts.push("processo")

  const paidNow = before.status !== "pago" && after.status === "pago"
  const reopened = before.status === "pago" && after.status !== "pago"
  const paidDateChanged = before.status === "pago" && after.status === "pago" && !same(before.paidAt, after.paidAt)
  if (paidDateChanged) parts.push(`data do pagamento para ${after.paidAt ? fmtNumericDate(after.paidAt) : "não informada"}`)

  const summary = [after.description, formatCurrency(after.amount)]
  if (paidNow) {
    return {
      changed: true,
      message: "registrou um pagamento recebido.",
      detail: [
        ...summary,
        `pago em ${after.paidAt ? fmtNumericDate(after.paidAt) : "data não informada"}${after.method ? ` · ${after.method}` : ""}`,
        ...(parts.length ? [`Alterado: ${parts.join(", ")}`] : []),
      ].join(" · "),
    }
  }
  if (reopened) {
    return { changed: true, message: "reabriu um lançamento pago.", detail: [...summary, `vence ${fmtNumericDate(after.dueDate)}`].join(" · ") }
  }
  if (!parts.length) return { changed: false, message: "", detail: "" }
  return { changed: true, message: "atualizou um lançamento.", detail: [after.description, `Alterado: ${parts.join(", ")}`].join(" · ") }
}
