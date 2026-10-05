import { HttpError } from "@/lib/auth/http-error"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { keyed } from "./secret"

/**
 * Limite de tentativas dos fluxos públicos de conta. A contagem fica no banco
 * (`auth_rate_hit`, migração 0015), então vale com várias instâncias do servidor;
 * a chave guardada é um HMAC da regra + IP/e-mail, nunca o valor em texto.
 * Sem a migração (ou com o banco fora), cai para a memória da instância — mais fraco,
 * mas nunca sem limite.
 */

export interface RateRule {
  id: string
  limit: number
  windowSeconds: number
}

const HOUR = 3600
const envLimit = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export const LIMITS = {
  /** Desafios anti-bot emitidos por IP. */
  challengeIp: { id: "challenge:ip", limit: 60, windowSeconds: 600 },
  /** Cada desafio vale para um envio só. */
  challengeUse: { id: "challenge:used", limit: 1, windowSeconds: 2 * HOUR },
  signupIp: { id: "signup:ip", limit: 5, windowSeconds: HOUR },
  signupIpDay: { id: "signup:ip:day", limit: 20, windowSeconds: 24 * HOUR },
  signupEmail: { id: "signup:email", limit: 3, windowSeconds: HOUR },
  /** Teto do sistema inteiro: segura um ataque distribuído por muitos IPs. */
  signupGlobal: { id: "signup:global", limit: envLimit("AUTH_SIGNUP_GLOBAL_PER_HOUR", 200), windowSeconds: HOUR },
  recoverIp: { id: "recover:ip", limit: 10, windowSeconds: HOUR },
  recoverEmail: { id: "recover:email", limit: 3, windowSeconds: HOUR },
  resendIp: { id: "resend:ip", limit: 10, windowSeconds: HOUR },
  resendEmail: { id: "resend:email", limit: 3, windowSeconds: HOUR },
  /** Convites (quem convida descobre se o e-mail já tem conta: com limite, não vira varredura). */
  inviteUser: { id: "invite:user", limit: 30, windowSeconds: HOUR },
  inviteOrg: { id: "invite:org", limit: 100, windowSeconds: 24 * HOUR },
  emailChangeUser: { id: "email-change:user", limit: 5, windowSeconds: HOUR },
} satisfies Record<string, RateRule>

export const TOO_MANY = "Muitas tentativas. Aguarde alguns minutos e tente de novo."

/** true = ainda dentro do limite. */
export type RateStore = (key: string, limit: number, windowSeconds: number) => Promise<boolean>

const memory = new Map<string, { start: number; hits: number }>()

export const memoryStore: RateStore = async (key, limit, windowSeconds) => {
  const now = Date.now()
  const entry = memory.get(key)
  const current = !entry || now - entry.start >= windowSeconds * 1000 ? { start: now, hits: 0 } : entry
  current.hits += 1
  memory.set(key, current)
  if (memory.size > 50_000) for (const [k, v] of memory) if (now - v.start > 24 * HOUR * 1000) memory.delete(k)
  return current.hits <= limit
}

let warned = false
const databaseStore: RateStore = async (key, limit, windowSeconds) => {
  const { data, error } = await getSupabaseAdmin().rpc("auth_rate_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
  if (error || typeof data !== "boolean") {
    if (!warned) {
      warned = true
      console.error("[LEXA · proteção] Limite no banco indisponível (rode a migração 0015); usando a memória da instância.", error?.message)
    }
    return memoryStore(key, limit, windowSeconds)
  }
  return data
}

let store: RateStore = databaseStore

export function setRateStoreForTests(next: RateStore | undefined) {
  store = next ?? databaseStore
  memory.clear()
}

/** Conta uma tentativa. `subject` é o IP, o e-mail, o id… (vazio vira um balde comum). */
export function allow(rule: RateRule, subject: string | undefined) {
  return store(keyed(`rate:${rule.id}`, subject?.trim().toLowerCase() || "-"), rule.limit, rule.windowSeconds)
}

/**
 * Conta todas as regras (nenhuma é pulada: errar uma não "economiza" as outras) e
 * recusa com 429 se qualquer uma passou do limite. A mensagem é a mesma para tudo.
 */
export async function enforce(...checks: [RateRule, string | undefined][]) {
  const results = await Promise.all(checks.map(([rule, subject]) => allow(rule, subject)))
  if (results.some((ok) => !ok)) throw new HttpError(429, TOO_MANY)
}
