/**
 * Provedor Gemini (SDK oficial `@google/genai`).
 *
 * É o único arquivo da Íntegra que importa o SDK. Roda só no servidor: a chave
 * vem de `config.ts` e nunca chega ao navegador.
 */

import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai"
import { AIError } from "./errors"
import type { AIProvider, AIProviderResult, AIRequest, AITranscriptionRequest, AIUsage } from "./provider"
import type { JsonSchema } from "./schema"

/** O pedaço do SDK que usamos — permite testar sem rede. */
export interface GeminiClientLike {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GeminiResponseLike>
  }
}

export interface GeminiResponseLike {
  text?: string
  candidates?: { finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }
}

interface GeminiOptions {
  apiKey: string
  model: string
  /** Modelo das operações simples (`tier: "light"`). Sem ele, usa `model`. */
  lightModel?: string
  fallbackModels?: string[]
  timeoutMs: number
  client?: GeminiClientLike
  /** Espera antes de repetir o mesmo modelo (sem reserva configurado). */
  retryDelayMs?: number
}

const DEFAULT_TEMPERATURE = 0.2
/** Teto (não custo): só os tokens gerados são cobrados. No Gemini, o raciocínio também conta aqui. */
const DEFAULT_MAX_OUTPUT_TOKENS = 8192
/**
 * Os modelos Flash raciocinam por padrão (cobrado como saída e mais lento).
 * Organizar dados já estruturados pede pouco raciocínio: 2.5 recebe um orçamento
 * curto e a família 3 o nível "low". Nomes genéricos (ex.: "-latest") ficam no
 * padrão do provedor, porque não dá para saber qual parâmetro aceitam.
 */
function thinkingFor(model: string) {
  // Flash-Lite não raciocina por padrão — e as operações simples não precisam.
  if (/-lite\b/.test(model)) return undefined
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 1024 }
  if (/^gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW }
  return undefined
}

/** Transcrever não pede raciocínio: desliga onde dá (2.5 Flash) ou usa o nível mínimo (família 3). */
function minimalThinking(model: string) {
  if (/-lite\b/.test(model)) return undefined
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 }
  if (/^gemini-3.*flash/.test(model)) return { thinkingLevel: ThinkingLevel.MINIMAL }
  return thinkingFor(model)
}

/** Teto de uma transcrição: fala rápida fica bem abaixo de 8 tokens por segundo. */
const transcriptTokens = (seconds: number) => Math.min(1024, 128 + Math.ceil(seconds * 8))
/** Transcrever um pedido de até 1 min leva segundos; acima disso algo travou. */
const TRANSCRIBE_TIMEOUT_MS = 30_000

/** Falhas que outro modelo (ou uma nova tentativa) pode resolver. */
const SWITCHABLE = new Set(["UNAVAILABLE", "PROVIDER_RATE_LIMITED", "MODEL_UNAVAILABLE"])

export class GeminiProvider implements AIProvider {
  readonly name = "gemini"
  readonly model: string
  readonly lightModel: string
  private readonly fallbackModels: string[]
  private readonly client: GeminiClientLike
  private readonly timeoutMs: number
  private readonly retryDelayMs: number

