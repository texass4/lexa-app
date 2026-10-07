/**
 * Configuração da Íntegra IA — o único lugar que lê as variáveis de ambiente da IA
 * e o único lugar com nomes de modelo. Um provedor só (Gemini) para todo o núcleo.
 *
 * - `AI_MODEL`: modelo das análises (resumos, próximos passos, chat, panorama);
 * - `AI_MODEL_LIGHT`: modelo mais barato para operações simples e automáticas
 *   (análise de uma movimentação). `off` = usa `AI_MODEL`;
 * - `AI_FALLBACK_MODEL`: reservas, em ordem, quando o principal está fora.
 *
 * `GEMINI_MODEL` e `GEMINI_FALLBACK_MODEL` continuam aceitos (nomes antigos).
 * Só roda no servidor: a chave nunca tem prefixo NEXT_PUBLIC_ e nunca sai daqui.
 */

import { AIError } from "./errors"
import type { AIStatus } from "./types"

/** Modelo padrão das análises. Troque por `AI_MODEL` sem mexer no código. */
export const DEFAULT_AI_MODEL = "gemini-2.5-flash"
/** Modelo padrão das operações simples. Troque por `AI_MODEL_LIGHT`. */
export const DEFAULT_AI_LIGHT_MODEL = "gemini-2.5-flash-lite"

/** Tempo máximo de uma chamada ao modelo. */
const DEFAULT_AI_TIMEOUT_MS = 45_000

const AI_PROVIDER = { id: "gemini", label: "Google Gemini" } as const

/** Operações simples: modelo leve (mais barato e rápido). O resto usa o modelo principal. */
export type AITier = "standard" | "light"

export interface AIConfig {
  provider: "gemini"
  apiKey: string
  model: string
  /** Modelo das operações simples (igual a `model` quando desligado). */
  lightModel: string
  /** Modelos tentados, em ordem, quando o principal está sobrecarregado ou indisponível. */
  fallbackModels: string[]
  timeoutMs: number
}

const MODEL_NAME = /^[A-Za-z0-9._\-/]{3,80}$/

type Env = Record<string, string | undefined>

function assertServer() {
  if (typeof window !== "undefined") throw new Error("A configuração da Íntegra IA só pode ser lida no servidor.")
}

/** `AI_ENABLED` ausente = ligada; só "false", "0" ou "off" desligam. */
function isAIEnabled(env: Env = process.env) {
  const flag = env.AI_ENABLED?.trim().toLowerCase()
  return !(flag === "false" || flag === "0" || flag === "off")
}

export function getAIStatus(env: Env = process.env): AIStatus {
  assertServer()
  return { enabled: isAIEnabled(env), configured: !!env.GEMINI_API_KEY?.trim() }
}

/** Modelos em uso (sem a chave) — para as telas de administração e o aviso de privacidade. */
export function describeAIModels(env: Env = process.env) {
  assertServer()
  const model = (env.AI_MODEL ?? env.GEMINI_MODEL)?.trim() || DEFAULT_AI_MODEL
  const light = env.AI_MODEL_LIGHT?.trim()
  return { provider: AI_PROVIDER, model, lightModel: !light ? DEFAULT_AI_LIGHT_MODEL : light.toLowerCase() === "off" ? model : light }
}

/** Configuração válida ou erro com código conhecido (DISABLED, NOT_CONFIGURED). */
export function getAIConfig(env: Env = process.env): AIConfig {
  assertServer()
  if (!isAIEnabled(env)) throw new AIError("DISABLED")

  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new AIError("NOT_CONFIGURED")

  const { model, lightModel } = describeAIModels(env)
  if (!MODEL_NAME.test(model)) throw new AIError("NOT_CONFIGURED", { message: "AI_MODEL inválido." })
  if (!MODEL_NAME.test(lightModel)) throw new AIError("NOT_CONFIGURED", { message: "AI_MODEL_LIGHT inválido." })

  const fallbackModels = [...new Set((env.AI_FALLBACK_MODEL ?? env.GEMINI_FALLBACK_MODEL ?? "").split(",").map((name) => name.trim()))].filter(
    (name) => name && name !== model,
  )
  if (fallbackModels.some((name) => !MODEL_NAME.test(name))) throw new AIError("NOT_CONFIGURED", { message: "AI_FALLBACK_MODEL inválido." })

  const timeout = Number(env.AI_TIMEOUT_MS)
  return {
    provider: "gemini",
    apiKey,
    model,
    lightModel,
    fallbackModels,
    timeoutMs: Number.isFinite(timeout) && timeout >= 5_000 ? timeout : DEFAULT_AI_TIMEOUT_MS,
  }
}
