/**
 * Custo estimado de cada chamada à IA, em dólares (a moeda da cobrança do provedor).
 *
 * Preços por 1 milhão de tokens, da tabela pública do Gemini (camada paga, texto).
 * Mudam com o tempo: confira em https://ai.google.dev/gemini-api/docs/pricing e, se
 * preciso, sobreponha sem mexer no código com `AI_PRICES` (JSON), por exemplo:
 *
 *   AI_PRICES={"gemini-3-flash":{"input":0.5,"output":3,"cachedInput":0.05}}
 *
 * Modelo sem preço conhecido: o custo fica em branco (os tokens continuam medidos).
 * Tokens de raciocínio ("thinking") são cobrados como saída e já vêm somados nela.
 */

export interface ModelPrice {
  /** US$ por 1M de tokens de entrada. */
  input: number
  /** US$ por 1M de tokens de saída (inclui raciocínio). */
  output: number
  /** US$ por 1M de tokens de entrada lidos do cache do provedor. */
  cachedInput?: number
}

const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cachedInput: 0.03 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cachedInput: 0.01 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cachedInput: 0.125 },
}

type Env = Record<string, string | undefined>

const isPrice = (value: unknown): value is ModelPrice =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ModelPrice).input === "number" &&
  typeof (value as ModelPrice).output === "number" &&
  (value as ModelPrice).input >= 0 &&
  (value as ModelPrice).output >= 0

/** Tabela em vigor: a padrão + `AI_PRICES` (entradas inválidas são ignoradas). */
export function priceTable(env: Env = process.env): Record<string, ModelPrice> {
  const table = { ...DEFAULT_PRICES }
  try {
    const custom = env.AI_PRICES ? (JSON.parse(env.AI_PRICES) as Record<string, unknown>) : {}
    for (const [model, price] of Object.entries(custom)) if (isPrice(price)) table[model] = price
  } catch {
    console.warn("[lexa-ia] AI_PRICES inválido: usando a tabela padrão.")
  }
  return table
}

/** Preço do modelo; variações com sufixo (ex.: "-001", "-preview-09-2025") usam o do nome base. */
export function priceOf(model: string | undefined, table = priceTable()): ModelPrice | undefined {
  if (!model) return undefined
  const name = model.replace(/^models\//, "")
  if (table[name]) return table[name]
  const base = Object.keys(table)
    .filter((key) => name.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0]
  return base ? table[base] : undefined
}

export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  /** Parte da entrada que veio do cache do provedor (já incluída em `inputTokens`). */
  cachedTokens?: number
}

/** Custo estimado em US$ (arredondado a 6 casas), ou `null` sem preço ou sem tokens. */
export function estimateCost(model: string | undefined, usage: TokenUsage, table = priceTable()): number | null {
  const price = priceOf(model, table)
  if (!price || (usage.inputTokens === undefined && usage.outputTokens === undefined)) return null
  const cached = Math.min(usage.cachedTokens ?? 0, usage.inputTokens ?? 0)
  const fresh = (usage.inputTokens ?? 0) - cached
  const cost = (fresh * price.input + cached * (price.cachedInput ?? price.input) + (usage.outputTokens ?? 0) * price.output) / 1_000_000
  return Math.round(cost * 1e6) / 1e6
}
