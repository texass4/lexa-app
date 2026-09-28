/**
 * Provedor Gemini (SDK oficial `@google/genai`).
 *
 * É o único arquivo do LEXA que importa o SDK. Roda só no servidor: a chave
 * vem de `config.ts` e nunca chega ao navegador.
 */

import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai"
import { AIError } from "./errors"
import type { AIProvider, AIProviderResult, AIRequest, AIUsage } from "./provider"
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
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

interface GeminiOptions {
  apiKey: string
  model: string
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
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 1024 }
  if (/^gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW }
  return undefined
}

/** Falhas que outro modelo (ou uma nova tentativa) pode resolver. */
const SWITCHABLE = new Set(["UNAVAILABLE", "PROVIDER_RATE_LIMITED", "MODEL_UNAVAILABLE"])

export class GeminiProvider implements AIProvider {
  readonly name = "gemini"
  readonly model: string
  private readonly fallbackModels: string[]
  private readonly client: GeminiClientLike
  private readonly timeoutMs: number
  private readonly retryDelayMs: number

  constructor(options: GeminiOptions) {
    if (typeof window !== "undefined") throw new Error("GeminiProvider só pode rodar no servidor.")
    this.model = options.model
    this.fallbackModels = options.fallbackModels ?? []
    this.timeoutMs = options.timeoutMs
    this.retryDelayMs = options.retryDelayMs ?? 1500
    // Sem novas tentativas dentro do SDK: quem decide repetir ou trocar de modelo é `call`.
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey })
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
   * Tenta o modelo principal e, se ele estiver sobrecarregado (503), sem cota (429)
   * ou indisponível (404), os reservas em ordem. Sem reserva, repete o principal uma
   * vez. Todas as tentativas dividem o mesmo tempo máximo.
   */
  private async call(request: AIRequest, extra: GenerateContentParameters["config"] = {}) {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    const chain = this.fallbackModels.length ? [this.model, ...this.fallbackModels] : [this.model, this.model]

    for (let i = 0; ; i++) {
      const model = chain[i]
      try {
        return { response: await this.attempt(model, request, extra, signal), model }
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

  private attempt(model: string, request: AIRequest, extra: GenerateContentParameters["config"], signal: AbortSignal) {
    return this.client.models.generateContent({
      model,
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: request.system,
        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
        maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        thinkingConfig: thinkingFor(model),
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
  return { inputTokens: meta?.promptTokenCount, outputTokens: meta?.candidatesTokenCount, model }
}

/** Erro do SDK → código do LEXA. A mensagem original fica só em `cause`. */
export function mapGeminiError(error: unknown): AIError {
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
