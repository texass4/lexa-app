/**
 * Sincronização: FONTE OFICIAL → normalização → deduplicação → Supabase.
 *
 * - Idempotente: cada arquivo da fonte é marcado como lido só depois de gravado;
 *   rodar de novo não duplica (chave `provider + tribunal + external_id`) e não
 *   regrava o que não mudou (hash do conteúdo).
 * - Controlada: na primeira leitura de um conjunto, só os N arquivos mais recentes;
 *   no máximo `maxFiles` downloads por execução, um de cada vez, com pausa entre eles;
 *   limite de tempo.
 * - 429 da fonte encerra a execução (`partial`) — o agendador volta depois.
 * - Erro num conjunto não impede os outros; tudo vai para o log da execução.
 */

import { JurisprudenceError } from "./errors"
import type { JurisprudenceSource, NormalizedDecision, SourceFile } from "./types"

export interface SyncRepository {
  startRun(provider: string): Promise<number | null>
  finishRun(id: number | null, summary: SyncSummary): Promise<void>
  /** `resource_id` dos arquivos já lidos desta fonte. */
  processedFiles(provider: string): Promise<Set<string>>
  markFile(provider: string, file: SourceFile, records: number): Promise<void>
  /** Hash atual de cada decisão já gravada (por `external_id`). */
  existingHashes(provider: string, tribunal: string, externalIds: string[]): Promise<Map<string, string>>
  upsert(rows: NormalizedDecision[]): Promise<void>
}

export interface SyncError {
  dataset?: string
  file?: string
  message: string
}

export interface SyncSummary {
  provider: string
  status: "success" | "partial" | "failed" | "skipped"
  fetched: number
  created: number
  updated: number
  /** Registros sem mudança + registros descartados (inválidos). */
  skipped: number
  invalid: number
  files: number
  /** Arquivos novos que ficaram para a próxima execução. */
  pendingFiles: number
  stoppedBy?: "rate_limit" | "time" | "file_limit"
  retryAfterMs?: number
  errors: SyncError[]
}

export interface SyncOptions {
  source: JurisprudenceSource
  repo: SyncRepository
  initialFiles: number
  maxFiles: number
  /** Epoch ms: não começa download novo depois disso. */
  deadline?: number
  pauseMs?: number
  batchSize?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const MAX_LOGGED_ERRORS = 30
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Intercala as filas dos conjuntos: cada órgão julgador avança um pouco por execução. */
function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = []
  for (let i = 0; lists.some((list) => i < list.length); i += 1) for (const list of lists) if (i < list.length) out.push(list[i])
  return out
}

const describe = (error: unknown) =>
  error instanceof JurisprudenceError ? `${error.code}${error.detail ? `: ${error.detail}` : ""}` : error instanceof Error ? error.message : String(error)

