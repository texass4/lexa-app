import type { z } from "zod"
import { firstIssue } from "@/lib/validation"
import { invalid } from "./errors"

/** Valida a entrada com o esquema e devolve os dados já tipados, ou lança erro legível. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value)
  if (!result.success) throw invalid(firstIssue(result.error))
  return result.data
}

/** Remove chaves `undefined` (campos não enviados não são alterados). */
export function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}
