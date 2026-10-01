import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_AI_LIGHT_MODEL, DEFAULT_AI_MODEL, describeAIModels, getAIConfig, getAIStatus } from "./config"
import { AIError } from "./errors"
import { GeminiProvider, type GeminiClientLike, type GeminiResponseLike } from "./gemini"
import { InFlight, MemoryAICache } from "./guard"
import { meteredCall } from "./metering"
import { estimateCost, priceOf, priceTable } from "./pricing"
import { fakeProvider, memoryMeter } from "./__fixtures__/data"
import { groundingWarnings, keepKnownNotes, keepKnownRefs, stripUnknownRefs } from "./grounding"
import { readChatInput, readId } from "./input"
import { SchemaError } from "./schema"
import { processSummarySchema } from "./schemas"
import { maskSensitiveText, sanitizeAIContext } from "./context/sanitize"
import { validSummary } from "./__fixtures__/data"
import type { AISources } from "./types"

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return (error as AIError).code
  }
  return "ok"
}

describe("configuração da IA", () => {
  it("sem GEMINI_API_KEY não configura (e não inventa resposta)", () => {
    assert.equal(
      code(() => getAIConfig({})),
      "NOT_CONFIGURED",
    )
    assert.equal(
      code(() => getAIConfig({ GEMINI_API_KEY: "   " })),
      "NOT_CONFIGURED",
    )
    assert.deepEqual(getAIStatus({}), { enabled: true, configured: false })
  })

  it("AI_ENABLED=false desliga mesmo com chave", () => {
    assert.equal(
      code(() => getAIConfig({ AI_ENABLED: "false", GEMINI_API_KEY: "k" })),
      "DISABLED",
    )
    assert.deepEqual(getAIStatus({ AI_ENABLED: "false", GEMINI_API_KEY: "k" }), { enabled: false, configured: true })
  })

  it("modelo por ambiente: AI_MODEL (ou o nome antigo GEMINI_MODEL) e AI_MODEL_LIGHT", () => {
    const defaults = getAIConfig({ GEMINI_API_KEY: "k" })
    assert.deepEqual([defaults.model, defaults.lightModel], [DEFAULT_AI_MODEL, DEFAULT_AI_LIGHT_MODEL])
    assert.equal(getAIConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-flash-latest" }).model, "gemini-flash-latest")
    assert.equal(getAIConfig({ GEMINI_API_KEY: "k", AI_MODEL: "gemini-x", GEMINI_MODEL: "velho" }).model, "gemini-x")
    assert.equal(getAIConfig({ GEMINI_API_KEY: "k", AI_MODEL: "gemini-x", AI_MODEL_LIGHT: "off" }).lightModel, "gemini-x")
    assert.equal(
      code(() => getAIConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "x; rm -rf" })),
      "NOT_CONFIGURED",
    )
    assert.equal(
      code(() => getAIConfig({ GEMINI_API_KEY: "k", AI_MODEL_LIGHT: "a b" })),
      "NOT_CONFIGURED",
    )
    // A descrição para as telas nunca inclui a chave.
    assert.doesNotMatch(JSON.stringify(describeAIModels({ GEMINI_API_KEY: "segredo" })), /segredo/)
  })
})

function gemini(reply: GeminiResponseLike | Error) {
  const calls: Parameters<GeminiClientLike["models"]["generateContent"]>[0][] = []
  const client: GeminiClientLike = {
    models: {
      async generateContent(params) {
        calls.push(params)
        if (reply instanceof Error) throw reply
        return reply
      },
    },
  }
  return { provider: new GeminiProvider({ apiKey: "k", model: "gemini-test", timeoutMs: 5_000, client, retryDelayMs: 0 }), calls }
}

const apiError = (status: number, message = "erro") => Object.assign(new Error(message), { status })
const request = { system: "sistema", messages: [{ role: "user" as const, content: "oi" }] }
const rejects = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return (error as AIError).code
  }
  return "ok"
}

