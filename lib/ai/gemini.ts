/**
 * Provedor Gemini (SDK oficial `@google/genai`).
 *
 * É o único arquivo do LEXA que importa o SDK. Roda só no servidor: a chave
 * vem de `config.ts` e nunca chega ao navegador.
 */

import { GoogleGenAI, type GenerateContentParameters } from "@google/genai"
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
  timeoutMs: number
  client?: GeminiClientLike
}

const DEFAULT_TEMPERATURE = 0.2
/** Teto (não custo): só os tokens gerados são cobrados. No Gemini, o raciocínio também conta aqui. */
const DEFAULT_MAX_OUTPUT_TOKENS = 8192
/**
 * Gemini 2.5 Flash raciocina por padrão com orçamento dinâmico (cobrado como saída).
 * Organizar dados já estruturados pede pouco raciocínio: um teto curto barateia e
 * evita resposta cortada. Outros modelos seguem o padrão do provedor.
 */
const thinkingFor = (model: string) => (/^gemini-2\.5-flash/.test(model) ? { thinkingBudget: 1024 } : undefined)

export class GeminiProvider implements AIProvider {
  readonly name = "gemini"
  readonly model: string
  private readonly client: GeminiClientLike
  private readonly timeoutMs: number

  constructor(options: GeminiOptions) {
    if (typeof window !== "undefined") throw new Error("GeminiProvider só pode rodar no servidor.")
    this.model = options.model
    this.timeoutMs = options.timeoutMs
    this.client =
      options.client ??
      new GoogleGenAI({
        apiKey: options.apiKey,
        // Uma nova tentativa só para instabilidade do serviço; limite de uso (429) não é repetido.
        httpOptions: { retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 3, httpStatusCodes: [500, 502, 503, 504] } },
      })
  }

  async generateText(request: AIRequest): Promise<AIProviderResult<string>> {
    const response = await this.call(request)
    return { value: readText(response), usage: usage(response) }
  }

  async generateJSON(request: AIRequest & { schema: JsonSchema }): Promise<AIProviderResult<unknown>> {
    const response = await this.call(request, { responseMimeType: "application/json", responseJsonSchema: request.schema })
    const text = readText(response)
    try {
      return { value: JSON.parse(text), usage: usage(response) }
    } catch (cause) {
      throw new AIError("INVALID_RESPONSE", { message: "O modelo não devolveu um JSON válido.", cause })
    }
  }

  private async call(request: AIRequest, extra: GenerateContentParameters["config"] = {}): Promise<GeminiResponseLike> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout

    try {
      return await this.client.models.generateContent({
        model: this.model,
        contents: request.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        config: {
          systemInstruction: request.system,
          temperature: request.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          thinkingConfig: thinkingFor(this.model),
          abortSignal: signal,
          ...extra,
        },
      })
    } catch (error) {
      if (request.signal?.aborted) throw new AIError("CANCELLED", { cause: error })
      if (timeout.aborted) throw new AIError("TIMEOUT", { cause: error })
      throw mapGeminiError(error)
    }
  }
}

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

function usage(response: GeminiResponseLike): AIUsage | undefined {
  const meta = response.usageMetadata
  return meta ? { inputTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount } : undefined
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
