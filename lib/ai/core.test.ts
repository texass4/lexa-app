import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_GEMINI_MODEL, getAIConfig, getAIStatus } from "./config"
import { AIError } from "./errors"
import { GeminiProvider, type GeminiClientLike, type GeminiResponseLike } from "./gemini"
import { RateLimiter, ResultCache } from "./guard"
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
    assert.equal(code(() => getAIConfig({})), "NOT_CONFIGURED")
    assert.equal(code(() => getAIConfig({ GEMINI_API_KEY: "   " })), "NOT_CONFIGURED")
    assert.deepEqual(getAIStatus({}), { enabled: true, configured: false })
  })

  it("AI_ENABLED=false desliga mesmo com chave", () => {
    assert.equal(code(() => getAIConfig({ AI_ENABLED: "false", GEMINI_API_KEY: "k" })), "DISABLED")
    assert.deepEqual(getAIStatus({ AI_ENABLED: "false", GEMINI_API_KEY: "k" }), { enabled: false, configured: true })
  })

  it("usa o modelo Flash padrão e aceita GEMINI_MODEL", () => {
    assert.equal(getAIConfig({ GEMINI_API_KEY: "k" }).model, DEFAULT_GEMINI_MODEL)
    assert.equal(getAIConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-flash-latest" }).model, "gemini-flash-latest")
    assert.equal(code(() => getAIConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "x; rm -rf" })), "NOT_CONFIGURED")
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
  return { provider: new GeminiProvider({ apiKey: "k", model: "gemini-test", timeoutMs: 5_000, client }), calls }
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

  it("mapeia o papel do assistente para 'model'", async () => {
    const { provider, calls } = gemini({ text: "ok" })
    await provider.generateText({ system: "s", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] })
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

  it("erros da API viram códigos do LEXA, sem vazar a mensagem original", async () => {
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
    const missingModel = (await gemini(apiError(404)).provider.generateText(request).catch((e: AIError) => e)) as AIError
    assert.equal(missingModel.providerStatus, 404)
  })

  it("cancelamento pelo usuário → CANCELLED", async () => {
    const controller = new AbortController()
    controller.abort()
    const { provider } = gemini(Object.assign(new Error("aborted"), { name: "AbortError" }))
    assert.equal(await rejects(provider.generateText({ ...request, signal: controller.signal })), "CANCELLED")
  })
})

describe("limite de uso e cache", () => {
  it("bloqueia depois do limite e libera quando a janela passa", () => {
    let now = 0
    const limiter = new RateLimiter(() => now)
    const rules = [{ limit: 2, windowMs: 1000 }]
    limiter.consume([{ key: "u", rules }])
    limiter.consume([{ key: "u", rules }])
    const error = (() => {
      try {
        limiter.consume([{ key: "u", rules }])
      } catch (e) {
        return e as AIError
      }
    })()
    assert.equal(error?.code, "RATE_LIMITED")
    assert.equal(error?.retryAfter, 1)
    now = 1001
    assert.doesNotThrow(() => limiter.consume([{ key: "u", rules }]))
  })

  it("pedido bloqueado por uma regra não conta nas outras chaves", () => {
    const limiter = new RateLimiter(() => 0)
    const tight = [{ limit: 1, windowMs: 1000 }]
    const loose = [{ limit: 5, windowMs: 1000 }]
    limiter.consume([{ key: "user", rules: tight }, { key: "org", rules: loose }])
    assert.throws(() => limiter.consume([{ key: "user", rules: tight }, { key: "org", rules: loose }]))
    for (let i = 0; i < 4; i++) limiter.consume([{ key: `other${i}`, rules: tight }, { key: "org", rules: loose }])
  })

  it("cliques repetidos viram uma chamada; resultado expira", async () => {
    let now = 0
    let produced = 0
    const cache = new ResultCache<number>({ ttlMs: 100, now: () => now })
    const produce = async () => {
      produced += 1
      return 42
    }
    const [a, b] = await Promise.all([cache.run("k", produce), cache.run("k", produce)])
    assert.equal(a, 42)
    assert.equal(b, 42)
    assert.equal(produced, 1)
    assert.equal(cache.get("k"), 42)
    now = 101
    assert.equal(cache.get("k"), undefined)
  })

  it("falha não fica no cache", async () => {
    const cache = new ResultCache<number>()
    await assert.rejects(cache.run("k", async () => Promise.reject(new Error("x"))))
    assert.equal(cache.get("k"), undefined)
    assert.equal(await cache.run("k", async () => 1), 1)
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
    const context = JSON.stringify({ prazo_cadastrado_no_lexa: "nenhum prazo cadastrado" })
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
