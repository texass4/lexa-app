import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatUsd, summarizeAIUsage, type AIUsageRow } from "./ai-usage"

const row = (patch: Partial<AIUsageRow>): AIUsageRow => ({
  organization_id: "a",
  operation: "process.summary",
  model: "gemini-2.5-flash",
  calls: 1,
  cached_calls: 0,
  errors: 0,
  input_tokens: 1000,
  output_tokens: 200,
  cached_tokens: 0,
  cost_usd: "0.000800",
  unpriced: 0,
  last_at: "2026-09-29T10:00:00Z",
  ...patch,
})

describe("consumo de IA por escritório (Super Admin)", () => {
  it("soma por escritório, lista modelos e operações, e ordena pelo custo", () => {
    const overview = summarizeAIUsage(
      [
        row({}),
        row({ operation: "triage.interpret", model: "gemini-2.5-flash-lite", calls: 10, cost_usd: 0.0011, last_at: "2026-09-29T12:00:00Z" }),
        row({ operation: "process.summary", model: "—", calls: 0, cached_calls: 3, input_tokens: 0, output_tokens: 0, cost_usd: 0 }),
        row({ organization_id: "b", calls: 2, errors: 1, cost_usd: 0.005 }),
      ],
      new Map([
        ["a", { name: "Escritório A", plan: "Essencial" }],
        ["b", { name: "Escritório B" }],
      ]),
      { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" },
    )
    assert.deepEqual(
      overview.organizations.map((o) => o.name),
      ["Escritório B", "Escritório A"],
    )
    const a = overview.organizations[1]
    assert.deepEqual([a.calls, a.cachedCalls, a.inputTokens, a.costUsd], [11, 3, 2000, 0.0019])
    assert.deepEqual(a.models, ["gemini-2.5-flash", "gemini-2.5-flash-lite"])
    assert.equal(a.lastAt, "2026-09-29T12:00:00Z")
    assert.equal(a.breakdown[0].operation, "triage.interpret")
    assert.deepEqual([overview.totals.calls, overview.totals.errors, overview.totals.costUsd], [13, 1, 0.0069])
  })

  it("custo em dólar com casas suficientes para frações de centavo", () => {
    assert.equal(formatUsd(0.0019), "US$ 0,0019")
    assert.equal(formatUsd(12.5), "US$ 12,50")
    assert.equal(formatUsd(0), "US$ 0,00")
  })
})
