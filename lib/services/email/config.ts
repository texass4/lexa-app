import { BRAND } from "@/lib/brand"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"

/**
 * Configuração do SMTP, lida só das variáveis de ambiente do servidor (`SMTP_*`,
 * nunca `NEXT_PUBLIC_`). Genérica: serve para qualquer provedor SMTP — nada aqui
 * assume host, porta ou provedor.
 */

export interface EmailConfig {
  host: string
  port: number
  /** TLS desde a conexão (`SMTP_SECURE=true`, normalmente porta 465); senão, STARTTLS. */
  secure: boolean
  user: string
  password: string
  from: { name: string; address: string }
}

type Env = Record<string, string | undefined>

const DEFAULT_PORT = 587
const REQUIRED_ENV = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"] as const

/** Variáveis obrigatórias que faltam (nomes, nunca valores). */
export function missingEmailEnv(env: Env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim())
}

function parseSecure(raw: string | undefined, port: number) {
  const value = raw?.trim().toLowerCase()
  if (!value) return port === 465
  if (value === "true") return true
  if (value === "false") return false
  return null
}

/**
 * O que impede a configuração de valer, em texto para o log (nomes das variáveis,
 * nunca valores), ou undefined se estiver tudo certo.
 */
export function emailConfigProblem(env: Env = process.env): string | undefined {
  const missing = missingEmailEnv(env)
  if (missing.length) return `faltam ${missing.join(", ")}`
  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT.trim()) : DEFAULT_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "SMTP_PORT inválida"
  if (parseSecure(env.SMTP_SECURE, port) === null) return 'SMTP_SECURE deve ser "true" ou "false"'
  if (!isEmail(normalizeEmail(env.SMTP_FROM_EMAIL!))) return "SMTP_FROM_EMAIL inválido"
  return undefined
}

/** Configuração completa e válida, ou null. */
export function getEmailConfig(env: Env = process.env): EmailConfig | null {
  if (emailConfigProblem(env)) return null
  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT.trim()) : DEFAULT_PORT
  return {
    host: env.SMTP_HOST!.trim(),
    port,
    secure: parseSecure(env.SMTP_SECURE, port)!,
    user: env.SMTP_USER!.trim(),
    password: env.SMTP_PASSWORD!.trim(),
    from: {
      name: env.SMTP_FROM_NAME?.replace(/[\r\n"]+/g, " ").trim() || BRAND.name,
      address: normalizeEmail(env.SMTP_FROM_EMAIL!),
    },
  }
}

export const isEmailConfigured = (env: Env = process.env) => getEmailConfig(env) !== null
