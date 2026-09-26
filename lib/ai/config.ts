/**
 * Configuração da LEXA IA — o único lugar que lê as variáveis de ambiente da IA.
 *
 * Só roda no servidor: a chave nunca tem prefixo NEXT_PUBLIC_ e nunca sai daqui.
 */

import { AIError } from "./errors"
import type { AIStatus } from "./types"

/** Modelo Flash padrão (rápido e barato). Troque por GEMINI_MODEL sem mexer no código. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

/** Tempo máximo de uma chamada ao modelo. */
export const DEFAULT_AI_TIMEOUT_MS = 45_000

export interface AIConfig {
  provider: "gemini"
  apiKey: string
  model: string
  timeoutMs: number
}

type Env = Record<string, string | undefined>

function assertServer() {
  if (typeof window !== "undefined") throw new Error("A configuração da LEXA IA só pode ser lida no servidor.")
}

/** `AI_ENABLED` ausente = ligada; só "false", "0" ou "off" desligam. */
export function isAIEnabled(env: Env = process.env) {
  const flag = env.AI_ENABLED?.trim().toLowerCase()
  return !(flag === "false" || flag === "0" || flag === "off")
}

export function getAIStatus(env: Env = process.env): AIStatus {
  assertServer()
  return { enabled: isAIEnabled(env), configured: !!env.GEMINI_API_KEY?.trim() }
}

/** Configuração válida ou erro com código conhecido (DISABLED, NOT_CONFIGURED). */
export function getAIConfig(env: Env = process.env): AIConfig {
  assertServer()
  if (!isAIEnabled(env)) throw new AIError("DISABLED")

  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new AIError("NOT_CONFIGURED")

  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  if (!/^[A-Za-z0-9._\-/]{3,80}$/.test(model)) throw new AIError("NOT_CONFIGURED", { message: "GEMINI_MODEL inválido." })

  const timeout = Number(env.AI_TIMEOUT_MS)
  return {
    provider: "gemini",
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeout) && timeout >= 5_000 ? timeout : DEFAULT_AI_TIMEOUT_MS,
  }
}
