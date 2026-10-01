import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { monitorHealth, monitorSetup } from "./monitor-status"

const NOW = new Date("2026-09-29T15:00:00Z")
const ready = { enabled: true, cronSecret: true, sourceKey: true }
const none = { missing: false, lastRunAt: null, lastHealthyRunAt: null, resumeAfter: null }

describe("estado do monitoramento", () => {
  it("só é ativo com execução concluída recente — configurado não basta", () => {
    assert.equal(monitorHealth(ready, none, NOW), "waiting")
    assert.equal(monitorHealth(ready, { ...none, lastRunAt: "2026-09-29T14:00:00Z", lastHealthyRunAt: "2026-09-29T14:01:00Z" }, NOW), "active")
    assert.equal(monitorHealth(ready, { ...none, lastRunAt: "2026-09-29T14:00:00Z", lastHealthyRunAt: "2026-09-27T14:01:00Z" }, NOW), "failing")
    assert.equal(monitorHealth(ready, { ...none, lastRunAt: "2026-09-29T14:00:00Z" }, NOW), "failing")
  })

  it("pausa por limite da fonte aparece como pausada, não como ativa", () => {
    assert.equal(monitorHealth(ready, { ...none, lastRunAt: "2026-09-29T14:00:00Z", resumeAfter: "2026-09-29T16:00:00Z" }, NOW), "paused")
  })

  it("desligado ou sem configuração nunca aparece como ativo", () => {
    const healthy = { ...none, lastRunAt: "2026-09-29T14:00:00Z", lastHealthyRunAt: "2026-09-29T14:01:00Z" }
    assert.equal(monitorHealth({ ...ready, enabled: false }, healthy, NOW), "disabled")
    assert.equal(monitorHealth({ ...ready, cronSecret: false }, healthy, NOW), "unconfigured")
    assert.equal(monitorHealth({ ...ready, sourceKey: false }, healthy, NOW), "unconfigured")
    assert.equal(monitorHealth(ready, { ...healthy, missing: true }, NOW), "unconfigured")
  })

  it("segredo curto é tratado como ausente", () => {
    assert.equal(monitorSetup(true, { CRON_SECRET: "curto", DATAJUD_API_KEY: "k" }).cronSecret, false)
    assert.equal(monitorSetup(true, { CRON_SECRET: "x".repeat(32), DATAJUD_API_KEY: "k" }).cronSecret, true)
  })
})