describe("GeminiProvider", () => {
  it("resposta JSON válida: envia schema, temperatura baixa e instrução de sistema", async () => {
    const { provider, calls } = gemini({ text: '{"a":1}', candidates: [{ finishReason: "STOP" }] })
    const result = await provider.generateJSON({ ...request, schema: { type: "object" } })
    assert.deepEqual(result.value, { a: 1 })
    const config = calls[0].config!
    assert.equal(config.responseMimeType, "application/json")
    assert.deepEqual(config.responseJsonSchema, { type: "object" })
    assert.equal(config.systemInstruction, "sistema")
    assert.ok((config.temperature ?? 1) <= 0.3)
  })

  it("limita o raciocínio do Gemini 2.5 Flash (custo) e deixa os demais no padrão", async () => {
    const calls: { config?: { thinkingConfig?: unknown } }[] = []
    const client: GeminiClientLike = { models: { generateContent: async (params) => (calls.push(params), { text: "ok" }) } }
    await new GeminiProvider({ apiKey: "k", model: "gemini-2.5-flash", timeoutMs: 5_000, client }).generateText(request)
    await new GeminiProvider({ apiKey: "k", model: "gemini-flash-latest", timeoutMs: 5_000, client }).generateText(request)
    assert.deepEqual(calls[0].config?.thinkingConfig, { thinkingBudget: 1024 })
    assert.equal(calls[1].config?.thinkingConfig, undefined)
  })

  it("operação simples usa o modelo leve (sem raciocínio); se ele falhar, o principal responde", async () => {
    const calls: { model: string; config?: { thinkingConfig?: unknown } }[] = []
    let first = true
    const client: GeminiClientLike = {
      models: {
        generateContent: async (params) => {
          calls.push(params as { model: string })
          if (first) {
            first = false
            throw apiError(503)
          }
          return {
            text: "ok",
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 5, cachedContentTokenCount: 60 },
          }
        },
      },
    }
    const provider = new GeminiProvider({
      apiKey: "k",
      model: "gemini-2.5-flash",
      lightModel: "gemini-2.5-flash-lite",
      timeoutMs: 5_000,
      client,
      retryDelayMs: 0,
    })
    const result = await provider.generateText({ ...request, tier: "light" })
    assert.deepEqual(
      calls.map((c) => c.model),
      ["gemini-2.5-flash-lite", "gemini-2.5-flash"],
    )
    assert.equal(calls[0].config?.thinkingConfig, undefined)
    // Raciocínio conta como saída; o que veio do cache do provedor fica separado.
    assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 15, cachedTokens: 60, model: "gemini-2.5-flash" })
  })

  it("mapeia o papel do assistente para 'model'", async () => {
    const { provider, calls } = gemini({ text: "ok" })
    await provider.generateText({
      system: "s",
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
    })
    assert.deepEqual(
      (calls[0].contents as { role: string }[]).map((c) => c.role),
      ["user", "model", "user"],
    )
  })

  it("resposta vazia → EMPTY_RESPONSE", async () => {
    assert.equal(await rejects(gemini({ text: "" }).provider.generateText(request)), "EMPTY_RESPONSE")
  })

  it("JSON inválido ou cortado → INVALID_RESPONSE", async () => {
    assert.equal(await rejects(gemini({ text: "não é json" }).provider.generateJSON({ ...request, schema: {} })), "INVALID_RESPONSE")
    assert.equal(
      await rejects(gemini({ text: '{"a":', candidates: [{ finishReason: "MAX_TOKENS" }] }).provider.generateJSON({ ...request, schema: {} })),
      "INVALID_RESPONSE",
    )
  })

  it("pedido bloqueado → BLOCKED", async () => {
    assert.equal(await rejects(gemini({ promptFeedback: { blockReason: "SAFETY" } }).provider.generateText(request)), "BLOCKED")
  })

  it("erros da API viram códigos da Íntegra, sem vazar a mensagem original", async () => {
    const cases: [number, string][] = [
      [429, "PROVIDER_RATE_LIMITED"],
      [401, "INVALID_API_KEY"],
      [403, "INVALID_API_KEY"],
      [404, "MODEL_UNAVAILABLE"],
      [500, "UNAVAILABLE"],
      [503, "UNAVAILABLE"],
      [504, "TIMEOUT"],
    ]
    for (const [status, expected] of cases) {
      const failure = await gemini(apiError(status, "detalhe interno com API key xyz"))
        .provider.generateText(request)
        .catch((e: AIError) => e)
      assert.equal((failure as AIError).code, expected, `status ${status}`)
      assert.doesNotMatch((failure as AIError).userMessage, /xyz|detalhe interno/)
    }
    assert.equal(await rejects(gemini(apiError(400, "API key not valid")).provider.generateText(request)), "INVALID_API_KEY")
    const missingModel = (await gemini(apiError(404))
      .provider.generateText(request)
      .catch((e: AIError) => e)) as AIError
    assert.equal(missingModel.providerStatus, 404)
  })

  it("modelo sobrecarregado (503) ou sem cota (429) → tenta o reserva e informa quem respondeu", async () => {
    for (const status of [503, 429, 404]) {
      const models: string[] = []
      const client: GeminiClientLike = {
        models: {
          async generateContent(params) {
            models.push(params.model)
            if (params.model === "principal") throw apiError(status)
            return { text: "ok" }
          },
        },
      }
      const provider = new GeminiProvider({ apiKey: "k", model: "principal", fallbackModels: ["reserva"], timeoutMs: 5_000, client })
      const result = await provider.generateText(request)
      assert.deepEqual(models, ["principal", "reserva"], `status ${status}`)
      assert.equal(result.usage?.model, "reserva")
    }
  })

  it("sem reserva, repete o principal uma vez em 503; erro de pedido (400) não é repetido", async () => {
    let calls = 0
    const flaky: GeminiClientLike = {
      models: {
        async generateContent() {
          calls += 1
          if (calls === 1) throw apiError(503)
          return { text: "ok" }
        },
      },
    }
    const ok = await new GeminiProvider({ apiKey: "k", model: "m", timeoutMs: 5_000, client: flaky, retryDelayMs: 0 }).generateText(request)
    assert.equal(ok.value, "ok")
    assert.equal(calls, 2)

    const { provider, calls: bad } = gemini(apiError(400, "campo inválido"))
    assert.equal(await rejects(provider.generateText(request)), "BAD_REQUEST")
    assert.equal(bad.length, 1)
  })

  it("todos os modelos sobrecarregados → UNAVAILABLE com o status do provedor", async () => {
    const { provider, calls } = gemini(apiError(503))
    const failure = (await provider.generateText(request).catch((e: AIError) => e)) as AIError
    assert.equal(failure.code, "UNAVAILABLE")
    assert.equal(failure.providerStatus, 503)
    assert.equal(calls.length, 2)
  })

  it("lê GEMINI_FALLBACK_MODEL (lista, sem repetir o principal)", () => {
    const config = getAIConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "flash-a", GEMINI_FALLBACK_MODEL: "flash-b, flash-a, flash-c,flash-b" })
    assert.deepEqual(config.fallbackModels, ["flash-b", "flash-c"])
    assert.deepEqual(getAIConfig({ GEMINI_API_KEY: "k" }).fallbackModels, [])
  })

  it("cancelamento pelo usuário → CANCELLED", async () => {
    const controller = new AbortController()
    controller.abort()
    const { provider } = gemini(Object.assign(new Error("aborted"), { name: "AbortError" }))
    assert.equal(await rejects(provider.generateText({ ...request, signal: controller.signal })), "CANCELLED")
  })
})

