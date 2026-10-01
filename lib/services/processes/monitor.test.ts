import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"
import { LookupError } from "@/lib/integrations/legal/errors"
import type { ExternalProcess, ProcessProvider } from "@/lib/integrations/legal/types"
import { SYSTEM_ACTOR_ID } from "@/lib/system-actor"
import type { TriageItemInput } from "@/lib/triagem/sources"
import type { Activity, Process } from "@/types"
import { cacheKey, MemoryLookupCache, type CachedLookup, type LookupStore } from "./lookup-cache"
import { createLookupService, FRESH_FOR_MS } from "./lookup-service"
import { runProcessMonitor, type ClaimedProcess, type MonitoringState, type MonitorRepository, type ProcessRow, type RunRecord } from "./monitor"
import { DEFAULT_MONITOR_CONFIG, type MonitorConfig } from "./monitoring-policy"

const CNJ = "00008323520184013202"
const CNJ_B = "00000115020264013202"
const CNJ_C = "00000219420264013202"
const ORG = "org-a"
const OTHER_ORG = "org-b"
const external = mapSearchResponse(trf1Response, CNJ) as ExternalProcess

const quiet = () => {}
// Falhas esperadas nestes testes vão para o console.
const silence = () => {
  const { warn, error, info } = console
  Object.assign(console, { warn: quiet, error: quiet, info: quiet })
  return () => Object.assign(console, { warn, error, info })
}

const process = (id: string, patch: Partial<Process> = {}): Process => ({
  id,
  organizationId: ORG,
  createdAt: "2026-01-01T00:00:00",
  number: "0000832-35.2018.4.01.3202",
  code: `#10300${id.slice(-1)}`,
  clientId: "c1",
  area: "Cível",
  type: "Procedimento comum",
  court: "1ª Vara",
  district: "TRF1",
  opposingParty: "União",
  status: "em_andamento",
  ownerId: "u1",
  claimValue: 0,
  distributedAt: "2018-01-01",
  lastMovementAt: "2018-01-01T00:00:00",
  movements: [],
  cnj: CNJ,
  source: { provider: "datajud" },
  ...patch,
})

let clock: number
let providerCalls: number
let reply: (digits: string) => Promise<ExternalProcess | null>

const provider: ProcessProvider = {
  name: "datajud",
  lookup: async (digits) => {
    providerCalls += 1
    return reply(digits)
  },
}

function memoryStore(): LookupStore {
  const rows = new Map<string, CachedLookup>()
  return { get: async (org, cnj) => rows.get(cacheKey(org, cnj)) ?? null, set: async (org, cnj, entry) => void rows.set(cacheKey(org, cnj), entry) }
}

