import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Invoice } from "@/types"
import { describeInvoiceChange } from "@/lib/financeiro/invoices"

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: "i1",
  organizationId: "org",
  createdAt: "2026-09-01T10:00:00",
  clientId: "c1",
  description: "Honorários — parcela 1/3",
  amount: 1000,
  dueDate: "2026-10-10",
  status: "pendente",
  ...patch,
})

const money = (text: string) => text.replace(/ /g, " ")

describe("edição de lançamento", () => {
  it("baixa registra o pagamento com data e forma", () => {
    const change = describeInvoiceChange(invoice(), invoice({ status: "pago", paidAt: "2026-10-09", method: "Pix" }))
    assert.equal(change.message, "registrou um pagamento recebido.")
    assert.equal(money(change.detail), "Honorários — parcela 1/3 · R$ 1.000 · pago em 09/10/2026 · Pix")
  })

  it("valor e vencimento alterados aparecem com antes e depois", () => {
    const change = describeInvoiceChange(invoice(), invoice({ amount: 1200, dueDate: "2026-10-15" }))
    assert.equal(change.message, "atualizou um lançamento.")
    assert.equal(
      money(change.detail),
      "Honorários — parcela 1/3 · Alterado: valor de R$ 1.000 para R$ 1.200, vencimento de 10/10/2026 para 15/10/2026",
    )
  })

  it("reabrir um lançamento pago", () => {
    const change = describeInvoiceChange(invoice({ status: "pago", paidAt: "2026-10-09" }), invoice({ status: "pendente" }))
    assert.equal(change.message, "reabriu um lançamento pago.")
  })

  it("sem mudança relevante, não registra", () => {
    assert.equal(describeInvoiceChange(invoice(), invoice()).changed, false)
  })
})
