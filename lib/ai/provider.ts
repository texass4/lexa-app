/**
 * Contrato do provedor de IA.
 *
 * A Íntegra IA (contexto, prompts, schemas, serviços, rotas e telas) só conhece
 * esta interface. Para usar outro modelo (OpenAI, por exemplo), basta criar
 * uma classe com estes dois métodos e escolhê-la em `getAIProvider` — nada
 * mais muda.
 */

import { getAIConfig, type AIConfig, type AITier } from "./config"
import { GeminiProvider } from "./gemini"
import type { JsonSchema } from "./schema"
import type { AIMessage } from "./types"

export interface AIRequest {
  /** Instruções de sistema (papel da Íntegra IA + regras da tarefa). */
  system: string
  /** Conversa, sempre terminando numa mensagem do usuário. */
  messages: AIMessage[]
  /** Baixa por padrão: precisão acima de criatividade. */
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
  /** `light`: operação simples — usa o modelo mais barato (`AI_MODEL_LIGHT`). */
  tier?: AITier
}

export interface AIUsage {
  inputTokens?: number
  /** Inclui os tokens de raciocínio (cobrados como saída). */
  outputTokens?: number
  /** Parte da entrada lida do cache do provedor (cobrada mais barato). */
  cachedTokens?: number
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
  /** Modelo de uma operação do nível pedido (o principal, se não houver leve). */
  modelFor?(tier: AITier): string
  /** Texto livre (Markdown simples), usado no chat. */
  generateText(request: AIRequest): Promise<AIProviderResult<string>>
  /** JSON seguindo `schema`. Devolve o objeto ainda não validado — quem chama valida. */
  generateJSON(request: AIRequest & { schema: JsonSchema }): Promise<AIProviderResult<unknown>>
}

let cached: { key: string; provider: AIProvider } | undefined

function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case "gemini":
      return new GeminiProvider({
        apiKey: config.apiKey,
        model: config.model,
        lightModel: config.lightModel,
        fallbackModels: config.fallbackModels,
        timeoutMs: config.timeoutMs,
      })
  }
}

/** Um único cliente por configuração, reaproveitado entre requisições. */
export function getAIProvider(): AIProvider {
  const config = getAIConfig()
  const key = `${config.provider}:${config.model}:${config.lightModel}:${config.fallbackModels.join(",")}:${config.timeoutMs}:${config.apiKey.length}:${config.apiKey.slice(-4)}`
  if (cached?.key !== key) cached = { key, provider: createAIProvider(config) }
  return cached.provider
}
