/**
 * Cache curto em memória (por instância do servidor) para pesquisas repetidas — a
 * mesma busca na mesma página, por qualquer pessoa, enquanto a base não muda. A base
 * é pública (igual para todos os escritórios); o acesso continua conferido na rota.
 */

export interface TtlCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  clear(): void
}

export function createTtlCache<T>(maxEntries = 300, ttlMs = 5 * 60_000, now: () => number = Date.now): TtlCache<T> {
  const entries = new Map<string, { value: T; expires: number }>()
  return {
    get(key) {
      const hit = entries.get(key)
      if (!hit) return undefined
      if (hit.expires <= now()) {
        entries.delete(key)
        return undefined
      }
      // Mais usado vai para o fim (o mais antigo sai primeiro).
      entries.delete(key)
      entries.set(key, hit)
      return hit.value
    },
    set(key, value) {
      entries.delete(key)
      entries.set(key, { value, expires: now() + ttlMs })
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string)
    },
    clear() {
      entries.clear()
    },
  }
}
