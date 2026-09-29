import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { LookupError } from "@/lib/integrations/legal/errors"
import type { DjenItem, DjenQuery } from "@/lib/integrations/legal/djen/client"
import type { RunRecord } from "@/lib/services/processes/monitor"
import {
  DEFAULT_CAPTURE_CONFIG,
  captureWindow,
  nextDailyCheck,
  runIntimacoesCapture,
  type CaptureRepository,
  type ClaimedOab,
  type IntimacaoRow,
  type OabHolder,
  type OabState,
  type ProcessMatch,
} from "./capture"

const CNJ = "00008323520184013202"
const ORG_A = "org-a"
const ORG_B = "org-b"

const item = (patch: Partial<DjenItem> = {}): DjenItem => ({
  id: 1,
  hash: "abc",
  data_disponibilizacao: "2026-09-28",
  siglaTribunal: "TJSC",
  tipoComunicacao: "Intimação",
  texto: "Fica a parte ré intimada para contestar no prazo de 15 (quinze) dias.",
  numero_processo: CNJ,
  ...patch,
})

const holder = (organizationId: string, userId: string, number = "12345", uf = "SC"): OabHolder => ({
  organizationId,
  oabId: `oab-${organizationId}-${userId}-${number}`,
  userId,
  number,
  uf,
})

function memoryRepo(options: { claimed: ClaimedOab[]; holders: OabHolder[]; processes?: Record<string, ProcessMatch[]>; paused?: string }) {
  const saved = new Map<string, IntimacaoRow>()
  const states: OabState[] = []
  const runs: RunRecord[] = []
  const skipped: RunRecord[] = []
  const released: ClaimedOab[] = []
  let relinked = 0
  const repo: CaptureRepository = {
    pausedUntil: async () => options.paused ?? null,
    isRunning: async () => false,
    startRun: async () => "run",
    finishRun: async (_id, r) => void runs.push(r),
    recordSkipped: async (r) => void skipped.push(r),
    claim: async (limit) => options.claimed.slice(0, limit),
    holders: async () => options.holders,
    matchProcesses: async (org, cnjs) => (options.processes?.[org] ?? []).filter((p) => cnjs.includes(p.cnj)),
    save: async (rows) => {
      let inserted = 0
      let linked = 0
      for (const row of rows) {
        const key = `${row.organization_id}:${row.external_id}`
        const current = saved.get(key)
        if (current) {
          current.oab_ids = [...new Set([...current.oab_ids, ...row.oab_ids])]
          continue
        }
        saved.set(key, row)
        inserted += 1
        if (row.process_id) linked += 1
      }
      return { inserted, linked }
    },
    saveStates: async (list) => void states.push(...list),
    release: async (list) => void released.push(...list),
    relink: async () => relinked,
  }
  return { repo, saved, states, runs, skipped, released, setRelinked: (n: number) => (relinked = n) }
}

let clock: number
let queries: DjenQuery[]

const run = (repo: CaptureRepository, fetchCommunications: (q: DjenQuery) => Promise<DjenItem[]>, extra: { disabledReason?: string } = {}) =>
  runIntimacoesCapture({
    repo,
    config: DEFAULT_CAPTURE_CONFIG,
    disabledReason: extra.disabledReason,
    fetchCommunications: async (q) => {
      queries.push(q)
      return fetchCommunications(q)
    },
    now: () => new Date(clock),
    sleep: async (ms) => void (clock += ms),
    log: () => {},
  })

beforeEach(() => {
  clock = Date.parse("2026-09-29T10:00:00Z") // 07:00 em São Paulo
  queries = []
})

describe("captura de intimações — regras", () => {
  it("janela: primeira vez lê os últimos 7 dias; depois, desde o último dia lido (com 1 de sobra)", () => {
    const now = new Date(clock)
    assert.deepEqual(captureWindow({}, now), { from: "2026-09-22", to: "2026-09-29" })
    assert.deepEqual(captureWindow({ windowEnd: "2026-09-28" }, now), { from: "2026-09-27", to: "2026-09-29" })
  })

  it("próxima consulta: amanhã a partir das 6 h (hora do escritório)", () => {
    assert.equal(nextDailyCheck(new Date(clock)).toISOString(), "2026-09-30T09:00:00.000Z")
  })
})

