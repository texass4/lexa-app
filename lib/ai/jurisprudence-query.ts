/**
 * Etapa 1 da recuperação de jurisprudência para a IA: a pergunta vira um PLANO de
 * pesquisa — conceitos jurídicos, cada um com as variantes que serão procuradas.
 *
 * Etapa separada e verificável: nada aqui consulta banco nem modelo. A pergunta
 * original fica guardada (`original`) para diagnóstico; o que vai à base são só os
 * conceitos. Sem IA, sem embeddings: dicionário revisável (`jurisprudence-terms.ts`)
 * + palavras da própria pergunta, com singular/plural.
 */

import { type LegalBranch, type LegalConcept, LEGAL_CONCEPTS, QUESTION_WORDS, SHORT_TERMS } from "./jurisprudence-terms"

/* ------------------------------ texto normalizado ------------------------------ */

const STOP = new Set("a o as os e de da do das dos em na no nas nos para por com ao aos um uma sem sob que se pelo pela pelos pelas".split(" "))

/** Minúsculas e sem acento: "Negativação" → "negativacao". */
export const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Singular aproximado, igual dos dois lados (pergunta e decisão): "danos morais" e
 * "dano moral" ficam iguais. Regras só de plural — derivação ("contrato" ×
 * "contratual") fica a cargo do dicionário, que é revisável.
 */
