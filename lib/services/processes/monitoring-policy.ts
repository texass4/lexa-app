/**
 * Política do monitoramento automático de processos — o único lugar com os números
 * que decidem QUANDO um processo pode ser consultado de novo na fonte pública.
 *
 * Princípio: baixo consumo e comportamento previsível. A fonte é atualizada pelos
 * tribunais em lotes; consultar mais de uma vez por dia não traz novidade, só custo.
 *
 * - Sucesso: nunca de novo no mesmo dia (fuso do escritório) e nunca antes de 12 h.
 * - Falha passageira (429, 503, timeout): espera exponencial por processo, a partir
 *   de 30 min e até 24 h — e nunca antes do `Retry-After` que a fonte pediu.
 * - "Não encontrado": 3 dias (pode ser atraso de indexação).
 * - Tribunal sem consulta / número inválido: 30 dias.
 * - 429 interrompe a execução inteira (o limite é da fonte, não do processo) e
 *   pausa as próximas até `Retry-After` (mínimo de 15 min).
 * - 3 falhas de indisponibilidade seguidas na mesma execução: a fonte está fora;
 *   a execução para e as próximas esperam 10 min.
 *
 * Lote e ritmo (por execução): poucos processos, pouca concorrência e uma pausa
 * entre idas à fonte. Os três valores podem ser reduzidos (ou ampliados com
 * cuidado) por variável de ambiente — ver `monitorConfig`.
 *
 * Lógica pura: roda no servidor (worker) e no navegador (atualização ao abrir o
 * processo usa a mesma regra de "já consultado hoje").
 */

import type { LookupErrorCode } from "@/lib/integrations/legal/errors"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Fuso dos escritórios. Define o "mesmo dia" e os horários gravados pelo servidor. */
export const OFFICE_TIME_ZONE = "America/Sao_Paulo"

/** Mínimo entre duas consultas bem-sucedidas do mesmo processo (além da virada do dia). */
export const MIN_SUCCESS_INTERVAL_MS = 12 * HOUR
/** Primeira espera após falha passageira; dobra a cada falha seguida. */
export const FAILURE_BACKOFF_BASE_MS = 30 * MINUTE
export const FAILURE_BACKOFF_MAX_MS = DAY
export const NOT_FOUND_RETRY_MS = 3 * DAY
export const UNSUPPORTED_RETRY_MS = 30 * DAY
/** Registro alterado por outra pessoa durante a sincronização: tenta na próxima execução (o resultado fica no cache). */
export const CONFLICT_RETRY_MS = 5 * MINUTE

/** Pausa de todas as execuções depois de um 429 (se a fonte não pediu mais). */
export const RATE_LIMIT_PAUSE_MS = 15 * MINUTE
/** Falhas de indisponibilidade seguidas que interrompem a execução. */
export const UNAVAILABLE_STREAK_LIMIT = 3
export const UNAVAILABLE_PAUSE_MS = 10 * MINUTE
/** Chave recusada ou ausente: nada funciona até alguém corrigir. */
export const CONFIG_PAUSE_MS = HOUR

/** Por quanto tempo um processo fica reservado para uma execução (se ela cair, volta a ficar disponível). */
export const CLAIM_LEASE_MS = 15 * MINUTE

/** Última consulta mais antiga que isso = o sistema deixou de acompanhar o processo. */
export const MONITORING_STALE_AFTER_DAYS = 7
/** Sem execução concluída neste intervalo, o monitoramento não é mostrado como ativo. */
export const MONITOR_HEALTHY_WITHIN_MS = 26 * HOUR

export interface MonitorConfig {
  /** Processos por execução. */
  batchSize: number
  /** Consultas simultâneas. */
  concurrency: number
  /** Pausa depois de cada grupo que foi à fonte. */
  pauseMs: number
  /** Depois deste tempo, a execução não começa novas consultas. */
  timeBudgetMs: number
}

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = { batchSize: 20, concurrency: 2, pauseMs: 1000, timeBudgetMs: 120_000 }

const bounded = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

