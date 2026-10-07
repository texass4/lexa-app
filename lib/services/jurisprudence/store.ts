/**
 * Acesso ao banco da jurisprudência.
 *
 * - `supabaseSyncRepository(admin)`: só a sincronização (service role, servidor) grava
 *   na base pública e no log.
 * - `jurisprudenceRepository(supabase)`: tudo o que a pessoa faz, com a SESSÃO DELA —
 *   a RLS decide o que ela lê e grava (base: membros ativos com `processes.view`;
 *   salvas e vínculos: só o próprio escritório).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { JurisprudenceError } from "./errors"
import { SOURCE_INFO } from "./config"
import type { JurisprudenceDecision, JurisprudenceFilters, JurisprudenceProviderId, JurisprudenceResult, JurisprudenceSort, NormalizedDecision, SourceFile } from "./types"
import type { SyncRepository, SyncSummary } from "./sync"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value)

/** Tempo máximo de uma consulta ao banco feita pela tela. */
const QUERY_TIMEOUT_MS = 10_000

/** Erro do PostgREST/Postgres → erro da jurisprudência (detalhe só para o log). */
function dbError(error: { code?: string; message?: string; name?: string } | null | undefined, what: string): JurisprudenceError {
  const code = error?.code ?? ""
  if (error?.name === "AbortError" || code === "57014" || code === "20") return new JurisprudenceError("TIMEOUT", `${what}: tempo esgotado`)
  // Função ou tabela ausente: a migração 0019 não foi aplicada.
  if (code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205") return new JurisprudenceError("NOT_CONFIGURED", `${what}: migração 0019 ausente (${code})`)
  if (code === "42501") return new JurisprudenceError("NOT_FOUND", `${what}: sem permissão`)
  return new JurisprudenceError("UNAVAILABLE", `${what}: ${code} ${error?.message ?? ""}`.trim())
}

/* ---------------------------------- sync ----------------------------------- */

export function supabaseSyncRepository(admin: SupabaseClient): SyncRepository {
  return {
    async startRun(provider) {
      const { data, error } = await admin.from("jurisprudence_sync_runs").insert({ provider, status: "running" }).select("id").single<{ id: number }>()
      if (error) throw dbError(error, "registrar execução")
      return data.id
    },
    async finishRun(id, summary: SyncSummary) {
      if (id === null) return
      const { error } = await admin
        .from("jurisprudence_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: summary.status,
          records_fetched: summary.fetched,
          records_created: summary.created,
          records_updated: summary.updated,
          records_skipped: summary.skipped,
          files_processed: summary.files,
          errors: summary.errors,
          details: { invalid: summary.invalid, pendingFiles: summary.pendingFiles, stoppedBy: summary.stoppedBy ?? null, retryAfterMs: summary.retryAfterMs ?? null },
        })
        .eq("id", id)
      if (error) throw dbError(error, "concluir execução")
    },
    async processedFiles(provider) {
      const { data, error } = await admin.from("jurisprudence_sync_files").select("resource_id").eq("provider", provider)
      if (error) throw dbError(error, "arquivos lidos")
      return new Set((data ?? []).map((row: { resource_id: string }) => row.resource_id))
    },
    async markFile(provider, file: SourceFile, records) {
      const { error } = await admin.from("jurisprudence_sync_files").upsert(
        { provider, dataset: file.dataset, resource_id: file.resourceId, resource_name: file.name, resource_url: file.url, records, processed_at: new Date().toISOString() },
        { onConflict: "provider,resource_id" },
      )
      if (error) throw dbError(error, "marcar arquivo")
    },
    async existingHashes(provider, tribunal, externalIds) {
      const hashes = new Map<string, string>()
      if (!externalIds.length) return hashes
      const { data, error } = await admin
        .from("jurisprudence")
        .select("external_id, content_hash")
        .eq("provider", provider)
        .eq("tribunal", tribunal)
        .in("external_id", externalIds)
      if (error) throw dbError(error, "conferir existentes")
      for (const row of (data ?? []) as { external_id: string; content_hash: string }[]) hashes.set(row.external_id, row.content_hash)
      return hashes
    },
    async upsert(rows: NormalizedDecision[]) {
      const { error } = await admin.from("jurisprudence").upsert(rows, { onConflict: "provider,tribunal,external_id" })
      if (error) throw dbError(error, "gravar decisões")
    },
  }
}