export async function runJurisprudenceSync(options: SyncOptions): Promise<SyncSummary> {
  const { source, repo } = options
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep
  const pauseMs = options.pauseMs ?? 2_000
  const batchSize = options.batchSize ?? 200
  const summary: SyncSummary = {
    provider: source.id,
    status: "success",
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
    files: 0,
    pendingFiles: 0,
    errors: [],
  }
  // Falhas de execução (conjunto, arquivo, gravação) decidem a situação; registros
  // descartados só entram no log (são qualidade do dado, não falha da execução).
  let failures = 0
  const log = (entry: SyncError) => {
    if (summary.errors.length < MAX_LOGGED_ERRORS) summary.errors.push(entry)
  }
  const fail = (entry: SyncError) => {
    failures += 1
    log(entry)
  }

  const runId = await repo.startRun(source.id)
  try {
    const processed = await repo.processedFiles(source.id)

    // 1. O que há de novo em cada conjunto.
    const queues: SourceFile[][] = []
    for (const dataset of source.datasets) {
      let files: SourceFile[]
      try {
        files = await source.listFiles(dataset)
      } catch (error) {
        fail({ dataset, message: describe(error) })
        if (error instanceof JurisprudenceError && error.code === "RATE_LIMIT") {
          summary.stoppedBy = "rate_limit"
          summary.retryAfterMs = error.retryAfterMs
          break
        }
        continue
      }
      const monthly = files.filter((file) => !file.historical)
      const fresh = monthly.filter((file) => !processed.has(file.resourceId))
      const firstTime = !monthly.some((file) => processed.has(file.resourceId))
      // Primeira vez: só os mais recentes. Depois: tudo o que é novo. Mais recentes primeiro.
      queues.push((firstTime ? fresh.slice(-options.initialFiles) : fresh).reverse())
    }
    const queue = roundRobin(queues)
    let failedFiles = 0

    // 2. Arquivo a arquivo.
    for (const [index, file] of queue.entries()) {
      if (summary.stoppedBy) break
      if (summary.files >= options.maxFiles) {
        summary.stoppedBy = "file_limit"
        break
      }
      if (options.deadline !== undefined && now() >= options.deadline) {
        summary.stoppedBy = "time"
        break
      }
      if (index > 0) await sleep(pauseMs)

      let records: unknown[]
      try {
        records = await source.fetchFile(file)
      } catch (error) {
        failedFiles += 1
        fail({ dataset: file.dataset, file: file.name, message: describe(error) })
        if (error instanceof JurisprudenceError && error.code === "RATE_LIMIT") {
          summary.stoppedBy = "rate_limit"
          summary.retryAfterMs = error.retryAfterMs
        }
        continue
      }
      summary.fetched += records.length

      // Normaliza e tira repetidos dentro do próprio arquivo (fica a última versão).
      const unique = new Map<string, NormalizedDecision>()
      let invalidHere = 0
      for (const record of records) {
        const result = source.normalize(record, file)
        if ("skipped" in result) {
          invalidHere += 1
          if (summary.invalid + invalidHere <= 10) log({ dataset: file.dataset, file: file.name, message: `registro descartado — ${result.skipped}` })
          continue
        }
        unique.set(result.external_id, result)
      }
      summary.invalid += invalidHere
      // Repetidos no mesmo arquivo contam como ignorados.
      summary.skipped += records.length - invalidHere - unique.size

      // Grava em lotes: novo → cria; mudou → atualiza; igual → ignora.
      try {
        const rows = [...unique.values()]
        for (let start = 0; start < rows.length; start += batchSize) {
          const batch = rows.slice(start, start + batchSize)
          const existing = await repo.existingHashes(source.id, source.tribunal, batch.map((row) => row.external_id))
          const write: NormalizedDecision[] = []
          for (const row of batch) {
            const hash = existing.get(row.external_id)
            if (hash === undefined) {
              summary.created += 1
              write.push(row)
            } else if (hash !== row.content_hash) {
              summary.updated += 1
              write.push(row)
            } else {
              summary.skipped += 1
            }
          }
          if (write.length) await repo.upsert(write)
        }
        await repo.markFile(source.id, file, records.length)
        summary.files += 1
      } catch (error) {
        // O arquivo não é marcado: a próxima execução tenta de novo (sem duplicar).
        failedFiles += 1
        fail({ dataset: file.dataset, file: file.name, message: `gravação: ${describe(error)}` })
      }
    }
    summary.pendingFiles = Math.max(0, queue.length - summary.files - failedFiles)
    summary.skipped += summary.invalid

    const hadErrors = failures > 0
    summary.status = summary.stoppedBy === "rate_limit" || (hadErrors && summary.files > 0) ? "partial" : hadErrors ? "failed" : "success"
    return summary
  } catch (error) {
    fail({ message: describe(error) })
    summary.status = "failed"
    return summary
  } finally {
    await repo.finishRun(runId, summary).catch((error) => console.error("[jurisprudencia] log da execução não gravado", error))
  }
}
