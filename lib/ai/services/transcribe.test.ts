import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { encodeWav } from "@/lib/ai/audio"
import { GeminiProvider, type GeminiClientLike } from "@/lib/ai/gemini"
import type { AITranscriptionRequest } from "@/lib/ai/provider"
import { makeDeps, memoryMeter } from "../__fixtures__/data"
import { TRANSCRIBE_SYSTEM, transcribeAudio } from "./transcribe"

const wav = (seconds = 1.5) => {
  const samples = new Float32Array(Math.round(seconds * 16_000))
  for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 300 * i) / 16_000)
  return new Uint8Array(encodeWav(samples))
}

function withTranscriber(reply: string | Error) {
  const meter = memoryMeter()
  const { deps } = makeDeps(() => ({}), { meter })
  const requests: AITranscriptionRequest[] = []
  deps.provider = {
    ...deps.provider,
    async transcribe(request) {
      requests.push(request)
      if (reply instanceof Error) throw reply
      return { value: reply, usage: { inputTokens: 50, outputTokens: 12, model: "fake-flash-lite" } }
    },
  }
  return { deps, requests, usage: meter.events }
}

const code = async (promise: Promise<unknown>) => {
  try {
    await promise
    return "ok"
  } catch (error) {
    return (error as { code?: string }).code
  }
}

describe("transcrição da conversa por voz", () => {
  it("áudio válido → texto limpo; uma chamada só, medida no plano (modelo leve)", async () => {
    const { deps, requests, usage } = withTranscriber(' "Quais prazos vencem nesta semana?" ')
    const result = await transcribeAudio(deps, wav())
    assert.deepEqual(result, { text: "Quais prazos vencem nesta semana?", seconds: 1.5 })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].mimeType, "audio/wav")
    assert.equal(requests[0].tier, "light")
    assert.equal(requests[0].system, TRANSCRIBE_SYSTEM)
    assert.equal(usage.length, 1)
    assert.equal(usage[0].context.operation, "voice.transcribe")
    assert.equal(usage[0].status, "ok")
  })

  it("sem fala: erro próprio (a tela pede para gravar de novo)", async () => {
    const { deps } = withTranscriber("[sem fala]")
    assert.equal(await code(transcribeAudio(deps, wav())), "NO_SPEECH")
  })

  it("áudio inválido nem chega ao modelo", async () => {
    const { deps, requests } = withTranscriber("x")
    assert.equal(await code(transcribeAudio(deps, new TextEncoder().encode("x".repeat(100)))), "INVALID_AUDIO")
    assert.equal(await code(transcribeAudio(deps, wav(0.2))), "INVALID_AUDIO")
    assert.equal(requests.length, 0)
  })

  it("provedor sem transcrição: não configurado, sem chamada", async () => {
    const { deps } = makeDeps(() => ({}))
    assert.equal(await code(transcribeAudio(deps, wav())), "NOT_CONFIGURED")
  })

  it("falha do provedor é registrada como erro no consumo", async () => {
    const { deps, usage } = withTranscriber(Object.assign(new Error("boom"), { status: 503 }))
    assert.notEqual(await code(transcribeAudio(deps, wav())), "ok")
    assert.equal(usage[0].status, "erro")
  })
})

describe("Gemini — pedido de transcrição", () => {
  it("envia o WAV como inlineData (base64) com a instrução, pelo modelo leve", async () => {
    const sent: unknown[] = []
    const client: GeminiClientLike = {
      models: {
        async generateContent(params) {
          sent.push(params)
          return { text: "Resuma o processo.", candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 5 } }
        },
      },
    }
    const provider = new GeminiProvider({ apiKey: "chave-de-teste", model: "gemini-2.5-flash", lightModel: "gemini-2.5-flash-lite", timeoutMs: 10_000, client })
    const audio = wav(1)
    const result = await provider.transcribe({ audio, mimeType: "audio/wav", system: "S", prompt: "Transcreva o áudio.", seconds: 1, tier: "light" })
    assert.equal(result.value, "Resuma o processo.")
    const params = sent[0] as { model: string; contents: { parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[]; config: { systemInstruction: string; maxOutputTokens: number } }
    assert.equal(params.model, "gemini-2.5-flash-lite")
    assert.equal(params.config.systemInstruction, "S")
    assert.equal(params.config.maxOutputTokens, 128 + 8)
    assert.equal((params.config as { thinkingConfig?: unknown }).thinkingConfig, undefined)
    const [audioPart, textPart] = params.contents[0].parts
    assert.equal(audioPart.inlineData?.mimeType, "audio/wav")
    assert.deepEqual(Buffer.from(audioPart.inlineData!.data, "base64"), Buffer.from(audio))
    assert.equal(textPart.text, "Transcreva o áudio.")
  })
})

