/**
 * Regras da jurisprudência usadas pelas rotas: pesquisa a partir de um processo e
 * a frase de resultado. Só dados reais: o que o processo tem e o que a base devolve.
 */

import type { Process } from "@/types"
import type { JurisprudenceFilters } from "./types"

/** Área do processo (Íntegra) → área da base do STJ (Regimento Interno). */
const STJ_AREA: Partial<Record<Process["area"], string>> = {
  Cível: "Direito Privado",
  Família: "Direito Privado",
  Empresarial: "Direito Privado",
  Imobiliário: "Direito Privado",
  Previdenciário: "Direito Público",
}

/** Classes genéricas que não ajudam a achar decisões semelhantes. */
const GENERIC = /^(procedimento comum( c[íi]vel)?|procedimento do juizado especial( c[íi]vel)?|outros|n[ãa]o informad[oa])$/i

/** Palavras que aparecem em quase toda decisão e não dizem nada sobre o tema. */
const GENERIC_WORDS = new Set(["acao", "acoes", "processo", "procedimento", "comum", "civel", "civil", "outros", "outras", "especial", "ordinario", "ordinaria", "recurso", "pedido", "de", "da", "do", "das", "dos", "e"])

const fold = (word: string) => word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function withoutGenericWords(text: string) {
  return text
    .split(/\s+/)
    .filter((word) => !GENERIC_WORDS.has(fold(word)))
    .join(" ")
    .trim()
}

export interface RelatedQuery {
  text: string
  filters: JurisprudenceFilters
  /** O que foi usado, para a tela mostrar ("assunto: …"). */
  basis: string[]
  /** Por que não dá para pesquisar (sem nenhum dado útil). */
  missing?: string
}

/**
 * Termos de pesquisa a partir do que o processo REALMENTE tem: assunto (da fonte),
 * tipo de ação e classe (quando específica). A área do processo vira filtro quando há
 * correspondência na base. Trabalhista não tem correspondência no STJ.
 */
export function relatedQueryForProcess(process: Pick<Process, "subject" | "type" | "className" | "area">): RelatedQuery {
  const basis: string[] = []
  const terms: string[] = []
  const add = (label: string, value?: string) => {
    const original = value?.replace(/\s+/g, " ").trim()
    if (!original || GENERIC.test(original)) return
    // "Ação de alimentos" → "alimentos": palavras genéricas casariam com qualquer decisão.
    const text = withoutGenericWords(original)
    if (!text || terms.some((t) => t.toLowerCase() === text.toLowerCase())) return
    terms.push(text)
    basis.push(`${label}: ${original}`)
  }
  add("assunto", process.subject)
  add("tipo de ação", process.type)
  add("classe", process.className)
  const area = STJ_AREA[process.area]
  const filters: JurisprudenceFilters = area ? { area } : {}
  if (area) basis.push(`área: ${area}`)
  return {
    text: terms.join(" ").slice(0, 300),
    filters,
    basis,
    missing: terms.length ? undefined : "O processo não tem assunto nem tipo de ação para orientar a pesquisa.",
  }
}

export function resultSentence(total: number) {
  if (total === 0) return "Nenhuma decisão encontrada na base para estes termos."
  return total === 1 ? "Encontramos 1 decisão potencialmente relevante." : `Encontramos ${total.toLocaleString("pt-BR")} decisões potencialmente relevantes.`
}
