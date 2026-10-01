import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"
import { LookupError, publicLookupError } from "@/lib/integrations/legal/errors"
import type { ExternalProcess, ProcessProvider } from "@/lib/integrations/legal/types"
import { cacheKey, MemoryLookupCache, type CachedLookup, type LookupStore } from "./lookup-cache"
import { createLookupService, FRESH_FOR_MS, NOT_FOUND_FOR_MS } from "./lookup-service"

const CNJ = "00008323520184013202"
const FORMATTED = "0000832-35.2018.4.01.3202"
const ORG_A = "org-a"
const ORG_B = "org-b"

const external = mapSearchResponse(trf1Response, CNJ) as ExternalProcess

let clock = 0
let calls = 0
let reply: () => Promise<ExternalProcess | null>

const provider: ProcessProvider = {
  name: "datajud",
  lookup: async () => {
    calls += 1
    return reply()
  },
}

const quiet = () => {}
const service = (memory = new MemoryLookupCache()) => createLookupService({ provider, memory, now: () => clock, log: quiet })

/** Store em memória, com a mesma chave (escritório + CNJ) da tabela real. */
function memoryStore(): LookupStore & { rows: Map<string, CachedLookup> } {
  const rows = new Map<string, CachedLookup>()
  return {
    rows,
    get: async (org, cnj) => rows.get(cacheKey(org, cnj)) ?? null,
    set: async (org, cnj, entry) => void rows.set(cacheKey(org, cnj), entry),
  }
}

// O serviço registra falhas no console (esperado nestes testes).
const silence = () => {
  const { warn, error } = console
  console.warn = quiet
  console.error = quiet
  return () => Object.assign(console, { warn, error })
}

beforeEach(() => {
  clock = 1_000_000
  calls = 0
  reply = async () => external
})

