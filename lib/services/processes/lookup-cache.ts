/**
 * Cache da consulta processual, em duas camadas — ambas isoladas por escritório.
 *
 * 1. Memória do servidor (`MemoryLookupCache`): chave `organização:cnj`,
 *    tamanho limitado (LRU). Responde em microssegundos.
 * 2. Supabase (`supabaseLookupStore`): tabela `process_lookup_cache`, com RLS
 *    por `organization_id`. Sobrevive a reinícios e é compartilhada entre
 *    instâncias do servidor. Usa o cliente com a sessão de quem pediu, então o
 *    banco só deixa ler e gravar o cache do próprio escritório.
 *
 * O cache é por escritório de propósito, mesmo sendo dado público: um cache
 * global deixaria um escritório perceber (pela velocidade da resposta) quais
 * processos outro escritório acompanha.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ProcessSheet } from "./sheet"

export interface CachedLookup {
  found: boolean
  sheet: ProcessSheet | null
  /** Epoch em ms do momento em que a fonte foi consultada. */
  fetchedAt: number
}

export const cacheKey = (organizationId: string, cnj: string) => `${organizationId}:${cnj}`

export class MemoryLookupCache {
  private entries = new Map<string, CachedLookup>()
  private readonly maxEntries: number

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries
  }

  get(key: string): CachedLookup | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    // Reinsere para manter a ordem de uso (o mais antigo sai primeiro).
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry
  }

  set(key: string, entry: CachedLookup) {
    this.entries.delete(key)
    this.entries.set(key, entry)
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  clear() {
    this.entries.clear()
  }
}

/** Persistência do cache (Supabase em produção, memória nos testes). */
export interface LookupStore {
  get(organizationId: string, cnj: string): Promise<CachedLookup | null>
  set(organizationId: string, cnj: string, entry: CachedLookup): Promise<void>
}

const TABLE = "process_lookup_cache"

/** Tabela ausente (migração 0002 não aplicada): o cache persistente fica desligado, sem quebrar a consulta. */
let tableMissing = false
const isMissingTable = (error: { code?: string }) => error.code === "42P01" || error.code === "PGRST205"

export function supabaseLookupStore(supabase: SupabaseClient): LookupStore {
  return {
    async get(organizationId, cnj) {
      if (tableMissing) return null
      const { data, error } = await supabase
        .from(TABLE)
        .select("found, sheet, fetched_at")
        .eq("organization_id", organizationId)
        .eq("cnj", cnj)
        .maybeSingle<{ found: boolean; sheet: ProcessSheet | null; fetched_at: string }>()
      if (error) {
        if (isMissingTable(error)) {
          tableMissing = true
          console.warn(
            `[process-lookup] tabela ${TABLE} não encontrada — rode supabase/migrations/0002_process_lookup_cache.sql. Seguindo só com o cache em memória.`,
          )
          return null
        }
        throw error
      }
      if (!data) return null
      return { found: data.found, sheet: data.sheet, fetchedAt: Date.parse(data.fetched_at) }
    },

    async set(organizationId, cnj, entry) {
      if (tableMissing) return
      const { error } = await supabase.from(TABLE).upsert(
        {
          organization_id: organizationId,
          cnj,
          found: entry.found,
          sheet: entry.sheet,
          fetched_at: new Date(entry.fetchedAt).toISOString(),
        },
        { onConflict: "organization_id,cnj" },
      )
      if (error) {
        if (isMissingTable(error)) tableMissing = true
        else throw error
      }
    },
  }
}
