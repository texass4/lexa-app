/**
 * Consumo de IA por escritório (Super Admin): linhas do banco (`admin_ai_usage`,
 * agrupadas por escritório, operação e modelo) → resumo por escritório. Lógica pura.
 */

export interface AIUsageRow {
  organization_id: string
  operation: string
  model: string
  calls: number
  cached_calls: number
  errors: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_usd: number | string
  unpriced: number
  last_at: string | null
}

export interface AIUsageBreakdown {
  operation: string
  model: string
  calls: number
  cachedCalls: number
  errors: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface AIUsageOrg {
  organizationId: string
  name: string
  plan?: string
  /** Chamadas que chegaram ao modelo (contam no plano). */
  calls: number
  /** Respostas servidas do cache (não contam no plano, custo zero). */
  cachedCalls: number
  errors: number
  inputTokens: number
  outputTokens: number
  /** Parte da entrada lida do cache do provedor. */
  cachedTokens: number
  costUsd: number
  /** Chamadas de modelo sem preço cadastrado (custo subestimado). */
  unpriced: number
  models: string[]
  lastAt: string | null
  breakdown: AIUsageBreakdown[]
}

export interface AIUsageOverview {
  from: string
  to: string
  organizations: AIUsageOrg[]
  totals: Omit<AIUsageOrg, "organizationId" | "name" | "plan" | "models" | "lastAt" | "breakdown">
}

const num = (value: number | string | null | undefined) => {
  const n = typeof value === "string" ? Number(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function summarizeAIUsage(
  rows: AIUsageRow[],
  orgs: Map<string, { name: string; plan?: string }>,
  period: { from: string; to: string },
): AIUsageOverview {
  const byOrg = new Map<string, AIUsageOrg>()
  for (const row of rows) {
    const info = orgs.get(row.organization_id)
    const org =
      byOrg.get(row.organization_id) ??
      ({
        organizationId: row.organization_id,
        name: info?.name ?? "Escritório removido",
        plan: info?.plan,
        calls: 0,
        cachedCalls: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        unpriced: 0,
        models: [],
        lastAt: null,
        breakdown: [],
      } satisfies AIUsageOrg)
    org.calls += num(row.calls)
    org.cachedCalls += num(row.cached_calls)
    org.errors += num(row.errors)
    org.inputTokens += num(row.input_tokens)
    org.outputTokens += num(row.output_tokens)
    org.cachedTokens += num(row.cached_tokens)
    org.costUsd += num(row.cost_usd)
    org.unpriced += num(row.unpriced)
    if (row.model !== "—" && !org.models.includes(row.model)) org.models.push(row.model)
    if (row.last_at && (!org.lastAt || row.last_at > org.lastAt)) org.lastAt = row.last_at
    org.breakdown.push({
      operation: row.operation,
      model: row.model,
      calls: num(row.calls),
      cachedCalls: num(row.cached_calls),
      errors: num(row.errors),
      inputTokens: num(row.input_tokens),
      outputTokens: num(row.output_tokens),
      costUsd: num(row.cost_usd),
    })
    byOrg.set(row.organization_id, org)
  }

  const organizations = [...byOrg.values()]
    .map((org) => ({
      ...org,
      costUsd: Math.round(org.costUsd * 1e6) / 1e6,
      models: org.models.sort(),
      breakdown: org.breakdown.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.name.localeCompare(b.name, "pt-BR"))

  const totals = organizations.reduce(
    (acc, o) => ({
      calls: acc.calls + o.calls,
      cachedCalls: acc.cachedCalls + o.cachedCalls,
      errors: acc.errors + o.errors,
      inputTokens: acc.inputTokens + o.inputTokens,
      outputTokens: acc.outputTokens + o.outputTokens,
      cachedTokens: acc.cachedTokens + o.cachedTokens,
      costUsd: acc.costUsd + o.costUsd,
      unpriced: acc.unpriced + o.unpriced,
    }),
    { calls: 0, cachedCalls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, unpriced: 0 },
  )
  return { ...period, organizations, totals: { ...totals, costUsd: Math.round(totals.costUsd * 1e6) / 1e6 } }
}

/** "US$ 0,0123" — custos de IA são frações de centavo; 4 casas para não sumirem. */
export function formatUsd(value: number) {
  const digits = value !== 0 && Math.abs(value) < 1 ? 4 : 2
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export const OPERATION_LABEL: Record<string, string> = {
  "process.summary": "Resumo do processo",
  "process.movement": "Análise de movimentação",
  "process.next-actions": "Próximos passos",
  "client.summary": "Resumo do cliente",
  "office.overview": "Panorama do escritório",
  "finance.analysis": "Análise do financeiro",
  "chat.process": "Chat — processo",
  "chat.client": "Chat — cliente",
  "chat.office": "Chat — escritório",
  "triage.interpret": "Triagem automática",
}
