import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LookupError } from "../errors"
import { createDataJudClient, isIncompleteMiss, parseRetryAfter } from "./client"
import { emptyResponse, trf1Response } from "./__fixtures__/responses"

const CNJ = "00008323520184013202"

type Reply = Response | Error | ((elapsedMs: number) => Response | Error)

/** Relógio falso: `sleep` e respostas lentas avançam o tempo sem esperar de verdade. */
function harness(replies: Reply[], options: { attemptTimeoutMs?: number; deadlineMs?: number; latencyMs?: number[] } = {}) {
  let clock = 0
  const waits: number[] = []
  const calls: RequestInit[] = []
  const client = createDataJudClient({
    apiKey: "chave-de-teste",
    attemptTimeoutMs: options.attemptTimeoutMs,
    deadlineMs: options.deadlineMs,
    now: () => clock,
    random: () => 0,
    sleep: async (ms) => {
      waits.push(ms)
      clock += ms
    },
    fetch: (async (_url: string, init: RequestInit) => {
      calls.push(init)
      clock += options.latencyMs?.[calls.length - 1] ?? 10
      const reply = replies[calls.length - 1] ?? replies[replies.length - 1]
      const value = typeof reply === "function" ? reply(clock) : reply
      if (value instanceof Error) throw value
      return value
    }) as typeof fetch,
  })
  return { client, waits, calls, elapsed: () => clock }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

const partial = { timed_out: false, _shards: { total: 5, successful: 3, failed: 2 }, hits: { total: { value: 1 }, hits: [] } }

const timeoutError = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof LookupError && error.code === code)
}

describe("cliente HTTP da consulta", () => {
  it("envia a chave só no cabeçalho de autorização", async () => {
    const { client, calls } = harness([json(trf1Response)])
    await client.searchByNumber(CNJ, "api_publica_trf1")
    const headers = calls[0].headers as Record<string, string>
    assert.equal(headers.Authorization, "APIKey chave-de-teste")
    assert.ok(!String(calls[0].body).includes("chave-de-teste"))
  })

  it("devolve a resposta na primeira tentativa bem-sucedida", async () => {
    const { client, calls } = harness([json(trf1Response)])
    const data = await client.searchByNumber(CNJ, "api_publica_trf1")
    assert.equal(data.hits?.hits?.length, 1)
    assert.equal(calls.length, 1)
  })

  it("resposta vazia e completa é conclusiva: não tenta de novo", async () => {
    const { client, calls } = harness([json(emptyResponse)])
    const data = await client.searchByNumber(CNJ, "api_publica_trf1")
    assert.equal(data.hits?.hits?.length, 0)
    assert.equal(calls.length, 1)
  })

  it("resposta parcial (shards falhos) é passageira: tenta de novo", async () => {
    const { client, calls } = harness([json(partial), json(trf1Response)])
    const data = await client.searchByNumber(CNJ, "api_publica_trf1")
    assert.equal(data.hits?.hits?.length, 1)
    assert.equal(calls.length, 2)
  })

  it("respeita o Retry-After do 429, com teto", async () => {
    const { client, waits } = harness([json({}, 429, { "retry-after": "3" }), json(trf1Response)])
    await client.searchByNumber(CNJ, "api_publica_trf1")
    assert.equal(Math.floor(waits[0]), 3000)

    const capped = harness([json({}, 429, { "retry-after": "120" }), json(trf1Response)])
    await capped.client.searchByNumber(CNJ, "api_publica_trf1")
    assert.ok(capped.waits[0] <= 8_250)
  })

  it("faz no máximo 3 tentativas e desiste com o último erro", async () => {
    const { client, calls } = harness([json({}, 503)])
    await rejectsWith(client.searchByNumber(CNJ, "api_publica_trf1"), "UNAVAILABLE")
    assert.equal(calls.length, 3)
  })

  it("429 persistente vira RATE_LIMIT", async () => {
    const { client } = harness([json({}, 429)])
    await rejectsWith(client.searchByNumber(CNJ, "api_publica_trf1"), "RATE_LIMIT")
  })

  it("chave recusada não é repetida", async () => {
    const { client, calls } = harness([json({}, 401)])
    await rejectsWith(client.searchByNumber(CNJ, "api_publica_trf1"), "AUTHENTICATION")
    assert.equal(calls.length, 1)
  })

  it("erro 4xx comum não é repetido", async () => {
    const { client, calls } = harness([json({ error: "index_not_found" }, 404)])
    await rejectsWith(client.searchByNumber(CNJ, "api_publica_trf1"), "UNAVAILABLE")
    assert.equal(calls.length, 1)
  })

  it("timeout por tentativa vira TIMEOUT e respeita o prazo total", async () => {
    // Cada tentativa "demora" o tempo máximo e estoura.
    const { client, calls, elapsed } = harness([timeoutError()], {
      attemptTimeoutMs: 20_000,
      deadlineMs: 30_000,
      latencyMs: [20_000, 20_000, 20_000],
    })
    await rejectsWith(client.searchByNumber(CNJ, "api_publica_trf1"), "TIMEOUT")
    assert.equal(calls.length, 2)
    assert.ok(elapsed() <= 45_000, `levou ${elapsed()} ms`)
  })

  it("falha de conexão é passageira", async () => {
    const { client, calls } = harness([new TypeError("fetch failed"), json(trf1Response)])
    await client.searchByNumber(CNJ, "api_publica_trf1")
    assert.equal(calls.length, 2)
  })
})

describe("helpers do cliente", () => {
  it("interpreta Retry-After em segundos e em data HTTP", () => {
    assert.equal(parseRetryAfter("2"), 2000)
    assert.equal(parseRetryAfter(null), undefined)
    assert.equal(parseRetryAfter("amanhã"), undefined)
    const now = Date.parse("2026-09-28T12:00:00Z")
    assert.equal(parseRetryAfter("Mon, 28 Sep 2026 12:00:05 GMT", now), 5000)
  })

  it("só considera inconclusivo o vazio com shards falhos ou timed_out", () => {
    assert.equal(isIncompleteMiss(emptyResponse), false)
    assert.equal(isIncompleteMiss(partial), true)
    assert.equal(isIncompleteMiss({ timed_out: true, hits: { hits: [] } }), true)
    assert.equal(isIncompleteMiss(trf1Response), false)
  })
})