export function singular(word: string): string {
  if (word.length <= 3 || SHORT_TERMS.has(word)) return word
  if (word.length > 4) {
    if (/(oes|aes)$/.test(word)) return `${word.slice(0, -3)}ao`
    const lateral = /(a|e|o|u)is$/.exec(word)
    if (lateral) return `${word.slice(0, -2)}l`
    if (/(r|z)es$/.test(word)) return word.slice(0, -2)
  }
  if (word.endsWith("ns")) return `${word.slice(0, -2)}m`
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

/** Plural aproximado de uma palavra no singular (para a base achar as duas formas). */
export function plural(word: string): string {
  if (SHORT_TERMS.has(word)) return word
  if (word.endsWith("ao")) return `${word.slice(0, -2)}oes`
  if (/[aeou]l$/.test(word)) return `${word.slice(0, -1)}is`
  if (word.endsWith("m")) return `${word.slice(0, -1)}ns`
  if (/[rzs]$/.test(word)) return `${word}es`
  return `${word}s`
}

/** Palavras do texto, sem acento, no singular, sem palavras vazias ("de", "na"…). */
export function words(text: string | undefined): string[] {
  if (!text) return []
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(singular)
}

/** `needle` aparece em `haystack` como sequência contígua (frase). */
export function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

/* ------------------------------------ plano ------------------------------------ */

export interface PlannedConcept {
  key: string
  label: string
  /** O que vai para a base (grafia usual; o banco tira acento e reduz as palavras). */
  variants: string[]
  /** Variantes exatas, normalizadas, para conferir na aplicação. */
  variantWords: string[][]
  /** Formas mais amplas, normalizadas (valem metade, salvo `broadIsExact`). */
  broaderWords: string[][]
  /** A pergunta usou a forma ampla ("medicamento"): ela vale como exata. */
  broadIsExact: boolean
  /** 1 = conceito do dicionário; 0,75 = palavra da pergunta; 0,5 = conceito genérico. */
  weight: number
  branches?: LegalBranch[]
  source: "dicionario" | "pergunta"
  weak: boolean
  /** Pode ir para o log (não parece nome próprio nem número). */
  loggable: boolean
}

export interface QueryPlan {
  /** A pergunta como a pessoa escreveu — só para diagnóstico, não vai à base. */
  original: string
  /** O tema, sem as palavras do pedido ("há jurisprudência sobre…"). */
  terms: string
  /** O tema normalizado (sem acento, singular, sem palavras vazias). */
  normalized: string
  concepts: PlannedConcept[]
  /** Palavras deixadas de fora para a consulta não ficar ampla demais. */
  dropped: string[]
  /** Ramos do Direito compatíveis com a pergunta (interseção dos conceitos; vazio = sem sinal). */
  branches?: LegalBranch[]
  /** A pessoa pediu decisões recentes: a data passa a ser critério, depois da pertinência. */
  wantsRecent: boolean
  /** Grupos enviados à base: um por conceito, com as variantes. */
  groups: string[][]
}

/** Um conceito do dicionário pronto para a pesquisa e a classificação. */
export function plannedConcept(concept: LegalConcept, broadIsExact = false): PlannedConcept {
  return {
    key: concept.key,
    label: concept.label,
    variants: [...concept.variants, ...(concept.broader ?? [])],
    variantWords: concept.variants.map(words).filter((v) => v.length),
    broaderWords: (concept.broader ?? []).map(words).filter((v) => v.length),
    broadIsExact,
    weight: concept.weak ? 0.5 : 1,
    branches: concept.branches,
    source: "dicionario",
    weak: !!concept.weak,
    loggable: true,
  }
}

/** Mais que isso e a pesquisa vira "qualquer coisa": o resto fica de fora (e no log). */
export const MAX_CONCEPTS = 6

const RECENT = /\b(recente|recentes|ultim[oa]s?|atua(l|is)|mais nov[oa]s?|atualizad[oa]s?)\b/

const DICTIONARY = LEGAL_CONCEPTS.flatMap((concept) => [
  ...concept.variants.map((variant) => ({ concept, tokens: words(variant), broad: false })),
  ...(concept.broader ?? []).map((variant) => ({ concept, tokens: words(variant), broad: true })),
]).sort((a, b) => b.tokens.length - a.tokens.length || Number(a.broad) - Number(b.broad))

/**
 * `question`: a última pergunta da pessoa (guardada como está). `terms`: o tema já
 * sem as palavras do pedido — normalmente `searchTermsFrom(question)`; num processo
 * sem tema na pergunta, o assunto/tipo do processo.
 */
export function planQuery(question: string, terms: string): QueryPlan {
  const rawTokens = terms
    .split(/[^\p{L}\p{N}-]+/u)
    .flatMap((t) => t.split("-"))
    .filter(Boolean)
  const tokens = words(terms)
  const consumed = new Set<number>()
  const concepts: PlannedConcept[] = []
  const dropped: string[] = []

  // 1. Conceitos do dicionário — variante mais longa primeiro ("responsabilidade civil do
  //    médico" antes de "responsabilidade civil").
  for (const { concept, tokens: needle, broad } of DICTIONARY) {
    if (!needle.length) continue
    for (let i = 0; i <= tokens.length - needle.length; i += 1) {
      if (needle.some((w, j) => tokens[i + j] !== w || consumed.has(i + j))) continue
      needle.forEach((_, j) => consumed.add(i + j))
      const existing = concepts.find((c) => c.key === concept.key)
      if (existing) {
        if (!broad) existing.broadIsExact = false
        continue
      }
      concepts.push(plannedConcept(concept, broad))
    }
  }

  // 2. Palavras da pergunta que o dicionário não cobre (com singular e plural).
  const original = new Map(rawTokens.map((raw) => [singular(fold(raw)), raw]))
  const firstWord = singular(fold(question.trim().split(/\s+/)[0] ?? ""))
  tokens.forEach((word, i) => {
    if (consumed.has(i) || QUESTION_WORDS.has(word) || /^\d+$/.test(word)) return
    if (word.length < 4 && !SHORT_TERMS.has(word)) return
    if (concepts.some((c) => c.key === `termo:${word}`)) return
    const raw = original.get(word) ?? word
    const forms = [...new Set([raw, word, plural(word)])]
    concepts.push({
      key: `termo:${word}`,
      label: raw,
      variants: forms,
      variantWords: [[word]],
      broaderWords: [],
      broadIsExact: false,
      weight: 0.75,
      source: "pergunta",
      weak: false,
      // Palavra com maiúscula no meio da frase pode ser nome de pessoa ou empresa.
      loggable: !(/^\p{Lu}/u.test(raw) && word !== firstWord && !SHORT_TERMS.has(word)),
    })
  })

  // 3. Teto: conceitos do dicionário têm prioridade sobre palavras soltas.
  const ordered = [...concepts.filter((c) => c.source === "dicionario"), ...concepts.filter((c) => c.source === "pergunta")]
  const kept = ordered.slice(0, MAX_CONCEPTS)
  for (const c of ordered.slice(MAX_CONCEPTS)) dropped.push(c.label)

  // Ramos compatíveis com todos os conceitos que indicam ramo; conflito = sem sinal.
  let branches: LegalBranch[] | undefined
  for (const c of kept) {
    if (!c.branches?.length) continue
    branches = branches ? branches.filter((b) => c.branches!.includes(b)) : [...c.branches]
  }
  return {
    original: question,
    terms,
    normalized: tokens.join(" "),
    concepts: kept,
    dropped,
    branches: branches?.length ? branches : undefined,
    wantsRecent: RECENT.test(fold(question)),
    groups: kept.map((c) => c.variants),
  }
}

/** O que do plano pode ir para o log: conceitos e palavras, sem nomes próprios nem números. */
export const loggableQuery = (plan: QueryPlan) => plan.concepts.map((c) => (c.loggable ? c.label : "[omitido]")).join(" + ")