/** Banco em memória com a mesma regra de versão do Supabase (gravação condicionada). */
function memoryRepo(processes: Process[], options: { pausedUntil?: string | null; claim?: (limit: number) => ClaimedProcess[] } = {}) {
  let version = 0
  const rows = new Map<string, ProcessRow>(processes.map((p) => [`${p.organizationId}:${p.id}`, { organizationId: p.organizationId, id: p.id, data: p, version: `v${version++}` }]))
  const states = new Map<string, MonitoringState>()
  const activities: Activity[] = []
  const triage: TriageItemInput[] = []
  const runs: RunRecord[] = []
  const skipped: RunRecord[] = []
  const released: ClaimedProcess[] = []
  let claims = 0
  let beforeSave: ((row: ProcessRow) => void) | undefined

  const repo: MonitorRepository = {
    pausedUntil: async () => options.pausedUntil ?? null,
    isRunning: async () => false,
    startRun: async () => "run",
    finishRun: async (_id, record) => void runs.push(record),
    recordSkipped: async (record) => void skipped.push(record),
    claim: async (limit) => {
      claims += 1
      if (options.claim) return options.claim(limit)
      // Como o banco: só o que está vencido (ou nunca consultado).
      return [...rows.values()]
        .filter((row) => {
          const state = states.get(`${row.organizationId}:${row.id}`)
          return !state || Date.parse(state.nextCheckAt) <= clock
        })
        .slice(0, limit)
        .map((row) => ({ organizationId: row.organizationId, processId: row.id, cnj: row.data.cnj!, failures: states.get(`${row.organizationId}:${row.id}`)?.consecutiveFailures ?? 0 }))
    },
    loadProcesses: async (keys) => keys.map((k) => rows.get(`${k.organizationId}:${k.processId}`)).filter((row): row is ProcessRow => !!row),
    saveProcess: async (row, data) => {
      beforeSave?.(row)
      const key = `${row.organizationId}:${row.id}`
      const current = rows.get(key)
      if (!current || current.version !== row.version) return { status: "stale", current: current ?? null }
      rows.set(key, { ...current, data, version: `v${version++}` })
      return { status: "saved" }
    },
    insertActivities: async (list) => void activities.push(...list),
    saveTriageItems: async (list) => {
      // Como o banco: a mesma fonte + chave entra uma vez.
      const fresh = list.filter((item) => !triage.some((t) => t.organization_id === item.organization_id && t.source_key === item.source_key))
      triage.push(...fresh)
      return fresh.length
    },
    saveStates: async (list) => list.forEach((state) => states.set(`${state.organizationId}:${state.processId}`, { ...states.get(`${state.organizationId}:${state.processId}`), ...state })),
    release: async (list) => void released.push(...list),
  }

  return {
    repo,
    rows,
    states,
    activities,
    triage,
    runs,
    skipped,
    released,
    claims: () => claims,
    /** Simula outra pessoa gravando o processo entre a leitura e a gravação do worker. */
    onSave(fn: (row: ProcessRow) => void) {
      beforeSave = fn
    },
    /** Edição direta (outra pessoa), trocando a versão. */
    edit(id: string, patch: Partial<Process>, org = ORG) {
      const key = `${org}:${id}`
      const row = rows.get(key)!
      rows.set(key, { ...row, data: { ...row.data, ...patch }, version: `v${version++}` })
    },
  }
}

async function run(repo: MonitorRepository, config: Partial<MonitorConfig> = {}, extra: { disabledReason?: string; store?: LookupStore; memory?: MemoryLookupCache } = {}) {
  const service = createLookupService({ provider, memory: extra.memory ?? new MemoryLookupCache(), now: () => clock, log: quiet })
  const store = extra.store ?? memoryStore()
  const sleeps: number[] = []
  const result = await runProcessMonitor({
    repo,
    config: { ...DEFAULT_MONITOR_CONFIG, ...config },
    disabledReason: extra.disabledReason,
    lookup: (request) => service.lookup({ ...request, store, maxAgeMs: FRESH_FOR_MS }),
    now: () => new Date(clock),
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    log: quiet,
  })
  return Object.assign(result, { sleeps })
}

let restore: () => void
beforeEach(() => {
  clock = Date.parse("2026-09-29T11:00:00Z") // 08:00 em São Paulo
  providerCalls = 0
  reply = async () => external
  restore?.()
  restore = silence()
})

