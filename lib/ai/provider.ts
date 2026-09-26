/**
 * Contrato do provedor de IA.
 *
 * A LEXA IA (contexto, prompts, schemas, serviços, rotas e telas) só conhece
 * esta interface. Para usar outro modelo (OpenAI, por exemplo), basta criar
 * uma classe com estes dois métodos e escolhê-la em `getAIProvider` — nada
 * mais muda.
 */

import { getAIConfig, type AIConfig } from "./config"
import { GeminiProvider } from "./gemini"
import type { JsonSchema } from "./schema"
import type { AIMessage } from "./types"

export interface AIRequest {
  /** Instruções de sistema (papel da LEXA IA + regras da tarefa). */
  system: string
  /** Conversa, sempre terminando numa mensagem do usuário. */
  messages: AIMessage[]
  /** Baixa por padrão: precisão acima de criatividade. */
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface AIUsage {
  inputTokens?: number
  outputTokens?: number
  /** Modelo que de fato respondeu (pode ser o reserva). */
  model?: string
}

export interface AIProviderResult<T> {
  value: T
  usage?: AIUsage
}

export interface AIProvider {
  readonly name: string
  readonly model: string
  /** Texto livre (Markdown simples), usado no chat. */
  generateText(request: AIRequest): Promise<AIProviderResult<string>>
  /** JSON seguindo `schema`. Devolve o objeto ainda não validado — quem chama valida. */
  generateJSON(request: AIRequest & { schema: JsonSchema }): Promise<AIProviderResult<unknown>>
}

let cached: { key: string; provider: AIProvider } | undefined

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case "gemini":
      return new GeminiProvider({ apiKey: config.apiKey, model: config.model, fallbackModels: config.fallbackModels, timeoutMs: config.timeoutMs })
  }
}

/** Um único cliente por configuração, reaproveitado entre requisições. */
export function getAIProvider(): AIProvider {
  const config = getAIConfig()
  const key = `${config.provider}:${config.model}:${config.fallbackModels.join(",")}:${config.timeoutMs}:${config.apiKey.length}:${config.apiKey.slice(-4)}`
  if (cached?.key !== key) cached = { key, provider: createAIProvider(config) }
  return cached.provider
}