describe("Gemini — transcrição rápida", () => {
  const capture = () => {
    const sent: { model: string; config: { maxOutputTokens: number; thinkingConfig?: unknown; abortSignal?: AbortSignal } }[] = []
    const client: GeminiClientLike = {
      models: {
        async generateContent(params) {
          sent.push(params as never)
          return { text: "ok", candidates: [{ finishReason: "STOP" }] }
        },
      },
    }
    return { sent, client }
  }

  it("sem raciocínio no 2.5 Flash, nível mínimo na família 3; resposta do tamanho do áudio", async () => {
    for (const [model, thinking] of [
      ["gemini-2.5-flash", { thinkingBudget: 0 }],
      ["gemini-3-flash-preview", { thinkingLevel: "MINIMAL" }],
      ["gemini-3.5-flash", { thinkingLevel: "MINIMAL" }],
      ["gemini-3.8-flash", { thinkingLevel: "LOW" }],
    ] as const) {
      const { sent, client } = capture()
      const provider = new GeminiProvider({ apiKey: "k", model, lightModel: model, timeoutMs: 45_000, client })
      await provider.transcribe({ audio: wav(1), mimeType: "audio/wav", system: "S", prompt: "P", seconds: 60, tier: "light" })
      assert.deepEqual(sent[0].config.thinkingConfig, thinking)
      assert.equal(sent[0].config.maxOutputTokens, 128 + 480)
    }
  })

  it("trava do provedor: desiste em 30 s (não nos 45 s das análises) com TIMEOUT", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const client: GeminiClientLike = {
      models: {
        generateContent: (params) =>
          new Promise((_, reject) => params.config?.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
      },
    }
    let timeoutMs = 0
    const original = AbortSignal.timeout
    AbortSignal.timeout = (ms: number) => {
      timeoutMs = ms
      return original.call(AbortSignal, 1)
    }
    try {
      const provider = new GeminiProvider({ apiKey: "k", model: "gemini-2.5-flash", lightModel: "gemini-2.5-flash-lite", timeoutMs: 45_000, client })
      const outcome = await provider.transcribe({ audio: wav(1), mimeType: "audio/wav", system: "S", prompt: "P", seconds: 1, tier: "light" }).catch((e) => e.code)
      assert.equal(timeoutMs, 30_000)
      assert.equal(outcome, "TIMEOUT")
    } finally {
      AbortSignal.timeout = original
    }
  })
})

describe("Gemini — modelos atuais", () => {
  const replying = (fail: Record<string, number>) => {
    const sent: { model: string; config: { temperature?: number } }[] = []
    const client: GeminiClientLike = {
      models: {
        async generateContent(params) {
          sent.push(params as never)
          const status = fail[params.model]
          if (status) throw Object.assign(new Error(`status ${status}`), { status })
          return { text: "ok", candidates: [{ finishReason: "STOP" }] }
        },
      },
    }
    return { sent, client }
  }
  const request = { system: "S", messages: [{ role: "user" as const, content: "Oi" }], temperature: 0.3 }

  it("principal retirado da chave (404) sem reserva configurado: o leve responde", async () => {
    const { sent, client } = replying({ "gemini-2.5-flash": 404 })
    const provider = new GeminiProvider({ apiKey: "k", model: "gemini-2.5-flash", lightModel: "gemini-3.5-flash-lite", timeoutMs: 5_000, client, retryDelayMs: 0 })
    const result = await provider.generateText(request)
    assert.deepEqual(sent.map((p) => p.model), ["gemini-2.5-flash", "gemini-3.5-flash-lite"])
    assert.equal(result.usage?.model, "gemini-3.5-flash-lite")
  })

  it("o erro final lista cada modelo tentado (vai para o log)", async () => {
    const { client } = replying({ "gemini-3.5-flash-lite": 503, "gemini-3.5-flash": 404 })
    const provider = new GeminiProvider({ apiKey: "k", model: "gemini-3.5-flash", lightModel: "gemini-3.5-flash-lite", timeoutMs: 5_000, client, retryDelayMs: 0 })
    const error = await provider.transcribe({ audio: wav(1), mimeType: "audio/wav", system: "S", prompt: "P", seconds: 1, tier: "light" }).catch((e) => e)
    assert.equal(error.code, "MODEL_UNAVAILABLE")
    assert.deepEqual(
      error.attempts.map((a: { model: string; status?: number }) => `${a.model} ${a.status}`),
      ["gemini-3.5-flash-lite 503", "gemini-3.5-flash 404"],
    )
  })

  it("família 3 fica na temperatura padrão do Google; 2.5 mantém a pedida", async () => {
    const { sent, client } = replying({})
    await new GeminiProvider({ apiKey: "k", model: "gemini-3.5-flash", timeoutMs: 5_000, client }).generateText(request)
    await new GeminiProvider({ apiKey: "k", model: "gemini-2.5-flash", timeoutMs: 5_000, client }).generateText(request)
    assert.equal(sent[0].config.temperature, undefined)
    assert.equal(sent[1].config.temperature, 0.3)
  })
})