/* ------------------------------- leitura ---------------------------------- */

interface SearchRow {
  id: string
  provider: string
  tribunal: string
  process_number: string | null
  class_code: string | null
  class_name: string | null
  court: string | null
  rapporteur: string | null
  judgment_date: string | null
  subject: string | null
  area: string | null
  degree: string | null
  source_url: string | null
  snippet: string | null
  score: number | null
  total: number | string
}

export interface DecisionRow {
  id: string
  provider: string
  tribunal: string
  external_id: string
  process_number: string | null
  registry_number: string | null
  class_code: string | null
  class_name: string | null
  court: string | null
  rapporteur: string | null
  judgment_date: string | null
  publication_date: string | null
  publication: string | null
  decision_type: string | null
  subject: string | null
  ementa: string
  decision_text: string | null
  thesis: string | null
  keywords: string | null
  legislation: string[] | null
  cited_precedents: string | null
  notes: string | null
  area: string | null
  degree: string | null
  source_url: string | null
  raw_reference: { file_url?: string } | null
  updated_at: string
}

export const DECISION_COLUMNS = [
  "id", "provider", "tribunal", "external_id", "process_number", "registry_number", "class_code", "class_name", "court", "rapporteur",
  "judgment_date", "publication_date", "publication", "decision_type", "subject", "ementa", "decision_text", "thesis", "keywords",
  "legislation", "cited_precedents", "notes", "area", "degree", "source_url", "raw_reference", "updated_at",
].join(",")
const SUMMARY_COLUMNS = "id,provider,tribunal,process_number,class_code,class_name,court,rapporteur,judgment_date,subject,area,degree,source_url,ementa"

const opt = (value: string | null | undefined) => value ?? undefined

export function toResult(row: Omit<SearchRow, "total" | "snippet" | "score"> & { snippet?: string | null; score?: number | null; ementa?: string }): JurisprudenceResult {
  return {
    id: row.id,
    provider: row.provider,
    tribunal: row.tribunal,
    processNumber: opt(row.process_number),
    classCode: opt(row.class_code),
    className: opt(row.class_name),
    court: opt(row.court),
    rapporteur: opt(row.rapporteur),
    judgmentDate: opt(row.judgment_date),
    subject: opt(row.subject),
    area: opt(row.area),
    degree: opt(row.degree),
    sourceUrl: opt(row.source_url),
    snippet: row.snippet ?? (row.ementa ? row.ementa.slice(0, 420) : ""),
    score: Number(row.score ?? 0),
  }
}

export function toDecision(row: DecisionRow): JurisprudenceDecision {
  return {
    id: row.id,
    provider: row.provider,
    tribunal: row.tribunal,
    externalId: row.external_id,
    processNumber: opt(row.process_number),
    registryNumber: opt(row.registry_number),
    classCode: opt(row.class_code),
    className: opt(row.class_name),
    court: opt(row.court),
    rapporteur: opt(row.rapporteur),
    judgmentDate: opt(row.judgment_date),
    publicationDate: opt(row.publication_date),
    publication: opt(row.publication),
    decisionType: opt(row.decision_type),
    subject: opt(row.subject),
    ementa: row.ementa,
    decisionText: opt(row.decision_text),
    thesis: opt(row.thesis),
    keywords: opt(row.keywords),
    legislation: row.legislation ?? [],
    citedPrecedents: opt(row.cited_precedents),
    notes: opt(row.notes),
    area: opt(row.area),
    degree: opt(row.degree),
    sourceUrl: opt(row.source_url),
    fileUrl: typeof row.raw_reference?.file_url === "string" ? row.raw_reference.file_url : undefined,
    sourceLabel: SOURCE_INFO[row.provider as JurisprudenceProviderId]?.label ?? row.tribunal,
    updatedAt: row.updated_at,
  }
}

