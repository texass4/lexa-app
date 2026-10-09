/**
 * Fontes reais do workflow (produção). Somente servidor.
 *
 * - DataJud: pelo serviço de consulta de sempre (`processLookup`) — mesmo cache por
 *   escritório (6 h), deduplicação, retry/backoff e prazo. "Consultar novamente" aceita
 *   dado de até 1 minuto (o intervalo mínimo entre idas à fonte).
 * - Comunicações (DJEN): só com `DJEN_CONSULTA_ENABLED=true` (termos de uso comercial a
 *   confirmar com o CNJ; servidor no Brasil). Cache de 1 h por escritório + número e
 *   deduplicação de chamadas simultâneas.
 * - Jurisprudência: a base pública já indexada da Íntegra (sem rede externa), só quando
 *   o módulo tem fonte configurada (`JURISPRUDENCIA_FONTES`).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { LookupError } from "@/lib/integrations/legal/errors"
import { createDjenClient, type DjenClient } from "@/lib/integrations/legal/djen/client"
import { mapCommunication, type Communication } from "@/lib/integrations/legal/djen/mapper"
import { processLookup } from "@/lib/services/processos/process-lookup"
import { supabaseLookupStore } from "@/lib/services/processos/lookup-cache"
import { FRESH_FOR_MS, MIN_REFRESH_INTERVAL_MS } from "@/lib/services/processos/lookup-service"
import { jurisprudenceConfig } from "@/lib/services/jurisprudence/config"
import { createIndexedProvider } from "@/lib/services/jurisprudence/provider"
import { relatedQueryForProcess } from "@/lib/services/jurisprudence/service"
import { jurisprudenceRepository } from "@/lib/services/jurisprudence/store"
import type { Process } from "@/types"
import type { ReportJurisprudence } from "./types"
import type { CommunicationsResult, WorkflowDeps } from "./workflow"

const COMMUNICATIONS_TTL_MS = 60 * 60_000

/** A consulta às comunicações oficiais está habilitada neste servidor? */
export const djenEnabled = (env: Record<string, string | undefined> = process.env) => /^(1|true|sim|on)$/i.test(env.DJEN_CONSULTA_ENABLED?.trim() ?? "")

let djen: DjenClient | undefined
const djenClient = () =>
  (djen ??= createDjenClient({
    baseUrl: process.env.DJEN_BASE_URL?.trim() || undefined,
    log: (event, fields) => {
      const line = `[consulta] djen ${event} ${JSON.stringify(fields)}`
      if (event === "response" && fields.status === 200) console.info(line)
      else console.warn(line)
    },
  }))

/** Comunicações de um processo, com cache por escritório e deduplicação. */
export function cachedCommunications(
  fetchItems: (cnj: string) => Promise<{ items: Communication[]; total: number }>,
  options: { now?: () => number; ttlMs?: number } = {},
) {
  const now = options.now ?? Date.now
  const ttl = options.ttlMs ?? COMMUNICATIONS_TTL_MS
  const communicationsCache = new Map<string, { at: number; value: CommunicationsResult }>()
  const communicationsInflight = new Map<string, Promise<CommunicationsResult>>()
  return (organizationId: string) =>
    async (cnj: string, { force }: { force: boolean }): Promise<CommunicationsResult> => {
      const key = `${organizationId}:${cnj}`
      const hit = communicationsCache.get(key)
      if (hit && !force && now() - hit.at < ttl) return { ...hit.value, cached: true }
      const running = communicationsInflight.get(key)
      if (running) return running
      const task = (async () => {
        const { items, total } = await fetchItems(cnj)
        const value: CommunicationsResult = { items, total, checkedAt: new Date(now()).toISOString(), cached: false }
        communicationsCache.set(key, { at: now(), value })
        if (communicationsCache.size > 500) communicationsCache.delete(communicationsCache.keys().next().value!)
        return value
      })().finally(() => communicationsInflight.delete(key))
      communicationsInflight.set(key, task)
      return task
    }
}

const djenForOrg = cachedCommunications(async (cnj) => {
  const { items, total } = await djenClient().searchByProcess(cnj)
  const mapped = items
    .map(mapCommunication)
    .filter((c): c is Communication => !!c && !c.cancelled)
    // Só comunicações deste número (a fonte pode devolver itens de processos vinculados).
    .filter((c) => !c.cnj || c.cnj === cnj)
  return { items: mapped, total }
})

const cleanSnippet = (snippet: string) => snippet.replace(/[⟦⟧]/g, "").replace(/\s+/g, " ").trim()

export interface ProductionSourcesInput {
  organizationId: string
  admin: SupabaseClient
  /** Consulta automática de processos ligada pela administração. */
  datajudEnabled: boolean
}

export function productionSources({ organizationId, admin, datajudEnabled }: ProductionSourcesInput): Omit<WorkflowDeps, "progress" | "now"> {
  const store = supabaseLookupStore(admin)
  return {
    primary: async (cnj, { force }) => {
      if (!datajudEnabled) throw new LookupError("NOT_CONFIGURED", "consulta automática desligada pela administração")
      const result = await processLookup.lookup({ organizationId, cnj, store, maxAgeMs: force ? MIN_REFRESH_INTERVAL_MS : FRESH_FOR_MS })
      return { sheet: result.sheet, checkedAt: result.checkedAt, cached: result.cached }
    },
    communications: djenEnabled() ? djenForOrg(organizationId) : null,
    jurisprudence: jurisprudenceConfig().enabled
      ? async (input) => {
          const query = relatedQueryForProcess({ subject: input.subject, type: input.type ?? "", className: input.className, area: input.area as Process["area"] })
          if (query.missing) return { items: [], total: 0, basis: query.basis, message: query.missing }
          // Base pública (sem dado de escritório): leitura direta, sem depender da sessão da requisição.
          const page = await createIndexedProvider(jurisprudenceRepository(admin)).search({ text: query.text, filters: query.filters, page: 1, pageSize: 5 })
          const items: ReportJurisprudence[] = page.results.map((r) => ({
            id: r.id,
            label: [r.tribunal, [r.classCode, r.processNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
            date: r.judgmentDate,
            excerpt: cleanSnippet(r.snippet),
            href: `/jurisprudencia?id=${r.id}`,
            sourceUrl: r.sourceUrl,
          }))
          return { items, total: page.total, basis: query.basis }
        }
      : null,
  }
}