/** Configuração da execução a partir do ambiente — sempre dentro de limites seguros. */
export function monitorConfig(env: Record<string, string | undefined> = process.env): MonitorConfig {
  return {
    batchSize: bounded(env.PROCESS_SYNC_BATCH_SIZE, DEFAULT_MONITOR_CONFIG.batchSize, 1, 100),
    concurrency: bounded(env.PROCESS_SYNC_CONCURRENCY, DEFAULT_MONITOR_CONFIG.concurrency, 1, 3),
    pauseMs: bounded(env.PROCESS_SYNC_PAUSE_MS, DEFAULT_MONITOR_CONFIG.pauseMs, 250, 30_000),
    timeBudgetMs: bounded(env.PROCESS_SYNC_TIME_BUDGET_MS, DEFAULT_MONITOR_CONFIG.timeBudgetMs, 10_000, 240_000),
  }
}

/** Deslocamento (ms) do relógio de parede de `timeZone` em relação ao UTC, no instante `at`. */
function zoneOffsetMs(at: Date, timeZone?: string): number {
  if (!timeZone) return -at.getTimezoneOffset() * MINUTE
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)]),
  )
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return wall - Math.floor(at.getTime() / 1000) * 1000
}

/** Meia-noite seguinte em `timeZone` (sem fuso: o do ambiente, como no navegador). */
export function nextMidnight(at: Date, timeZone?: string): Date {
  const offset = zoneOffsetMs(at, timeZone)
  const wall = new Date(at.getTime() + offset)
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1)
  return new Date(midnightWall - offset)
}

/** Início do dia de `at` em `timeZone`. */
export function startOfDayIn(at: Date, timeZone?: string): Date {
  return new Date(nextMidnight(at, timeZone).getTime() - DAY)
}

/** Próxima consulta permitida depois de um sucesso em `checkedAt`. */
export function nextCheckAfterSuccess(checkedAt: Date, timeZone?: string): Date {
  return new Date(Math.max(nextMidnight(checkedAt, timeZone).getTime(), checkedAt.getTime() + MIN_SUCCESS_INTERVAL_MS))
}

/** O que está salvo já venceu? (atualização automática ao abrir o processo). */
export function isCheckDue(lastCheckedAt: Date | undefined, now: Date, timeZone?: string): boolean {
  return !lastCheckedAt || Number.isNaN(lastCheckedAt.getTime()) || now >= nextCheckAfterSuccess(lastCheckedAt, timeZone)
}

/** Espera exponencial pela `failures`-ésima falha seguida (1, 2, 3…). */
export function failureBackoffMs(failures: number): number {
  return Math.min(FAILURE_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1), FAILURE_BACKOFF_MAX_MS)
}

/** Próxima consulta permitida depois de uma falha. `failures` já conta esta falha. */
export function nextCheckAfterFailure(code: LookupErrorCode, failures: number, now: Date, retryAfterMs?: number): Date {
  const wait = (() => {
    switch (code) {
      case "NOT_FOUND":
        return NOT_FOUND_RETRY_MS
      case "UNSUPPORTED_COURT":
      case "INVALID_CNJ":
        return UNSUPPORTED_RETRY_MS
      case "AUTHENTICATION":
      case "NOT_CONFIGURED":
        return CONFIG_PAUSE_MS
      default:
        return failureBackoffMs(failures)
    }
  })()
  return new Date(now.getTime() + Math.max(wait, retryAfterMs ?? 0))
}

/** Falhas que dizem respeito à fonte inteira — não adianta seguir com o lote. */
export type RunStop = "rate_limited" | "unavailable" | "configuration"

export function runStopFor(code: LookupErrorCode, unavailableStreak: number): RunStop | undefined {
  if (code === "RATE_LIMIT") return "rate_limited"
  if (code === "AUTHENTICATION" || code === "NOT_CONFIGURED") return "configuration"
  if ((code === "UNAVAILABLE" || code === "TIMEOUT") && unavailableStreak >= UNAVAILABLE_STREAK_LIMIT) return "unavailable"
  return undefined
}

/** Até quando as próximas execuções esperam depois de uma parada. */
export function resumeAfter(stop: RunStop, now: Date, retryAfterMs?: number): Date {
  const pause = stop === "rate_limited" ? RATE_LIMIT_PAUSE_MS : stop === "unavailable" ? UNAVAILABLE_PAUSE_MS : CONFIG_PAUSE_MS
  return new Date(now.getTime() + Math.max(pause, retryAfterMs ?? 0))
}