describe("serviço de consulta de processos", () => {
  it("normaliza a resposta para o modelo interno da Íntegra", async () => {
    const result = await service().lookup({ organizationId: ORG_A, cnj: FORMATTED })
    assert.equal(result.sheet.number, FORMATTED)
    assert.equal(result.sheet.tribunal, "TRF1")
    assert.equal(result.cached, false)
    assert.ok(!("_source" in result.sheet) && !("hits" in result.sheet))
  })

  it("responde do cache enquanto a consulta é recente", async () => {
    const lookup = service()
    await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    clock += FRESH_FOR_MS - 1
    const again = await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    assert.equal(again.cached, true)
    assert.equal(calls, 1)
  })

  it("consulta de novo quando o cache venceu", async () => {
    const lookup = service()
    await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    clock += FRESH_FOR_MS + 1
    const again = await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    assert.equal(again.cached, false)
    assert.equal(calls, 2)
  })

  it("stale-while-revalidate: entrega o vencido na hora e atualiza em segundo plano", async () => {
    const lookup = service()
    await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    clock += FRESH_FOR_MS + 1

    const deferred: Promise<unknown>[] = []
    const stale = await lookup.lookup({ organizationId: ORG_A, cnj: CNJ, staleWhileRevalidate: true, defer: (task) => deferred.push(task) })
    assert.equal(stale.cached, true)
    assert.equal(stale.revalidating, true)
    assert.equal(deferred.length, 1)

    await Promise.all(deferred)
    assert.equal(calls, 2)
    const fresh = await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    assert.equal(fresh.cached, true)
    assert.equal(fresh.revalidating, false)
    assert.equal(fresh.checkedAt, new Date(clock).toISOString())
  })

  it("consultas simultâneas do mesmo processo viram uma só chamada à fonte", async () => {
    let release!: () => void
    reply = () => new Promise((resolve) => (release = () => resolve(external)))
    const lookup = service()
    const pending = Promise.all([1, 2, 3].map(() => lookup.lookup({ organizationId: ORG_A, cnj: CNJ })))
    await new Promise((resolve) => setImmediate(resolve))
    release()
    const results = await pending
    assert.equal(calls, 1)
    assert.ok(results.every((r) => r.sheet.cnj === CNJ))
  })

  it("isola o cache por escritório", async () => {
    const store = memoryStore()
    const lookup = service()
    await lookup.lookup({ organizationId: ORG_A, cnj: CNJ, store })
    const other = await lookup.lookup({ organizationId: ORG_B, cnj: CNJ, store })
    assert.equal(other.cached, false, "o escritório B não pode receber o cache do A")
    assert.equal(calls, 2)
    assert.deepEqual([...store.rows.keys()].sort(), [cacheKey(ORG_A, CNJ), cacheKey(ORG_B, CNJ)])
  })

  it("usa o cache persistente quando a memória está vazia (outro servidor, reinício)", async () => {
    const store = memoryStore()
    await service().lookup({ organizationId: ORG_A, cnj: CNJ, store })
    const restarted = service(new MemoryLookupCache())
    const result = await restarted.lookup({ organizationId: ORG_A, cnj: CNJ, store })
    assert.equal(result.cached, true)
    assert.equal(calls, 1)
  })

  it("falha do cache persistente não impede a consulta", async () => {
    const restore = silence()
    try {
      const broken: LookupStore = {
        get: async () => Promise.reject(new Error("banco fora")),
        set: async () => Promise.reject(new Error("banco fora")),
      }
      const result = await service().lookup({ organizationId: ORG_A, cnj: CNJ, store: broken })
      assert.equal(result.sheet.cnj, CNJ)
    } finally {
      restore()
    }
  })

  it("'não encontrado' fica em cache por pouco tempo e não vai para o banco", async () => {
    reply = async () => null
    const store = memoryStore()
    const lookup = service()
    await assert.rejects(lookup.lookup({ organizationId: ORG_A, cnj: CNJ, store }), (e: unknown) => (e as LookupError).code === "NOT_FOUND")
    await assert.rejects(lookup.lookup({ organizationId: ORG_A, cnj: CNJ, store }))
    assert.equal(calls, 1)
    assert.equal(store.rows.size, 0)
    clock += NOT_FOUND_FOR_MS + 1
    await assert.rejects(lookup.lookup({ organizationId: ORG_A, cnj: CNJ, store }))
    assert.equal(calls, 2)
  })

  it("maxAgeMs curto força ir à fonte (botão Atualizar)", async () => {
    const lookup = service()
    await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
    clock += 61_000
    const forced = await lookup.lookup({ organizationId: ORG_A, cnj: CNJ, maxAgeMs: 60_000 })
    assert.equal(forced.cached, false)
    assert.equal(calls, 2)
  })

  it("rejeita número inválido sem chamar a fonte", async () => {
    await assert.rejects(
      service().lookup({ organizationId: ORG_A, cnj: "0000832-36.2018.4.01.3202" }),
      (e: unknown) => (e as LookupError).code === "INVALID_CNJ",
    )
    await assert.rejects(service().lookup({ organizationId: ORG_A, cnj: "123" }))
    assert.equal(calls, 0)
  })

  it("erro da fonte sai como LookupError e libera nova tentativa", async () => {
    const restore = silence()
    try {
      reply = async () => {
        throw new LookupError("RATE_LIMIT", "HTTP 429")
      }
      const lookup = service()
      await assert.rejects(lookup.lookup({ organizationId: ORG_A, cnj: CNJ }), (e: unknown) => (e as LookupError).code === "RATE_LIMIT")
      reply = async () => external
      const ok = await lookup.lookup({ organizationId: ORG_A, cnj: CNJ })
      assert.equal(ok.sheet.cnj, CNJ)
      assert.equal(calls, 2)
    } finally {
      restore()
    }
  })

  it("exceção inesperada vira LookupError UNEXPECTED", async () => {
    const restore = silence()
    try {
      reply = async () => {
        throw new TypeError("boom")
      }
      await assert.rejects(service().lookup({ organizationId: ORG_A, cnj: CNJ }), (e: unknown) => e instanceof LookupError && e.code === "UNEXPECTED")
    } finally {
      restore()
    }
  })
})

describe("erros para a interface", () => {
  const technical = /datajud|http|429|timeout|api|python|endpoint|shard|json|stack/i

  it("nunca expõem detalhe técnico", () => {
    const errors = [
      new LookupError("RATE_LIMIT", "HTTP 429 do DataJud"),
      new LookupError("TIMEOUT", "sem resposta em 35000 ms"),
      new LookupError("AUTHENTICATION", "HTTP 401"),
      new LookupError("NOT_CONFIGURED", "DATAJUD_API_KEY não configurada"),
      new LookupError("UNAVAILABLE", "resposta parcial (shards falhos)"),
      new LookupError("NOT_FOUND"),
      new LookupError("INVALID_CNJ"),
      new LookupError("UNSUPPORTED_COURT"),
      new TypeError("Cannot read properties of undefined"),
      "qualquer coisa",
    ]
    for (const error of errors) {
      const shown = publicLookupError(error)
      assert.doesNotMatch(shown.message, technical, shown.message)
      assert.ok(["invalid", "not_found", "unsupported", "unavailable"].includes(shown.reason))
    }
  })

  it("falhas técnicas viram o mesmo motivo genérico", () => {
    for (const code of ["RATE_LIMIT", "TIMEOUT", "AUTHENTICATION", "NOT_CONFIGURED", "UNAVAILABLE", "UNEXPECTED"] as const) {
      assert.equal(publicLookupError(new LookupError(code)).reason, "unavailable")
    }
    assert.equal(publicLookupError(new LookupError("NOT_FOUND")).status, 404)
  })
})
