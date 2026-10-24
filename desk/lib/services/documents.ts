import { docToText, extractRefs, validateDoc, type DocNode } from "@/lib/domain/doc"
import type { Ref } from "@/lib/domain/refs"
import { invalid } from "./errors"

const MAX_DOC_BYTES = 2_000_000

/** Valida o documento recebido do editor e calcula o que é derivado dele (texto e referências). */
export function prepareDoc(content: unknown): { doc: DocNode; text: string; refs: Ref[] } {
  const size = JSON.stringify(content ?? null).length
  if (size > MAX_DOC_BYTES) throw invalid("O documento ficou grande demais para salvar de uma vez (limite de 2 MB).")
  const result = validateDoc(content)
  if (!result.ok) throw invalid(result.error)
  return { doc: result.doc, text: docToText(result.doc), refs: extractRefs(result.doc) }
}

/** Resultado de um salvamento automático. `conflict` traz a versão que está no banco. */
export type SaveResult =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; conflict: true; version: number; content: DocNode; updatedAt: string }