  constructor(options: GeminiOptions) {
    if (typeof window !== "undefined") throw new Error("GeminiProvider só pode rodar no servidor.")
    this.model = options.model
    this.lightModel = options.lightModel || options.model
    this.fallbackModels = options.fallbackModels ?? []
    this.timeoutMs = options.timeoutMs
    this.retryDelayMs = options.retryDelayMs ?? 1500
    // Sem novas tentativas dentro do SDK: quem decide repetir ou trocar de modelo é `call`.
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey })
  }

  modelFor(tier: AIRequest["tier"] = "standard") {
    return tier === "light" ? this.lightModel : this.model
  }

  async generateText(request: AIRequest): Promise<AIProviderResult<string>> {
    const { response, model } = await this.call(request)
    return { value: readText(response), usage: usage(response, model) }
  }

  async generateJSON(request: AIRequest & { schema: JsonSchema }): Promise<AIProviderResult<unknown>> {
    const { response, model } = await this.call(request, { responseMimeType: "application/json", responseJsonSchema: request.schema })
    const text = readText(response)
    try {
      return { value: JSON.parse(text), usage: usage(response, model) }
    } catch (cause) {
      throw new AIError("INVALID_RESPONSE", { message: "O modelo não devolveu um JSON válido.", cause })
    }
  }

  /**
   * Áudio → texto com o mesmo modelo multimodal (o áudio vai como `inlineData`, em
   * memória; nada é enviado à File API nem guardado). Vai pelo nível pedido (o leve,
   * em geral), com as mesmas reservas, sem raciocínio, resposta do tamanho do áudio
   * (uma repetição sem fim do modelo para cedo) e tempo máximo próprio, mais curto.
   */
  async transcribe(request: AITranscriptionRequest): Promise<AIProviderResult<string>> {
    const contents = [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: request.mimeType, data: Buffer.from(request.audio).toString("base64") } }, { text: request.prompt }],
      },
    ]
    const { response, model } = await this.call(
      {
        system: request.system,
        messages: [],
        maxOutputTokens: transcriptTokens(request.seconds),
        signal: request.signal,
        tier: request.tier,
        timeoutMs: Math.min(this.timeoutMs, TRANSCRIBE_TIMEOUT_MS),
        reasoning: "minimal",
      },
      {},
      contents,
    )
    return { value: readText(response), usage: usage(response, model) }
  }

  /**
   * Tenta o modelo principal e, se ele estiver sobrecarregado (503), sem cota (429)
   * ou indisponível (404), os reservas em ordem. Sem reserva, repete o principal uma
   * vez. Todas as tentativas dividem o mesmo tempo máximo.
   */
  private async call(request: AIRequest, extra: GenerateContentParameters["config"] = {}, contents?: GenerateContentParameters["contents"]) {
    const timeout = AbortSignal.timeout(request.timeoutMs ?? this.timeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    // Leve: se o modelo leve falhar, o principal responde (mais caro, mas o evento não fica sem análise).
    const first = this.modelFor(request.tier)
    const chain =
      first !== this.model ? [first, this.model] : this.fallbackModels.length ? [this.model, ...this.fallbackModels] : [this.model, this.model]

    for (let i = 0; ; i++) {
      const model = chain[i]
      try {
        return { response: await this.attempt(model, request, extra, signal, contents), model }
      } catch (error) {
        if (request.signal?.aborted) throw new AIError("CANCELLED", { cause: error })
        if (timeout.aborted) throw new AIError("TIMEOUT", { cause: error })
        const known = mapGeminiError(error)
        const next = chain[i + 1]
        if (!next || !SWITCHABLE.has(known.code) || (next === model && known.code === "MODEL_UNAVAILABLE")) throw known
        if (next === model) await sleep(this.retryDelayMs, signal)
      }
    }
  }

  private attempt(
    model: string,
    request: AIRequest,
    extra: GenerateContentParameters["config"],
    signal: AbortSignal,
    contents?: GenerateContentParameters["contents"],
  ) {
    return this.client.models.generateContent({
      model,
      contents:
        contents ??
        request.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
      config: {
        systemInstruction: request.system,
        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
        maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        thinkingConfig: request.reasoning === "minimal" ? minimalThinking(model) : thinkingFor(model),
        abortSignal: signal,
        ...extra,
      },
    })
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true })
  })

function readText(response: GeminiResponseLike): string {
  if (response.promptFeedback?.blockReason) throw new AIError("BLOCKED", { message: `Pedido bloqueado: ${response.promptFeedback.blockReason}` })
  const finish = response.candidates?.[0]?.finishReason
  const text = response.text?.trim()
  if (!text) {
    if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") throw new AIError("BLOCKED", { message: `Resposta interrompida: ${finish}` })
    throw new AIError("EMPTY_RESPONSE")
  }
  if (finish === "MAX_TOKENS") throw new AIError("INVALID_RESPONSE", { message: "Resposta cortada pelo limite de tamanho." })
  return text
}

function usage(response: GeminiResponseLike, model: string): AIUsage {
  const meta = response.usageMetadata
  // Raciocínio é cobrado como saída; o que veio do cache (implícito do Gemini) já está na entrada.
  const output =
    meta?.candidatesTokenCount === undefined && meta?.thoughtsTokenCount === undefined
      ? undefined
      : (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0)
  return { inputTokens: meta?.promptTokenCount, outputTokens: output, cachedTokens: meta?.cachedContentTokenCount, model }
}

/** Erro do SDK → código da Íntegra. A mensagem original fica só em `cause`. */
function mapGeminiError(error: unknown): AIError {
  if (error instanceof AIError) return error
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined
  const message = error instanceof Error ? error.message : ""

  const options = { cause: error, providerStatus: status }

  if (status === 429) return new AIError("PROVIDER_RATE_LIMITED", options)
  if (status === 401 || status === 403 || (status === 400 && /api[ _]?key/i.test(message))) return new AIError("INVALID_API_KEY", options)
  if (status === 404) return new AIError("MODEL_UNAVAILABLE", options)
  if (status === 408 || status === 504) return new AIError("TIMEOUT", options)
  if (status !== undefined && status >= 500) return new AIError("UNAVAILABLE", options)
  if (status === 400) return new AIError("BAD_REQUEST", { ...options, message: "Pedido recusado pelo provedor." })
  if (error instanceof Error && error.name === "AbortError") return new AIError("TIMEOUT", { cause: error })
  return new AIError("UNAVAILABLE", { cause: error })
}