describe("monitoramento automático", () => {
  it("grava só as movimentações novas e registra a atividade em nome da Íntegra", async () => {
    const db = memoryRepo([process("p1")])
    const record = await run(db.repo)

    const saved = db.rows.get(`${ORG}:p1`)!.data
    assert.equal(saved.movements.length, external.movements.length)
    assert.equal(saved.autoSyncedAt, "2026-09-29T08:00:00") // horário do escritório, não do servidor (UTC)
    assert.equal(saved.lastSyncedAt, "2026-09-29T08:00:00")

    assert.equal(db.activities.length, 1)
    const [activity] = db.activities
    assert.equal(activity.actorUserId, SYSTEM_ACTOR_ID)
    assert.equal(activity.type, "movement")
    assert.equal(activity.message, `${external.movements.length} novas movimentações no processo #103001.`)
    assert.equal(activity.organizationId, ORG)

    assert.equal(record.status, "completed")
    assert.equal(record.evaluated, 1)
    assert.equal(record.queried, 1)
    assert.equal(record.updatedProcesses, 1)
    assert.equal(record.newMovements, external.movements.length)

    const state = db.states.get(`${ORG}:p1`)!
    assert.equal(state.lastResult, "updated")
    assert.equal(state.consecutiveFailures, 0)
    // Próxima consulta: só na virada do dia em São Paulo.
    assert.equal(state.nextCheckAt, "2026-09-30T03:00:00.000Z")
  })

  it("movimentações novas que pedem atenção entram na Triagem (uma vez, só as recentes)", async () => {
    const recent = {
      ...external,
      movements: [
        ...external.movements,
        { name: "Julgado procedente o pedido", code: 219, occurredAt: "2026-09-25T14:00:00" },
        { name: "Juntada de Petição", occurredAt: "2026-09-26T10:00:00" },
      ],
    }
    reply = async () => recent
    const db = memoryRepo([process("p1")])
    await run(db.repo)

    assert.equal(db.triage.length, 1)
    const [item] = db.triage
    assert.equal(item.kind, "movimentacao")
    assert.equal(item.source, "datajud")
    assert.equal(item.process_id, "p1")
    assert.equal(item.client_id, "c1")
    assert.equal(item.responsible_id, "u1")
    assert.equal(item.event_date, "2026-09-25")
    assert.equal(item.title, "Julgado procedente o pedido")
    assert.equal(item.state, "pendente")
    assert.equal(item.suggestion, undefined) // movimentação não tem teor: nenhum prazo sugerido
    assert.match(item.source_key, /^p1:/)

    // Mesma ficha de novo (outro dia): nada novo no processo, nada novo na Triagem.
    clock = Date.parse("2026-09-30T11:00:00Z")
    await run(db.repo)
    assert.equal(db.triage.length, 1)
  })

  it("não consulta de novo no mesmo dia e não duplica movimentações", async () => {
    const db = memoryRepo([process("p1")])
    await run(db.repo)
    clock += 6 * 3_600_000 // 14:00: ainda o mesmo dia

    const second = await run(db.repo)
    assert.equal(second.evaluated, 0)
    assert.equal(providerCalls, 1)

    clock = Date.parse("2026-09-30T04:00:00Z") // dia seguinte, 01:00
    const third = await run(db.repo)
    assert.equal(third.evaluated, 1)
    assert.equal(third.newMovements, 0)
    assert.equal(db.rows.get(`${ORG}:p1`)!.data.movements.length, external.movements.length)
    assert.equal(db.activities.length, 1) // sem novidade, sem atividade
    assert.equal(db.states.get(`${ORG}:p1`)!.lastResult, "unchanged")
  })

  it("reaproveita o cache do escritório: consulta recente não vai à fonte", async () => {
    const store = memoryStore()
    await store.set(ORG, CNJ, { found: true, sheet: (await createLookupService({ provider, now: () => clock, log: quiet }).lookup({ organizationId: ORG, cnj: CNJ })).sheet, fetchedAt: clock - 3_600_000 })
    providerCalls = 0

    const db = memoryRepo([process("p1")])
    const record = await run(db.repo, {}, { store })
    assert.equal(providerCalls, 0)
    assert.equal(record.queried, 0)
    assert.equal(record.fromCache, 1)
    // A data real da informação é a do cache (07:00), não a da execução.
    assert.equal(db.rows.get(`${ORG}:p1`)!.data.autoSyncedAt, "2026-09-29T07:00:00")
  })

  it("a falha de um processo não interrompe o lote", async () => {
    reply = async (digits) => {
      if (digits === CNJ_B) throw new LookupError("NOT_FOUND")
      return external
    }
    const db = memoryRepo([process("p2", { cnj: CNJ_B }), process("p1")])
    const record = await run(db.repo)

    assert.equal(record.status, "completed")
    assert.equal(record.errors, 1)
    assert.equal(db.states.get(`${ORG}:p2`)!.lastResult, "not_found")
    assert.equal(db.states.get(`${ORG}:p2`)!.consecutiveFailures, 1)
    assert.equal(db.states.get(`${ORG}:p1`)!.lastResult, "updated")
  })

  it("429 para a execução, respeita o Retry-After e devolve o restante à fila", async () => {
    reply = async () => {
      throw new LookupError("RATE_LIMIT", "HTTP 429", { status: 429, retryAfterMs: 2 * 3_600_000 })
    }
    const db = memoryRepo([process("p1"), process("p2"), process("p3"), process("p4")])
    const record = await run(db.repo, { concurrency: 1 })

    assert.equal(providerCalls, 1, "nenhuma consulta depois do 429")
    assert.equal(record.status, "partial")
    assert.equal(record.rateLimited, 1)
    assert.equal(Date.parse(record.resumeAfter!) - clock, 2 * 3_600_000)
    assert.equal(db.released.length, 3)
    const state = db.states.get(`${ORG}:p1`)!
    assert.equal(state.lastResult, "rate_limited")
    assert.ok(Date.parse(state.nextCheckAt) - clock >= 2 * 3_600_000)
  })

  it("execução pausada por 429 anterior não consulta nada", async () => {
    const db = memoryRepo([process("p1")], { pausedUntil: "2026-09-29T13:00:00.000Z" })
    const record = await run(db.repo)
    assert.equal(record.status, "skipped")
    assert.equal(db.claims(), 0)
    assert.equal(providerCalls, 0)
    assert.equal(db.skipped.length, 1)
  })

  it("503 seguidos: backoff por processo e a execução para", async () => {
    reply = async () => {
      throw new LookupError("UNAVAILABLE", "HTTP 503", { status: 503 })
    }
    const db = memoryRepo([process("p1"), process("p2"), process("p3"), process("p4"), process("p5")])
    const record = await run(db.repo, { concurrency: 1 })

    assert.equal(providerCalls, 3)
    assert.equal(record.unavailable, 3)
    assert.equal(record.status, "partial")
    assert.ok(record.resumeAfter)
    assert.equal(db.released.length, 2)
    const first = db.states.get(`${ORG}:p1`)!
    assert.equal(Date.parse(first.nextCheckAt) - Date.parse(first.lastCheckedAt), 30 * 60_000)
  })

  it("backoff cresce com as falhas seguidas do processo", async () => {
    reply = async () => {
      throw new LookupError("TIMEOUT")
    }
    const db = memoryRepo([process("p1")], { claim: () => [{ organizationId: ORG, processId: "p1", cnj: CNJ, failures: 2 }] })
    await run(db.repo)
    const state = db.states.get(`${ORG}:p1`)!
    assert.equal(state.consecutiveFailures, 3)
    assert.equal(Date.parse(state.nextCheckAt) - clock, 4 * 30 * 60_000)
  })

  it("edição de outra pessoa no meio-tempo é preservada (mescla de novo sobre a versão atual)", async () => {
    const db = memoryRepo([process("p1")])
    let edited = false
    db.onSave(() => {
      if (edited) return
      edited = true
      db.edit("p1", { court: "2ª Vara (editado)" })
    })
    await run(db.repo)

    const saved = db.rows.get(`${ORG}:p1`)!.data
    assert.equal(saved.court, "2ª Vara (editado)")
    assert.equal(saved.movements.length, external.movements.length)
    assert.equal(db.activities.length, 1)
  })

  it("processo excluído durante a consulta: nada é gravado para ele", async () => {
    const db = memoryRepo([process("p1")])
    db.onSave(() => db.rows.delete(`${ORG}:p1`))
    const record = await run(db.repo)
    assert.equal(db.activities.length, 0)
    assert.equal(db.states.size, 0)
    assert.equal(record.status, "completed")
  })

  it("escritórios isolados: cada atividade e estado ficam no escritório do processo", async () => {
    const db = memoryRepo([process("p1"), process("p1", { organizationId: OTHER_ORG })])
    await run(db.repo)
    assert.deepEqual(db.activities.map((a) => a.organizationId).sort(), [ORG, OTHER_ORG])
    assert.equal(db.rows.get(`${OTHER_ORG}:p1`)!.data.organizationId, OTHER_ORG)
    assert.ok(db.states.get(`${OTHER_ORG}:p1`))
  })

  it("desligada pela administração: registra e não consulta", async () => {
    const db = memoryRepo([process("p1")])
    const record = await run(db.repo, {}, { disabledReason: "Consulta desativada." })
    assert.equal(record.status, "skipped")
    assert.equal(db.claims(), 0)
    assert.equal(providerCalls, 0)
  })

  it("pausa entre idas à fonte e tempo esgotado devolve o restante", async () => {
    const db = memoryRepo([process("p1"), process("p2", { cnj: CNJ_B }), process("p3", { cnj: CNJ_C })])
    reply = async () => {
      clock += 40_000 // cada consulta leva 40 s
      return external
    }
    const record = await run(db.repo, { concurrency: 1, timeBudgetMs: 60_000, pauseMs: 1000 })
    assert.equal(record.status, "partial")
    assert.equal(record.queried, 2)
    assert.deepEqual(record.sleeps, [1000, 1000])
    assert.equal(db.released.length, 1)
  })
})
