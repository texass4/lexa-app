/**
 * Proteções de custo da Íntegra IA.
 *
 * - Limites: as regras ficam aqui; quem conta e bloqueia é o banco (`ai_reserve`,
 *   `0013_ia_consumo.sql`), de forma atômica — vale com vários servidores. A memória
 *   do servidor nunca decide se uma chamada pode acontecer.
 * - Cache de análises: `AICache` (no Supabase em produção, `lib/ai/cache.ts`), comum
 *   a todos os servidores. A chave inclui o contexto inteiro: dado novo = análise nova.
 * - Pedidos iguais ao mesmo tempo (dois cliques) viram uma chamada só (`InFlight`) —
 *   só uma economia local; o cache e os limites continuam no banco.
 */

/* ------------------------------ limite de uso ------------------------------ */

export interface RateRule {
  limit: number
  windowMs: number
}

/** Ritmo máximo (além do limite mensal do plano, que vem do plano do escritório). */
export const RATE_RULES = {
  user: [
    { limit: 8, windowMs: 60_000 },
    { limit: 60, windowMs: 60 * 60_000 },
  ],
  organization: [{ limit: 200, windowMs: 60 * 60_000 }],
} satisfies Record<string, RateRule[]>

/* ---------------------------------- cache ---------------------------------- */

/** Quanto tempo uma análise idêntica é reaproveitada (o contexto inclui a data de hoje). */
export const CACHE_TTL_MS = 12 * 60 * 60_000

export interface AICache {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, entry: { organizationId: string; operation: string; value: T; ttlMs: number }): Promise<void>
}

/** Cache em memória — para testes e desenvolvimento sem banco. */
export class MemoryAICache implements AICache {
  private readonly entries = new Map<string, { value: unknown; expires: number }>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  async get<T>(key: string) {
    const entry = this.entries.get(key)
    if (!entry || entry.expires <= this.now()) return undefined
    return entry.value as T
  }

  async set<T>(key: string, entry: { organizationId: string; operation: string; value: T; ttlMs: number }) {
    this.entries.set(key, { value: entry.value, expires: this.now() + entry.ttlMs })
  }
}

/** Uma execução por chave ao mesmo tempo, neste servidor. */
export class InFlight<T> {
  private readonly pending = new Map<string, Promise<T>>()

  run(key: string, produce: () => Promise<T>): Promise<T> {
    const running = this.pending.get(key)
    if (running) return running
    const promise = produce().finally(() => this.pending.delete(key))
    this.pending.set(key, promise)
    return promise
  }
}

/** Hash curto e estável (FNV-1a) — só para log, nunca para segurança. */
export function shortHash(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
