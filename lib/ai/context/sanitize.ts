/**
 * Última barreira antes do modelo.
 *
 * Os context builders já montam o contexto campo a campo (lista branca). Esta
 * função é a rede de segurança: remove chaves sensíveis ou técnicas que
 * escaparem, mascara documentos pessoais e e-mails dentro de textos livres,
 * descarta vazios e limita o tamanho — menos tokens, menos exposição.
 */

/** Chaves que nunca vão para a IA, em qualquer nível. Comparação sem caixa e sem `_`/`-`. */
const BLOCKED_KEYS = new Set(
  [
    "password",
    "senha",
    "token",
    "accessToken",
    "refreshToken",
    "secret",
    "apiKey",
    "authorization",
    "cookie",
    "raw",
    "hash",
    "storagePath",
    "organizationId",
    "email",
    "phone",
    "telefone",
    "cpf",
    "cnpj",
    "document",
    "documento_pessoal",
    "address",
    "endereco",
    "birthDate",
    "avatarUrl",
    "url",
  ].map((key) => normalizeKey(key)),
)

function normalizeKey(key: string) {
  return key.replace(/[_-]/g, "").toLowerCase()
}

const MAX_STRING = 800
const MAX_ARRAY = 80
const MAX_DEPTH = 8

const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail omitido]"],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ omitido]"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF omitido]"],
]

export function maskSensitiveText(text: string) {
  return PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

function clean(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") {
    const text = maskSensitiveText(value.trim())
    if (!text) return undefined
    return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING - 1)}…` : text
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "boolean") return value
  if (depth >= MAX_DEPTH) return undefined
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY)
      .map((item) => clean(item, depth + 1))
      .filter((item) => item !== undefined)
    return items.length ? items : undefined
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (BLOCKED_KEYS.has(normalizeKey(key))) continue
      const cleaned = clean(item, depth + 1)
      if (cleaned !== undefined) result[key] = cleaned
    }
    return Object.keys(result).length ? result : undefined
  }
  return undefined
}

export function sanitizeAIContext<T>(context: T): T {
  return (clean(context, 0) ?? {}) as T
}
