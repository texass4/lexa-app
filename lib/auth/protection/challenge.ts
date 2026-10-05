import { randomBytes, timingSafeEqual } from "node:crypto"
import { keyed } from "./secret"
import { meetsDifficulty } from "./pow"

/**
 * Desafio anti-bot dos formulários públicos (cadastro, recuperação de senha,
 * reenvio da confirmação). O servidor emite um desafio assinado; o navegador resolve
 * a prova de trabalho (`pow.ts`) enquanto a pessoa preenche; o envio precisa trazer
 * o desafio e a solução. Sem estado no servidor: a assinatura garante que o desafio
 * veio daqui, a idade barra envio instantâneo (script) e reaproveitamento antigo, e o
 * uso único é marcado no limite (`LIMITS.challengeUse`).
 */

export type ChallengePurpose = "signup" | "recover" | "resend"

const PURPOSES: ChallengePurpose[] = ["signup", "recover", "resend"]

export const CHALLENGE_MIN_AGE_MS = 2_500
export const CHALLENGE_MAX_AGE_MS = 30 * 60_000

function challengeDifficulty() {
  const value = Number(process.env.AUTH_POW_DIFFICULTY)
  return Number.isInteger(value) && value >= 8 && value <= 24 ? value : 17
}

export interface IssuedChallenge {
  token: string
  difficulty: number
  /** Espera mínima antes do envio (o navegador aguarda sozinho). */
  minDelayMs: number
}

export function issueChallenge(purpose: ChallengePurpose, now = Date.now()): IssuedChallenge {
  const difficulty = challengeDifficulty()
  const body = `${purpose}.${now.toString(36)}.${randomBytes(12).toString("base64url")}.${difficulty}`
  return { token: `${body}.${keyed("challenge", body)}`, difficulty, minDelayMs: CHALLENGE_MIN_AGE_MS }
}

export type ChallengeCheck = { ok: true; id: string } | { ok: false; reason: "invalid" | "expired" | "too_fast" | "work" }

export function checkChallenge(token: unknown, solution: unknown, purpose: ChallengePurpose, now = Date.now()): ChallengeCheck {
  if (typeof token !== "string" || typeof solution !== "string" || token.length > 300) return { ok: false, reason: "invalid" }
  const parts = token.split(".")
  if (parts.length !== 5) return { ok: false, reason: "invalid" }
  const [kind, issuedAt, id, bits, signature] = parts
  const body = parts.slice(0, 4).join(".")
  const expected = Buffer.from(keyed("challenge", body))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" }
  if (kind !== purpose || !PURPOSES.includes(kind as ChallengePurpose)) return { ok: false, reason: "invalid" }
  const age = now - parseInt(issuedAt, 36)
  if (!Number.isFinite(age) || age > CHALLENGE_MAX_AGE_MS || age < -60_000) return { ok: false, reason: "expired" }
  if (age < CHALLENGE_MIN_AGE_MS) return { ok: false, reason: "too_fast" }
  // A dificuldade vale a do momento da emissão (assinada), não a atual.
  if (!meetsDifficulty(token, solution, Number(bits))) return { ok: false, reason: "work" }
  return { ok: true, id }
}
