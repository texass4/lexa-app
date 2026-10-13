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
    const result = await provider.transcribe({ audio, mimeType: "audio/wav", system: "S", prompt: "Transcreva o áudio.", tier: "light" })
    assert.equal(result.value, "Resuma o processo.")
    const params = sent[0] as { model: string; contents: { parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[]; config: { systemInstruction: string; temperature: number } }
    assert.equal(params.model, "gemini-2.5-flash-lite")
    assert.equal(params.config.systemInstruction, "S")
    assert.equal(params.config.temperature, 0)
    const [audioPart, textPart] = params.contents[0].parts
    assert.equal(audioPart.inlineData?.mimeType, "audio/wav")
    assert.deepEqual(Buffer.from(audioPart.inlineData!.data, "base64"), Buffer.from(audio))
    assert.equal(textPart.text, "Transcreva o áudio.")
  })
})