export interface SearchParams {
  text: string
  filters: JurisprudenceFilters
  sort: JurisprudenceSort
  limit: number
  offset: number
}

export interface Facet {
  value: string
  label: string
  total: number
}

export interface SavedEntry {
  id: string
  notes?: string
  createdAt: string
  createdBy?: string
  decision: JurisprudenceResult
}

export interface LinkedEntry {
  id: string
  processId: string
  createdAt: string
  createdBy?: string
  decision: JurisprudenceResult
}

const timeout = () => AbortSignal.timeout(QUERY_TIMEOUT_MS)

export function jurisprudenceRepository(supabase: SupabaseClient) {
  return {
    async search(params: SearchParams): Promise<{ rows: JurisprudenceResult[]; total: number }> {
      const { data, error } = await supabase
        .rpc("search_jurisprudence", {
          p_query: params.text,
          p_filters: params.filters,
          p_sort: params.sort,
          p_limit: params.limit,
          p_offset: params.offset,
        })
        .abortSignal(timeout())
      if (error) throw dbError(error, "pesquisa")
      const rows = (data ?? []) as SearchRow[]
      return { rows: rows.map(toResult), total: rows.length ? Number(rows[0].total) : 0 }
    },

    async getDecision(id: string): Promise<JurisprudenceDecision | null> {
      if (!isUuid(id)) return null
      const { data, error } = await supabase.from("jurisprudence").select(DECISION_COLUMNS).eq("id", id).abortSignal(timeout()).maybeSingle<DecisionRow>()
      if (error) throw dbError(error, "decisão")
      return data ? toDecision(data) : null
    },

    async facets(): Promise<Record<string, Facet[]>> {
      const { data, error } = await supabase.rpc("jurisprudence_facets").abortSignal(timeout())
      if (error) throw dbError(error, "filtros")
      const out: Record<string, Facet[]> = {}
      for (const row of (data ?? []) as { kind: string; value: string; label: string; total: number | string }[]) {
        ;(out[row.kind] ??= []).push({ value: row.value, label: row.label, total: Number(row.total) })
      }
      for (const list of Object.values(out)) list.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
      return out
    },

    async status(): Promise<{ provider: string; decisions: number; lastSuccess?: string; lastStatus?: string }[]> {
      const { data, error } = await supabase.rpc("jurisprudence_status").abortSignal(timeout())
      if (error) throw dbError(error, "situação")
      return ((data ?? []) as { provider: string; decisions: number | string; last_success: string | null; last_status: string | null }[]).map((row) => ({
        provider: row.provider,
        decisions: Number(row.decisions),
        lastSuccess: opt(row.last_success),
        lastStatus: opt(row.last_status),
      }))
    },

    /* --------------------------- salvas (escritório) ------------------------- */

    async savedIds(ids: string[]): Promise<Map<string, { id: string; notes?: string }>> {
      const out = new Map<string, { id: string; notes?: string }>()
      const valid = ids.filter(isUuid)
      if (!valid.length) return out
      const { data, error } = await supabase.from("saved_jurisprudence").select("id, jurisprudence_id, notes").in("jurisprudence_id", valid)
      if (error) throw dbError(error, "salvas")
      for (const row of (data ?? []) as { id: string; jurisprudence_id: string; notes: string | null }[]) out.set(row.jurisprudence_id, { id: row.id, notes: opt(row.notes) })
      return out
    },

    async listSaved(limit: number, offset: number): Promise<{ entries: SavedEntry[]; total: number }> {
      const { data, error, count } = await supabase
        .from("saved_jurisprudence")
        .select(`id, notes, created_at, created_by, jurisprudence:jurisprudence_id (${SUMMARY_COLUMNS})`, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)
        .abortSignal(timeout())
      if (error) throw dbError(error, "salvas")
      const entries = ((data ?? []) as unknown as { id: string; notes: string | null; created_at: string; created_by: string | null; jurisprudence: Parameters<typeof toResult>[0] | null }[])
        .filter((row) => row.jurisprudence)
        .map((row) => ({ id: row.id, notes: opt(row.notes), createdAt: row.created_at, createdBy: opt(row.created_by), decision: toResult(row.jurisprudence!) }))
      return { entries, total: count ?? entries.length }
    },

    async save(organizationId: string, jurisprudenceId: string, userId: string, notes?: string) {
      const { data, error } = await supabase
        .from("saved_jurisprudence")
        .upsert({ organization_id: organizationId, jurisprudence_id: jurisprudenceId, created_by: userId, notes: notes ?? null }, { onConflict: "organization_id,jurisprudence_id" })
        .select("id")
        .single<{ id: string }>()
      if (error) throw error.code === "23503" ? new JurisprudenceError("NOT_FOUND", "decisão inexistente") : dbError(error, "salvar")
      return data.id
    },

    async updateNotes(jurisprudenceId: string, notes: string | null) {
      const { data, error } = await supabase.from("saved_jurisprudence").update({ notes }).eq("jurisprudence_id", jurisprudenceId).select("id")
      if (error) throw dbError(error, "observações")
      if (!data?.length) throw new JurisprudenceError("NOT_FOUND", "decisão não está salva")
    },

    async unsave(jurisprudenceId: string) {
      const { error } = await supabase.from("saved_jurisprudence").delete().eq("jurisprudence_id", jurisprudenceId)
      if (error) throw dbError(error, "remover salva")
    },

    /* --------------------------- vínculos com processo ----------------------- */

    async linkedProcessIds(jurisprudenceId: string): Promise<string[]> {
      if (!isUuid(jurisprudenceId)) return []
      const { data, error } = await supabase.from("process_jurisprudence").select("process_id").eq("jurisprudence_id", jurisprudenceId)
      if (error) throw dbError(error, "vínculos")
      return (data ?? []).map((row: { process_id: string }) => row.process_id)
    },

    async listLinked(processId: string): Promise<LinkedEntry[]> {
      const { data, error } = await supabase
        .from("process_jurisprudence")
        .select(`id, process_id, created_at, created_by, jurisprudence:jurisprudence_id (${SUMMARY_COLUMNS})`)
        .eq("process_id", processId)
        .order("created_at", { ascending: false })
        .limit(100)
        .abortSignal(timeout())
      if (error) throw dbError(error, "vínculos")
      return ((data ?? []) as unknown as { id: string; process_id: string; created_at: string; created_by: string | null; jurisprudence: Parameters<typeof toResult>[0] | null }[])
        .filter((row) => row.jurisprudence)
        .map((row) => ({ id: row.id, processId: row.process_id, createdAt: row.created_at, createdBy: opt(row.created_by), decision: toResult(row.jurisprudence!) }))
    },

    /** `created: false` quando o vínculo já existia (nada muda). */
    async link(organizationId: string, processId: string, jurisprudenceId: string, userId: string): Promise<{ created: boolean }> {
      const { data, error } = await supabase
        .from("process_jurisprudence")
        .upsert(
          { organization_id: organizationId, process_id: processId, jurisprudence_id: jurisprudenceId, created_by: userId },
          { onConflict: "organization_id,process_id,jurisprudence_id", ignoreDuplicates: true },
        )
        .select("id")
      // Processo ou decisão inexistente (ou de outro escritório): a chave estrangeira recusa.
      if (error) throw error.code === "23503" ? new JurisprudenceError("NOT_FOUND", "processo ou decisão inexistente") : dbError(error, "vincular")
      return { created: (data ?? []).length > 0 }
    },

    async unlink(processId: string, jurisprudenceId: string) {
      const { error } = await supabase.from("process_jurisprudence").delete().eq("process_id", processId).eq("jurisprudence_id", jurisprudenceId)
      if (error) throw dbError(error, "desvincular")
    },
  }
}

export type JurisprudenceRepository = ReturnType<typeof jurisprudenceRepository>
