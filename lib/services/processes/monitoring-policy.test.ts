import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CONFIG_PAUSE_MS,
  FAILURE_BACKOFF_BASE_MS,
  FAILURE_BACKOFF_MAX_MS,
  NOT_FOUND_RETRY_MS,
  OFFICE_TIME_ZONE,
  RATE_LIMIT_PAUSE_MS,
  UNSUPPORTED_RETRY_MS,
  failureBackoffMs,
  isCheckDue,
  monitorConfig,
  nextCheckAfterFailure,
  nextCheckAfterSuccess,
  nextMidnight,
  resumeAfter,
  runStopFor,
  startOfDayIn,
} from "./monitoring-policy"

const HOUR = 3_600_000
// 29/09/2026 é terça; São Paulo = UTC−3 (sem horário de verão).
const at = (iso: string) => new Date(iso)

describe("política do monitoramento", () => {
  it("meia-noite e início do dia no fuso do escritório, com o servidor em UTC", () => {
    // 01:30 UTC = 22:30 de 28/09 em São Paulo: o dia local ainda é 28.
    assert.equal(nextMidnight(at("2026-09-29T01:30:00Z"), OFFICE_TIME_ZONE).toISOString(), "2026-09-29T03:00:00.000Z")
    assert.equal(startOfDayIn(at("2026-09-29T15:00:00Z"), OFFICE_TIME_ZONE).toISOString(), "2026-09-29T03:00:00.000Z")
  })

  it("depois de um sucesso, nunca de novo no mesmo dia nem antes de 12 h", () => {
    // 08:00 local → próxima só à meia-noite (16 h depois).
    assert.equal(nextCheckAfterSuccess(at("2026-09-29T11:00:00Z"), OFFICE_TIME_ZONE).toISOString(), "2026-09-30T03:00:00.000Z")
    // 23:00 local → a meia-noite está perto demais: 12 h depois.
    assert.equal(nextCheckAfterSuccess(at("2026-09-30T02:00:00Z"), OFFICE_TIME_ZONE).toISOString(), "2026-09-30T14:00:00.000Z")
  })

  it("atualização ao abrir o processo usa a mesma regra", () => {
    const checked = at("2026-09-29T11:00:00Z")
    assert.equal(isCheckDue(checked, at("2026-09-29T20:00:00Z"), OFFICE_TIME_ZONE), false)
    assert.equal(isCheckDue(checked, at("2026-09-30T03:00:00Z"), OFFICE_TIME_ZONE), true)
    assert.equal(isCheckDue(undefined, checked, OFFICE_TIME_ZONE), true)
    assert.equal(isCheckDue(new Date("inválida"), checked, OFFICE_TIME_ZONE), true)
  })

  it("backoff exponencial por processo, com teto de 24 h", () => {
    assert.equal(failureBackoffMs(1), FAILURE_BACKOFF_BASE_MS)
    assert.equal(failureBackoffMs(2), 2 * FAILURE_BACKOFF_BASE_MS)
    assert.equal(failureBackoffMs(3), 4 * FAILURE_BACKOFF_BASE_MS)
    assert.equal(failureBackoffMs(20), FAILURE_BACKOFF_MAX_MS)
  })

  it("respeita o Retry-After quando é maior que o backoff", () => {
    const now = at("2026-09-29T12:00:00Z")
    assert.equal(nextCheckAfterFailure("RATE_LIMIT", 1, now).getTime() - now.getTime(), FAILURE_BACKOFF_BASE_MS)
    assert.equal(nextCheckAfterFailure("RATE_LIMIT", 1, now, 3 * HOUR).getTime() - now.getTime(), 3 * HOUR)
    assert.equal(nextCheckAfterFailure("UNAVAILABLE", 2, now).getTime() - now.getTime(), 2 * FAILURE_BACKOFF_BASE_MS)
  })

  it("resultados definitivos esperam mais", () => {
    const now = at("2026-09-29T12:00:00Z")
    assert.equal(nextCheckAfterFailure("NOT_FOUND", 1, now).getTime() - now.getTime(), NOT_FOUND_RETRY_MS)
    assert.equal(nextCheckAfterFailure("UNSUPPORTED_COURT", 1, now).getTime() - now.getTime(), UNSUPPORTED_RETRY_MS)
    assert.equal(nextCheckAfterFailure("AUTHENTICATION", 1, now).getTime() - now.getTime(), CONFIG_PAUSE_MS)
  })

  it("só falhas da fonte inteira param a execução", () => {
    assert.equal(runStopFor("RATE_LIMIT", 0), "rate_limited")
    assert.equal(runStopFor("AUTHENTICATION", 0), "configuration")
    assert.equal(runStopFor("UNAVAILABLE", 1), undefined)
    assert.equal(runStopFor("TIMEOUT", 3), "unavailable")
    assert.equal(runStopFor("NOT_FOUND", 9), undefined)
    const now = at("2026-09-29T12:00:00Z")
    assert.equal(resumeAfter("rate_limited", now).getTime() - now.getTime(), RATE_LIMIT_PAUSE_MS)
    assert.equal(resumeAfter("rate_limited", now, 2 * HOUR).getTime() - now.getTime(), 2 * HOUR)
  })

  it("configuração do ambiente sempre dentro de limites seguros", () => {
    assert.deepEqual(monitorConfig({}), { batchSize: 20, concurrency: 2, pauseMs: 1000, timeBudgetMs: 120_000 })
    const extreme = monitorConfig({ PROCESS_SYNC_BATCH_SIZE: "5000", PROCESS_SYNC_CONCURRENCY: "50", PROCESS_SYNC_PAUSE_MS: "0", PROCESS_SYNC_TIME_BUDGET_MS: "abc" })
    assert.deepEqual(extreme, { batchSize: 100, concurrency: 3, pauseMs: 250, timeBudgetMs: 120_000 })
  })
})
