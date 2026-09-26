/**
 * Verificação da resposta contra os dados enviados.
 *
 * O prompt proíbe inventar — isto confere. Referências que não existem são
 * removidas (e itens que dependiam só delas, descartados); datas e prazos em
 * dias que não aparecem nos dados geram um aviso visível na interface.
 */

import type { AISources, ReferencedNote } from "./types"

const REF_IN_TEXT = /\[([A-Z]\d{1,3})\]/g

/** Mantém só referências conhecidas, sem repetição. */
export function keepKnownRefs(refs: string[], sources: AISources) {
  return [...new Set(refs.map((ref) => ref.trim().replace(/^\[|\]$/g, "").toUpperCase()))].filter((ref) => ref in sources)
}

/** Notas cuja referência não existe são descartadas — seria um registro inventado. */
export function keepKnownNotes(notes: ReferencedNote[], sources: AISources) {
  return notes
    .map((note) => ({ ...note, ref: note.ref.trim().replace(/^\[|\]$/g, "").toUpperCase() }))
    .filter((note) => note.ref in sources)
}

/** Remove de um texto livre as citações "[X9]" que não existem. */
export function stripUnknownRefs(text: string, sources: AISources) {
  return text.replace(REF_IN_TEXT, (match, ref: string) => (ref in sources ? match : ""))
}

/** Referências citadas num texto livre, na ordem em que aparecem. */
export function refsInText(text: string, sources: AISources) {
  return [...new Set([...text.matchAll(REF_IN_TEXT)].map((m) => m[1]))].filter((ref) => ref in sources)
}

/** Todos os textos de um valor (profundidade qualquer). */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out))
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out))
  return out
}

const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g
/** "prazo de 15 dias", "5 dias para responder", "10 dias úteis". */
const DAY_COUNT =
  /\bprazo\s+(?:legal\s+)?(?:de|é\s+de)\s+\d{1,3}\s+dias?\b|\b\d{1,3}\s+dias?(?:\s+(?:úteis|uteis|corridos))?\s+(?:para|a\s+partir|a\s+contar)\b|\b\d{1,3}\s+dias?\s+(?:úteis|uteis)/gi

const normDate = (d: string, m: string, y: string) => `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`

/**
 * Avisos para datas e contagens de prazo que a resposta menciona mas que não
 * estão nos dados. `contextText` é o JSON exato enviado ao modelo.
 */
export function groundingWarnings(output: unknown, contextText: string): string[] {
  const text = collectStrings(output).join("\n")
  const known = new Set([...contextText.matchAll(DATE)].map((m) => normDate(m[1], m[2], m[3])))
  const warnings: string[] = []

  const unknownDates = [...new Set([...text.matchAll(DATE)].map((m) => normDate(m[1], m[2], m[3])))].filter((d) => !known.has(d))
  if (unknownDates.length) {
    warnings.push(`A resposta menciona data(s) que não constam nos dados do LEXA (${unknownDates.join(", ")}). Confira antes de usar.`)
  }

  const lowerContext = contextText.toLowerCase()
  const dayCounts = [...text.matchAll(DAY_COUNT)].map((m) => m[0].trim()).filter((phrase) => !lowerContext.includes(phrase.toLowerCase()))
  if (dayCounts.length) {
    warnings.push(`A resposta menciona contagem de prazo ("${dayCounts[0]}") que não vem dos dados do LEXA. Prazos processuais devem ser conferidos pelo advogado.`)
  }

  return warnings
}