describe("custo, medição e cache", () => {
  it("custo estimado por modelo, com desconto do cache do provedor", () => {
    assert.equal(estimateCost("gemini-2.5-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 2.8)
    assert.equal(estimateCost("gemini-2.5-flash-lite", { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 1_000_000 }), 0.01)
    assert.equal(estimateCost("gemini-2.5-flash-preview-09-2025", { inputTokens: 1000, outputTokens: 0 }), 0.0003)
    assert.equal(estimateCost("modelo-sem-preco", { inputTokens: 10, outputTokens: 10 }), null)
    assert.equal(estimateCost("gemini-2.5-flash", {}), null)
  })

  it("AI_PRICES sobrepõe a tabela sem mexer no código", () => {
    const table = priceTable({ AI_PRICES: '{"gemini-3-flash":{"input":0.5,"output":3},"ruim":{"input":"x"}}' })
    assert.deepEqual(priceOf("gemini-3-flash", table), { input: 0.5, output: 3 })
    assert.equal(priceOf("ruim", table), undefined)
    assert.ok(priceOf("gemini-2.5-flash", priceTable({ AI_PRICES: "{quebrado" })))
  })

  it("toda chamada ao modelo é reservada e registrada: modelo, tokens, custo, sucesso ou erro", async () => {
    const { meter, events } = memoryMeter()
    const { provider } = fakeProvider(() => ({ ok: true }))
    const context = { organizationId: "org", userId: "u1", operation: "process.summary" }
    await meteredCall(meter, provider, context, "standard", () => provider.generateJSON({ ...request, schema: {} }))
    await assert.rejects(meteredCall(meter, provider, context, "light", async () => Promise.reject(new AIError("TIMEOUT"))))
    assert.deepEqual(
      events.map((e) => [e.status, e.model, e.outcome?.errorCode]),
      [
        ["ok", "fake-flash", undefined],
        ["erro", "fake-flash-lite", "TIMEOUT"],
      ],
    )
    assert.deepEqual(events[0].outcome?.usage, { inputTokens: 10, outputTokens: 5, model: "fake-flash" })
  })

  it("limite do plano: recusa antes de chamar o modelo", async () => {
    const { meter } = memoryMeter({ monthlyLimit: 1 })
    const { provider, calls } = fakeProvider(() => ({}))
    const context = { organizationId: "org", userId: null, operation: "triage.interpret" }
    await meteredCall(meter, provider, context, "light", () => provider.generateJSON({ ...request, schema: {} }))
    await assert.rejects(
      meteredCall(meter, provider, context, "light", () => provider.generateJSON({ ...request, schema: {} })),
      (error: AIError) => {
        assert.equal(error.code, "PLAN_LIMIT")
        assert.equal(error.status, 429)
        return true
      },
    )
    assert.equal(calls.length, 1)
  })

  it("pedidos iguais ao mesmo tempo viram uma chamada; falha não fica guardada", async () => {
    const inFlight = new InFlight<number>()
    let produced = 0
    const produce = async () => ++produced
    const [a, b] = await Promise.all([inFlight.run("k", produce), inFlight.run("k", produce)])
    assert.deepEqual([a, b, produced], [1, 1, 1])
    await assert.rejects(inFlight.run("x", async () => Promise.reject(new Error("x"))))
    assert.equal(await inFlight.run("x", async () => 7), 7)
  })

  it("cache expira", async () => {
    let now = 0
    const cache = new MemoryAICache(() => now)
    await cache.set("k", { organizationId: "o", operation: "op", value: 42, ttlMs: 100 })
    assert.equal(await cache.get("k"), 42)
    now = 101
    assert.equal(await cache.get("k"), undefined)
  })
})

describe("schema das respostas", () => {
  it("valida e normaliza uma resposta correta", () => {
    const parsed = processSummarySchema.parse(validSummary)
    assert.equal(parsed.nivel_confianca, "medio")
    assert.equal(parsed.pontos_atencao[0].natureza, "fato")
  })

  it("recusa resposta fora do contrato", () => {
    assert.throws(() => processSummarySchema.parse({ ...validSummary, pontos_atencao: "texto solto" }), SchemaError)
    assert.throws(() => processSummarySchema.parse({ ...validSummary, nivel_confianca: "certeza absoluta" }), SchemaError)
    assert.throws(() => processSummarySchema.parse({ ...validSummary, resumo: "" }), SchemaError)
    assert.throws(() => processSummarySchema.parse(null), SchemaError)
  })

  it("gera JSON Schema com todos os campos obrigatórios", () => {
    const json = processSummarySchema.json as { required: string[]; properties: Record<string, unknown> }
    assert.deepEqual(json.required, Object.keys(json.properties))
    assert.ok(json.required.includes("informacoes_ausentes"))
  })
})

describe("verificação das fontes", () => {
  const sources: AISources = {
    M1: { ref: "M1", kind: "movement", id: "m1", label: "Remessa", date: "2026-09-24T14:03:00" },
    T1: { ref: "T1", kind: "task", id: "t1", label: "Tarefa" },
  }

  it("descarta referências e notas que não existem", () => {
    assert.deepEqual(keepKnownRefs(["M1", "[t1]", "X7", "M1"], sources), ["M1", "T1"])
    assert.deepEqual(
      keepKnownNotes(
        [
          { ref: "M1", comentario: "ok" },
          { ref: "M99", comentario: "inventada" },
        ],
        sources,
      ).map((n) => n.ref),
      ["M1"],
    )
    assert.equal(stripUnknownRefs("Veja [M1] e [M42].", sources), "Veja [M1] e .")
  })

  it("avisa sobre data que não está nos dados", () => {
    const context = JSON.stringify({ data: "24/09/2026 14:03" })
    assert.deepEqual(groundingWarnings({ texto: "Registrada em 24/09/2026." }, context), [])
    const [warning] = groundingWarnings({ texto: "O prazo vence em 30/09/2026." }, context)
    assert.match(warning, /30\/09\/2026/)
  })

  it("avisa sobre prazo em dias inventado", () => {
    const context = JSON.stringify({ prazos_do_processo: "nenhum prazo cadastrado na Íntegra para este processo" })
    for (const text of ["Você tem 5 dias para responder.", "O prazo de 15 dias começa agora.", "Conte 10 dias úteis."]) {
      assert.equal(groundingWarnings([text], context).length, 1, text)
    }
    assert.deepEqual(groundingWarnings(["O prazo não está disponível nos dados fornecidos.", "Há 45 dias sem movimentação."], context), [])
  })
})

describe("sanitizeAIContext", () => {
  it("remove campos sensíveis e técnicos em qualquer nível e mascara documentos", () => {
    const clean = sanitizeAIContext({
      nome: "Maria",
      email: "maria@example.com",
      nested: { password: "123", apiKey: "k", raw: { x: 1 }, storagePath: "a/b", organizationId: "org", ok: "sim" },
      texto: "CPF 123.456.789-09, e-mail maria@example.com, CNPJ 12.345.678/0001-90",
      vazio: "",
      lista: [],
      nulo: null,
    })
    assert.deepEqual(Object.keys(clean), ["nome", "nested", "texto"])
    assert.deepEqual(clean.nested, { ok: "sim" })
    assert.doesNotMatch(clean.texto, /123\.456|example\.com|0001-90/)
  })

  it("não mascara o número CNJ", () => {
    assert.equal(maskSensitiveText("0801234-56.2024.8.10.0001"), "0801234-56.2024.8.10.0001")
    assert.equal(maskSensitiveText("08012345620248100001"), "08012345620248100001")
  })
})

describe("entrada das rotas", () => {
  it("valida ids", () => {
    assert.equal(readId({ processId: "p_0b7a-12" }, "processId"), "p_0b7a-12")
    assert.throws(() => readId({ processId: "../etc" }, "processId"))
    assert.throws(() => readId({ processId: 12 }, "processId"))
    assert.throws(() => readId(null, "processId"))
  })

  it("valida conversa e escopo", () => {
    const ok = readChatInput({ scope: { type: "process", id: "p_1" }, messages: [{ role: "user", content: "Resuma" }] })
    assert.deepEqual(ok.scope, { type: "process", id: "p_1" })
    assert.throws(() => readChatInput({ scope: { type: "admin" }, messages: [{ role: "user", content: "x" }] }))
    assert.throws(() => readChatInput({ scope: { type: "office" }, messages: [{ role: "system", content: "x" }] }))
    assert.throws(() => readChatInput({ scope: { type: "office" }, messages: [{ role: "user", content: "x".repeat(5000) }] }))
    assert.throws(() => readChatInput({ scope: { type: "office" }, messages: [] }))
  })
})
