import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Client, Invoice } from "@/types"
import { financeSummary, monthlyRevenue, revenueByArea } from "./selectors"

const NOW = new Date(2026, 8, 24, 10, 0) // 24/09/2026

const invoice = (id: string, patch: Partial<Invoice>): Invoice => ({
  id,
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  clientId: "c1",
  description: "Honorários",
  amount: 1000,
  dueDate: "2026-09-10",
  status: "pendente",
  ...patch,
})

const client = (id: string, area: Client["area"]): Client => ({
  id,
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  name: id,
  kind: "PF",
  document: "",
  email: "",
  phone: "",
  address: "",
  area,
  ownerId: "u",
  status: "ativo",
  clientSince: "2026-01-01",
  lastActivityAt: "2026-01-01T00:00:00",
})

describe("financeiro calculado das faturas", () => {
  it("sem faturas, tudo zerado — nada de número inventado", () => {
    const series = monthlyRevenue([], NOW)
    assert.equal(series.length, 6)
    assert.ok(series.every((m) => m.prevista === 0 && m.recebida === 0))
    const summary = financeSummary([], NOW)
    assert.equal(summary.expected, 0)
    assert.equal(summary.received, 0)
    assert.equal(summary.growth, undefined)
    assert.equal(summary.defaultRate, 0)
    assert.deepEqual(revenueByArea([], []), [])
  })

  it("monta os meses até o atual, com rótulos reais", () => {
    const series = monthlyRevenue([], NOW)
    assert.equal(series[0].key, "2026-04")
    assert.equal(series[5].key, "2026-09")
    assert.equal(series[5].month, "Set")
    assert.equal(series[5].label, "Setembro de 2026")
  })

  it("previsto pelo vencimento, recebido pelo pagamento", () => {
    const invoices = [
      invoice("a", { dueDate: "2026-09-05", amount: 2000 }),
      invoice("b", { dueDate: "2026-08-20", amount: 500, status: "pago", paidAt: "2026-09-02" }),
      invoice("c", { dueDate: "2026-08-10", amount: 800, status: "pago", paidAt: "2026-08-11" }),
    ]
    const [aug, sep] = monthlyRevenue(invoices, NOW, 2)
    assert.equal(sep.prevista, 2000)
    assert.equal(sep.recebida, 500)
    assert.equal(aug.prevista, 1300)
    assert.equal(aug.recebida, 800)

    const summary = financeSummary(invoices, NOW)
    assert.equal(summary.month, "Setembro de 2026")
    assert.equal(summary.growth, ((500 - 800) / 800) * 100)
  })

  it("inadimplência é o vencido sobre o faturado", () => {
    const invoices = [invoice("a", { amount: 750, status: "atrasado" }), invoice("b", { amount: 250, status: "pago", paidAt: "2026-09-01" })]
    assert.equal(financeSummary(invoices, NOW).defaultRate, 75)
  })

  it("receita por área usa só o recebido no ano, da maior para a menor", () => {
    const clients = [client("c1", "Cível"), client("c2", "Trabalhista")]
    const invoices = [
      invoice("a", { clientId: "c1", amount: 300, status: "pago", paidAt: "2026-03-01" }),
      invoice("b", { clientId: "c2", amount: 900, status: "pago", paidAt: "2026-05-01" }),
      invoice("c", { clientId: "c2", amount: 5000, status: "pendente" }),
      invoice("d", { clientId: "c1", amount: 7000, status: "pago", paidAt: "2025-12-01" }),
    ]
    const byArea = revenueByArea(invoices, clients, 2026)
    assert.deepEqual(
      byArea.map((a) => [a.area, a.amount, a.pct]),
      [
        ["Trabalhista", 900, 75],
        ["Cível", 300, 25],
      ],
    )
  })
})