describe("captura de intimações — execução", () => {
  it("cenário principal: publicada ontem, capturada hoje, processo identificado, prazo sugerido", async () => {
    const db = memoryRepo({
      claimed: [{ number: "12345", uf: "SC", failures: 0 }],
      holders: [holder(ORG_A, "ana")],
      processes: { [ORG_A]: [{ cnj: CNJ, processId: "p1", clientId: "c1", ownerId: "ana" }] },
    })
    const record = await run(db.repo, async () => [item()])

    assert.equal(record.status, "completed")
    assert.equal(record.queried, 1)
    assert.equal(record.newMovements, 1)
    const [row] = [...db.saved.values()]
    assert.equal(row.process_id, "p1")
    assert.equal(row.client_id, "c1")
    assert.equal(row.responsible_id, "ana")
    assert.equal(row.status, "pendente")
    assert.equal(row.published_at, "2026-09-29")
    assert.equal(row.suggestion.fatalDate, "2026-10-21")
    assert.equal(row.content, item().texto) // teor integral, sem alteração
    assert.equal(db.states[0].windowEnd, "2026-09-29")
    assert.equal(db.states[0].nextCheckAt, "2026-09-30T09:00:00.000Z")
  })

  it("processo não cadastrado: vai para a triagem como 'sem processo'", async () => {
    const db = memoryRepo({ claimed: [{ number: "12345", uf: "SC", failures: 0 }], holders: [holder(ORG_A, "ana")] })
    await run(db.repo, async () => [item()])
    assert.equal([...db.saved.values()][0].status, "sem_processo")
  })

  it("mesma OAB em dois escritórios: uma consulta, uma cópia para cada escritório", async () => {
    const db = memoryRepo({
      claimed: [{ number: "12345", uf: "SC", failures: 0 }],
      holders: [holder(ORG_A, "ana"), holder(ORG_B, "caio")],
    })
    await run(db.repo, async () => [item()])
    assert.equal(queries.length, 1)
    assert.deepEqual([...db.saved.keys()].sort(), [`${ORG_A}:1`, `${ORG_B}:1`])
    assert.equal(db.saved.get(`${ORG_B}:1`)!.responsible_id, "caio")
  })

  it("responsável: o dono do processo, se for um dos advogados intimados", async () => {
    const db = memoryRepo({
      claimed: [{ number: "12345", uf: "SC", failures: 0 }],
      holders: [holder(ORG_A, "ana"), holder(ORG_A, "beto")],
      processes: { [ORG_A]: [{ cnj: CNJ, processId: "p1", ownerId: "beto" }] },
    })
    await run(db.repo, async () => [item()])
    const row = [...db.saved.values()][0]
    assert.equal(row.responsible_id, "beto")
    assert.equal(row.oab_ids.length, 2)
  })

  it("dois processos com o mesmo número: não vincula sozinho", async () => {
    const db = memoryRepo({
      claimed: [{ number: "12345", uf: "SC", failures: 0 }],
      holders: [holder(ORG_A, "ana")],
      processes: { [ORG_A]: [{ cnj: CNJ, processId: "p1" }, { cnj: CNJ, processId: "p2" }] },
    })
    await run(db.repo, async () => [item()])
    const row = [...db.saved.values()][0]
    assert.equal(row.process_id, undefined)
    assert.equal(row.status, "revisao")
    assert.match(row.suggestion.reasons[0], /mais de um processo/)
  })

  it("capturar de novo não duplica", async () => {
    const db = memoryRepo({ claimed: [{ number: "12345", uf: "SC", failures: 0 }], holders: [holder(ORG_A, "ana")] })
    await run(db.repo, async () => [item(), item()])
    const second = await run(db.repo, async () => [item()])
    assert.equal(db.saved.size, 1)
    assert.equal(second.newMovements, 0)
  })

  it("comunicação cancelada na fonte fica de fora", async () => {
    const db = memoryRepo({ claimed: [{ number: "12345", uf: "SC", failures: 0 }], holders: [holder(ORG_A, "ana")] })
    await run(db.repo, async () => [item({ ativo: false })])
    assert.equal(db.saved.size, 0)
  })

  it("falha de uma OAB não interrompe as outras", async () => {
    const db = memoryRepo({
      claimed: [
        { number: "1", uf: "SC", failures: 0 },
        { number: "12345", uf: "SC", failures: 0 },
      ],
      holders: [holder(ORG_A, "ana")],
    })
    const record = await run(db.repo, async (q) => {
      if (q.numeroOab === "1") throw new LookupError("TIMEOUT")
      return [item()]
    })
    assert.equal(record.errors, 1)
    assert.equal(record.newMovements, 1)
    assert.equal(db.states.find((s) => s.number === "1")!.lastResult, "unavailable")
  })

  it("429 para a execução, pausa pelo tempo pedido e devolve o restante", async () => {
    const db = memoryRepo({
      claimed: [
        { number: "1", uf: "SC", failures: 0 },
        { number: "2", uf: "SC", failures: 0 },
      ],
      holders: [],
    })
    const record = await run(db.repo, async () => {
      throw new LookupError("RATE_LIMIT", "HTTP 429", { status: 429, retryAfterMs: 60_000 })
    })
    assert.equal(queries.length, 1)
    assert.equal(record.status, "partial")
    assert.equal(record.rateLimited, 1)
    assert.ok(record.resumeAfter)
    assert.equal(db.released.length, 1)
    // A janela não avança: nada se perde.
    assert.equal(db.states[0].windowEnd, undefined)
  })

  it("desligada pela administração: não consulta", async () => {
    const db = memoryRepo({ claimed: [{ number: "12345", uf: "SC", failures: 0 }], holders: [holder(ORG_A, "ana")] })
    const record = await run(db.repo, async () => [item()], { disabledReason: "desativada" })
    assert.equal(record.status, "skipped")
    assert.equal(queries.length, 0)
  })

  it("revincula as 'sem processo' cujo número foi cadastrado depois", async () => {
    const db = memoryRepo({ claimed: [], holders: [] })
    db.setRelinked(2)
    const record = await run(db.repo, async () => [])
    assert.equal(record.updatedProcesses, 2)
  })
})
