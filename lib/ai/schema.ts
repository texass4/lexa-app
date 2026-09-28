/**
 * Schemas das respostas estruturadas, definidos uma única vez.
 *
 * Cada schema gera o JSON Schema enviado ao modelo (`json`) e valida o que
 * volta (`parse`). Nada de parsing de texto: se o objeto não bate com o
 * contrato, a resposta é descartada com INVALID_RESPONSE.
 */

import { fold } from "@/lib/format"

export type JsonSchema = Record<string, unknown>

export class SchemaError extends Error {
  constructor(path: string, expected: string) {
    super(`${path || "resposta"}: esperado ${expected}`)
    this.name = "SchemaError"
  }
}

export interface Schema<T> {
  json: JsonSchema
  parse(value: unknown, path?: string): T
}

export type Infer<S> = S extends Schema<infer T> ? T : never

const withDescription = (json: JsonSchema, description?: string) => (description ? { ...json, description } : json)

/** Texto sem bordas, cortado em `max` caracteres. `min` 0 aceita vazio. */
export function string({ description, max = 1200, min = 0 }: { description?: string; max?: number; min?: number } = {}): Schema<string> {
  return {
    json: withDescription({ type: "string" }, description),
    parse(value, path = "") {
      if (typeof value !== "string") throw new SchemaError(path, "texto")
      const text = value.trim()
      if (text.length < min) throw new SchemaError(path, "texto preenchido")
      return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
    },
  }
}

/** Um dos valores permitidos; tolera maiúsculas e acentos ("Média" → "media"). */
export function oneOf<const T extends string>(values: readonly T[], { description }: { description?: string } = {}): Schema<T> {
  const byFolded = new Map(values.map((v) => [fold(v), v]))
  return {
    json: withDescription({ type: "string", enum: [...values] }, description),
    parse(value, path = "") {
      const match = typeof value === "string" ? byFolded.get(fold(value)) : undefined
      if (!match) throw new SchemaError(path, values.join(" | "))
      return match
    },
  }
}

/** Lista cortada em `max` itens; itens de texto vazios são descartados. */
export function array<T>(item: Schema<T>, { description, max = 12 }: { description?: string; max?: number } = {}): Schema<T[]> {
  return {
    json: withDescription({ type: "array", items: item.json, maxItems: max }, description),
    parse(value, path = "") {
      if (!Array.isArray(value)) throw new SchemaError(path, "lista")
      return value
        .slice(0, max)
        .map((entry, i) => item.parse(entry, `${path}[${i}]`))
        .filter((entry) => entry !== "")
    },
  }
}

export function object<S extends Record<string, Schema<unknown>>>(
  shape: S,
  { description }: { description?: string } = {},
): Schema<{ [K in keyof S]: Infer<S[K]> }> {
  const keys = Object.keys(shape)
  return {
    json: withDescription(
      {
        type: "object",
        properties: Object.fromEntries(keys.map((key) => [key, shape[key].json])),
        required: keys,
      },
      description,
    ),
    parse(value, path = "") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new SchemaError(path, "objeto")
      const record = value as Record<string, unknown>
      const result: Record<string, unknown> = {}
      for (const key of keys) result[key] = shape[key].parse(record[key], path ? `${path}.${key}` : key)
      return result as { [K in keyof S]: Infer<S[K]> }
    },
  }
}
