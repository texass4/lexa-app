/**
 * Conferência das citações de jurisprudência na resposta da IA — depois do modelo,
 * contra o texto REAL da base. O prompt proíbe inventar; isto confere:
 *
 * - trecho dito "literal" tem de estar, palavra por palavra, na ementa, na tese, no
 *   assunto ou no texto da decisão citada (espaços e maiúsculas à parte; "[…]" separa
 *   partes). Não confere → vira paráfrase, com nota;
 * - número de recurso/processo/súmula/tema citado que não está nos dados → aviso;
 * - "entendimento consolidado/pacífico" e "continua vigente" → aviso: a base não
 *   permite afirmar nenhum dos dois.
 */

import { collectStrings } from "./grounding"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"

const QUOTES = /^[\s"“”'‘’«»]+|[\s"“”'‘’«»]+$/g
const norm = (text: string) =>
  text
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

/** O trecho está, literalmente, em algum dos textos? Partes separadas por "[…]" ou "…" valem em ordem. */
export function verifyLiteral(quote: string, texts: (string | undefined)[]): boolean {
  const parts = quote
    .replace(QUOTES, "")
    .split(/\s*(?:\[\s*(?:…|\.\.\.)\s*\]|…|\.\.\.)\s*/)
    .map((p) => norm(p).replace(/[.;,:]+$/, ""))
    .filter((p) => p.length >= 8)
  if (!parts.length) return false
  return texts.some((text) => {
    if (!text) return false
    const hay = norm(text)
    let from = 0
    for (const part of parts) {
      const at = hay.indexOf(part, from)
      if (at < 0) return false
      from = at + part.length
    }
    return true
  })
}

export const decisionTexts = (d: JurisprudenceDecision) => [d.ementa, d.thesis, d.subject, d.decisionText]

/** Recurso, processo, súmula ou tema citado com número. */
const CITATION = /\b(?:REsp|AREsp|AgInt|AgRg|EDcl|EREsp|ERESP|HC|RHC|RMS|MS|RE|ARE|ADI|ADPF|Tema|S[úu]mula)(?:\s+(?:no|na|nos)\s+\w+)*\s*(?:n[º°o.]?\s*)?\d[\d.]*(?:\/[A-Z]{2})?/gi
/** Número CNJ (com ou sem pontuação). */
const CNJ_NUMBER = /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g

const digits = (text: string) => text.replace(/\D/g, "")

/** Citações com número que NÃO aparecem nos dados enviados ao modelo. */
export function unknownCitations(output: unknown, contextText: string): string[] {
  const known = digits(contextText)
  const knownNumbers = new Set([...contextText.matchAll(/\d[\d./-]{3,}\d/g)].map((m) => digits(m[0])))
  const found: string[] = []
  for (const text of collectStrings(output)) {
    for (const match of [...text.matchAll(CITATION), ...text.matchAll(CNJ_NUMBER)]) {
      const number = digits(match[0])
      if (number.length < 2) continue
      if (knownNumbers.has(number) || (number.length >= 6 && known.includes(number))) continue
      const citation = match[0].trim().replace(/[.,;:]+$/, "")
      if (!found.includes(citation)) found.push(citation)
    }
  }
  return found
}

const CONSOLIDATED = /\b(entendimento|jurisprud[eê]ncia|orienta[cç][aã]o|posi[cç][aã]o)\s+(?:\w+\s+){0,2}(consolidad[oa]|pac[ií]fic[oa]|dominante|firme|majorit[aá]ri[oa]|uniforme|sedimentad[oa])/i
const STILL_VALID = /\b(continua|permanece|segue|está|esta)\s+(vigente|v[aá]lid[oa]|em vigor)\b/i

/** Avisos da conferência das citações (aparecem na tela junto da análise). */
export function citationWarnings(output: unknown, contextText: string): string[] {
  const warnings: string[] = []
  const unknown = unknownCitations(output, contextText)
  if (unknown.length) {
    warnings.push(`A resposta menciona ${unknown.length === 1 ? "uma citação" : "citações"} que não ${unknown.length === 1 ? "está" : "estão"} entre as decisões recuperadas (${unknown.slice(0, 3).join("; ")}). Desconsidere ou confira na fonte oficial.`)
  }
  const text = collectStrings(output).join("\n")
  if (CONSOLIDATED.test(text)) warnings.push("A resposta fala em entendimento consolidado/pacífico: as decisões encontradas na base não bastam para afirmar isso.")
  if (STILL_VALID.test(text)) warnings.push("A resposta afirma que um entendimento continua vigente: a base não registra reforma, superação ou decisões posteriores — confira.")
  return warnings
}
