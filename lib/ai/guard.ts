/**
 * Proteções de custo da LEXA IA, em memória do servidor (sem Redis):
 *
 * - limite de uso por pessoa e por escritório (janela deslizante);
 * - cache curto de análises idênticas;
 * - deduplicação de pedidos iguais em andamento (dois cliques = uma chamada).
 *
 * Em várias instâncias cada uma tem seu próprio limite — suficiente para a demo.
 */

import { AIError } from "./errors"

/* ------------------------------ limite de uso ------------------------------ */

export interface RateRule {
  limit: number
  windowMs: number
}

export const RATE_RULES = {
  user: [
    { limit: 8, windowMs: 60_000 },
    { limit: 60, windowMs: 60 * 60_000 },
  ],
  organization: [{ limit: 200, windowMs: 60 * 60_000 }],
} satisfies Record<string, RateRule[]>

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  /** Registra uma chamada ou lança RATE_LIMITED. Só conta se todas as regras permitirem. */
  consume(checks: { key: string; rules: RateRule[] }[]) {
    const now = this.now()
    for (const { key, rules } of checks) {
      const list = this.prune(key, rules, now)
      for (const rule of rules) {
        const inWindow = list.filter((t) => now - t < rule.windowMs)
        if (inWindow.length >= rule.limit) {
          const retryAfter = Math.max(1, Math.ceil((inWindow[0] + rule.windowMs - now) / 1000))
          throw new AIError("RATE_LIMITED", { retryAfter })
        }
      }
    }
    for (const { key } of checks) this.hits.set(key, [...(this.hits.get(key) ?? []), now])
  }

  private prune(key: string, rules: RateRule[], now: number) {
    const longest = Math.max(...rules.map((r) => r.windowMs))
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < longest)
    if (list.length) this.hits.set(key, list)
    else this.hits.delete(key)
    return list
  }
}

/* ---------------------------------- cache ---------------------------------- */

export class ResultCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>()
  private readonly pending = new Map<string, Promise<T>>()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor({ ttlMs = 10 * 60_000, maxEntries = 300, now = Date.now }: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.now = now
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expires <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  /** Executa `produce` uma vez por chave; guarda o resultado só se der certo. */
  async run(key: string, produce: () => Promise<T>): Promise<T> {
    const running = this.pending.get(key)
    if (running) return running
    const promise = produce()
      .then((value) => {
        this.set(key, value)
        return value
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, promise)
    return promise
  }

  private set(key: string, value: T) {
    this.entries.delete(key)
    this.entries.set(key, { value, expires: this.now() + this.ttlMs })
    // Map mantém a ordem de inserção: o primeiro é o mais antigo.
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!)
  }
}

/** Hash curto e estável (FNV-1a) — só para chave de cache e log, nunca para segurança. */
export function shortHash(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
