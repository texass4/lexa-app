/**
 * Etapa 2 da recuperação de jurisprudência para a IA: classificar as candidatas
 * devolvidas pela base (`jurisprudence_ai_candidates`) por PERTINÊNCIA à pergunta.
 *
 * Pontuação rastreável — cada decisão sai com o detalhe de onde cada conceito foi
 * encontrado e quanto valeu:
 *
 *   por conceito (vale o melhor campo) × peso do conceito
 *     assunto ou ementa ......... 3      tese ...................... 2
 *     termos auxiliares/classe .. 1,5    só no texto integral ...... 0,5
 *     + 1 se a frase do conceito aparece inteira no assunto, ementa ou tese
 *     forma mais ampla do conceito ("medicamento" × "fornecimento de medicamento"): metade
 *   ramo do Direito compatível com a pergunta: + 1 · incompatível: pontuação × 0,5
 *   pontuação = 100 × obtido ÷ máximo possível para esta pergunta (0–100)
 *
 * Classificação:
 *   - descartada: nenhum conceito fora do texto integral; só conceitos genéricos;
 *     abaixo do limiar; outra decisão do mesmo processo; assunto repetido demais;
 *   - diretamente pertinente: pontuação ≥ limiar direto E os conceitos aparecem no
 *     assunto/ementa/tese/termos (cobertura mínima);
 *   - relacionada: passou do limiar, mas não sustenta conclusão sozinha.
 *
 * A data é só desempate (ou segundo critério, quando a pessoa pede decisões recentes).
 * Ter todas as palavras em algum lugar do texto NÃO torna a decisão pertinente.
 */

import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import { AREA_BRANCH, type LegalBranch, SUBJECT_BRANCH } from "./jurisprudence-terms"
import { containsPhrase, fold, loggableQuery, type PlannedConcept, type QueryPlan, words } from "./jurisprudence-query"

/** Calibráveis: mudou aqui, rode `npm test` e o script de avaliação contra a base real. */
export const RELEVANCE = {
  points: { summary: 3, thesis: 2, auxiliary: 1.5, fullText: 0.5 },
  /** Forma mais ampla do conceito vale esta fração. */
  broadFactor: 0.5,
  phraseBonus: 1,
  branchBonus: 1,
  branchMismatchFactor: 0.5,
  /** Abaixo disso, a decisão não vai à IA. */
  minScore: 35,
  /** A partir disso (e com cobertura), "diretamente pertinente". */
  directScore: 60,
  /** Parte dos conceitos (pelo peso) que precisa estar fora do texto integral para ser direta. */
  directCoverage: 0.6,
  /** No máximo N decisões com o mesmo assunto entre as selecionadas. */
  maxPerSubject: 2,
  /** Quantas decisões vão à IA. */
  maxForAI: 5,
  /** Das que vão à IA, no máximo N "relacionadas". */
  maxRelated: 3,
  /** Tamanho máximo do trecho literal enviado. */
  excerptChars: 450,
} as const

export type Field = "assunto" | "ementa" | "tese" | "termos auxiliares" | "texto integral"

export interface Candidate {
  decision: JurisprudenceDecision
  /**
   * Conceitos (índice no plano, a partir de 0) que o banco encontrou em cada parte do
   * índice: A = assunto + ementa; B = tese, classe, termos auxiliares; C = texto da
   * decisão. Vem do redutor de palavras do Postgres e complementa a conferência feita aqui.
   */
  db?: { a: number[]; b: number[]; c: number[] }
}

export interface ConceptScore {
  concept: string
  field: Field | null
  points: number
  phrase: boolean
  /** Achado só pela forma mais ampla (vale metade). */
  broad: boolean
}

export interface Ranked {
  decision: JurisprudenceDecision
  level: "direta" | "relacionada"
  score: number
  breakdown: ConceptScore[]
  branch?: { question: LegalBranch[]; decision: LegalBranch; match: boolean }
  /** Trecho LITERAL (cópia exata) da ementa ou da tese que mais se relaciona com a pergunta. */
  excerpt?: { field: "ementa" | "tese"; text: string; cut: boolean }
  /** Conceitos encontrados fora do texto integral. */
  matched: string[]
}

export interface Discarded {
  id: string
  score: number
  reason: string
}

export interface RankingResult {
  /** Vão à IA: diretas primeiro, depois relacionadas. */
  selected: Ranked[]
  /** Aprovadas que não couberam (limite de quantidade). */
  overflow: Ranked[]
  discarded: Discarded[]
  stats: { candidates: number; approved: number; direct: number; related: number }
}

const SUMMARY_FIELDS = new Set<Field>(["assunto", "ementa", "tese", "termos auxiliares"])

interface FieldText {
  field: Field
  words: string[]
}

function fieldsOf(d: JurisprudenceDecision): FieldText[] {
  return [
    { field: "assunto", words: words(d.subject) },
    { field: "ementa", words: words(d.ementa) },
    { field: "tese", words: words(d.thesis) },
    { field: "termos auxiliares", words: words([d.keywords, d.className].filter(Boolean).join(" ")) },
    { field: "texto integral", words: words(d.decisionText) },
  ]
}

const POINTS: Record<Field, number> = {
  assunto: RELEVANCE.points.summary,
  ementa: RELEVANCE.points.summary,
  tese: RELEVANCE.points.thesis,
  "termos auxiliares": RELEVANCE.points.auxiliary,
  "texto integral": RELEVANCE.points.fullText,
}

type Found = "phrase" | "words" | "broad"

/** O conceito aparece no campo: frase inteira, palavras soltas, só a forma ampla ou não aparece. */
function matchIn(field: string[], concept: PlannedConcept): Found | null {
  if (!field.length) return null
  const set = new Set(field)
  const has = (variant: string[]) => (variant.length === 1 ? set.has(variant[0]) : containsPhrase(field, variant))
  let loose = false
  for (const variant of concept.variantWords) {
    if (has(variant)) return "phrase"
    if (variant.length > 1 && variant.every((w) => set.has(w))) loose = true
  }
  if (loose) return "words"
  return concept.broaderWords.some(has) ? "broad" : null
}

/** Ramo da decisão: cabeçalho do assunto ("TRIBUTÁRIO. …") e, sem ele, a área da base. */
export function decisionBranch(d: Pick<JurisprudenceDecision, "subject" | "ementa" | "area">): LegalBranch | undefined {
  const head = fold((d.subject ?? d.ementa).split(/[.;]/)[0] ?? "").trim()
  for (const [pattern, branch] of SUBJECT_BRANCH) if (pattern.test(head)) return branch
  return d.area ? AREA_BRANCH[d.area] : undefined
}

function scoreOne(plan: QueryPlan, candidate: Candidate) {
  const d = candidate.decision
  const fields = fieldsOf(d)
  const breakdown: ConceptScore[] = []
  let raw = 0
  let max = 0
  let coveredWeight = 0
  let totalWeight = 0
  let strongInSummary = false

  plan.concepts.forEach((concept, index) => {
    totalWeight += concept.weight
    max += concept.weight * (RELEVANCE.points.summary + RELEVANCE.phraseBonus)
    let best: ConceptScore = { concept: concept.label, field: null, points: 0, phrase: false, broad: false }
    for (const { field, words: text } of fields) {
      const found = matchIn(text, concept)
      if (!found) continue
      const broad = found === "broad" && !concept.broadIsExact
      const phrase = found === "phrase" && field !== "termos auxiliares" && field !== "texto integral" && concept.variantWords.some((v) => v.length > 1 && containsPhrase(text, v))
      const points = (POINTS[field] * (broad ? RELEVANCE.broadFactor : 1) + (phrase ? RELEVANCE.phraseBonus : 0)) * concept.weight
      if (points > best.points) best = { concept: concept.label, field, points, phrase, broad }
    }
    // O banco reduz as palavras de outro jeito: o que ele achou e a conferência daqui não, vale sem bônus.
    const db = candidate.db
    const fromDb: [Field, boolean][] = [
      ["ementa", !!db?.a.includes(index)],
      ["termos auxiliares", !!db?.b.includes(index)],
      ["texto integral", !!db?.c.includes(index)],
    ]
    for (const [field, hit] of fromDb) {
      const points = POINTS[field] * concept.weight
      if (hit && points > best.points) best = { concept: concept.label, field, points, phrase: false, broad: false }
    }
    raw += best.points
    breakdown.push(best)
    if (best.field && SUMMARY_FIELDS.has(best.field)) {
      coveredWeight += concept.weight
      if (!concept.weak) strongInSummary = true
    }
  })

  let factor = 1
  let branch: Ranked["branch"]
  const ofDecision = decisionBranch(d)
  if (plan.branches) {
    max += RELEVANCE.branchBonus
    if (ofDecision) {
      branch = { question: plan.branches, decision: ofDecision, match: plan.branches.includes(ofDecision) }
      if (branch.match) raw += RELEVANCE.branchBonus
      else factor = RELEVANCE.branchMismatchFactor
    }
  }

  const score = max > 0 ? Math.round((100 * raw * factor) / max) : 0
  const coverage = totalWeight > 0 ? coveredWeight / totalWeight : 0
  const allWeak = plan.concepts.every((c) => c.weak)
  return { score, breakdown, branch, coverage, strongInSummary: strongInSummary || (allWeak && coverage > 0) }
}

/** Frases da ementa (ou da tese) — o trecho enviado à IA é sempre uma cópia exata. */
function excerptFor(plan: QueryPlan, d: JurisprudenceDecision): Ranked["excerpt"] {
  for (const [field, text] of [
    ["ementa", d.ementa],
    ["tese", d.thesis],
  ] as const) {
    if (!text) continue
    let best: { sentence: string; value: number } | undefined
    for (const sentence of text.split(/(?<=[.;:])\s+/)) {
      const sentenceWords = words(sentence)
      const hits = plan.concepts.filter((c) => matchIn(sentenceWords, c)).length
      if (!hits) continue
      // Cabeçalho em maiúsculas ("DANO MORAL.") explica menos que uma frase da ementa.
      const letters = sentence.replace(/[^\p{L}]/gu, "")
      const shouting = letters.length > 0 && letters === letters.toUpperCase()
      const value = hits - (shouting ? 0.5 : 0)
      if (!best || value > best.value) best = { sentence: sentence.trim(), value }
    }
    if (best) {
      if (best.sentence.length <= RELEVANCE.excerptChars) return { field, text: best.sentence, cut: false }
      const cut = best.sentence.slice(0, RELEVANCE.excerptChars)
      return { field, text: cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)), cut: true }
    }
  }
  return undefined
}

/** Mesmo processo = mesma decisão para a pesquisa (número do processo ou do registro). */
const processKey = (d: JurisprudenceDecision) => {
  const digits = (d.processNumber ?? d.registryNumber ?? "").replace(/\D/g, "")
  return digits ? `${d.tribunal}:${digits}` : `id:${d.id}`
}

const subjectKey = (d: JurisprudenceDecision) => fold(d.subject ?? "").replace(/\s+/g, " ").trim()

export function rankCandidates(plan: QueryPlan, candidates: Candidate[]): RankingResult {
  const discarded: Discarded[] = []
  const approved: Ranked[] = []

  if (!plan.concepts.length) {
    return { selected: [], overflow: [], discarded: candidates.map((c) => ({ id: c.decision.id, score: 0, reason: "pergunta sem conceito pesquisável" })), stats: { candidates: candidates.length, approved: 0, direct: 0, related: 0 } }
  }

  for (const candidate of candidates) {
    const d = candidate.decision
    const { score, breakdown, branch, coverage, strongInSummary } = scoreOne(plan, candidate)
    const matched = breakdown.filter((b) => b.field && SUMMARY_FIELDS.has(b.field)).map((b) => b.concept)
    if (!matched.length) {
      const onlyFullText = breakdown.some((b) => b.field === "texto integral")
      discarded.push({ id: d.id, score, reason: onlyFullText ? "termos só no texto integral" : "nenhum conceito encontrado" })
      continue
    }
    if (!strongInSummary) {
      discarded.push({ id: d.id, score, reason: "só conceitos genéricos no assunto/ementa" })
      continue
    }
    if (score < RELEVANCE.minScore) {
      const why = branch && !branch.match ? `abaixo do limiar (${score} < ${RELEVANCE.minScore}; ramo ${branch.decision} fora de ${branch.question.join("/")})` : `abaixo do limiar (${score} < ${RELEVANCE.minScore})`
      discarded.push({ id: d.id, score, reason: why })
      continue
    }
    const level = score >= RELEVANCE.directScore && coverage >= RELEVANCE.directCoverage ? "direta" : "relacionada"
    approved.push({ decision: d, level, score, breakdown, branch, matched, excerpt: excerptFor(plan, d) })
  }

  const byDate = (a: Ranked, b: Ranked) => (b.decision.judgmentDate ?? "").localeCompare(a.decision.judgmentDate ?? "")
  approved.sort((a, b) => {
    if (a.level !== b.level) return a.level === "direta" ? -1 : 1
    if (plan.wantsRecent) return byDate(a, b) || b.score - a.score || a.decision.id.localeCompare(b.decision.id)
    return b.score - a.score || byDate(a, b) || a.decision.id.localeCompare(b.decision.id)
  })

  // Duplicatas (mesmo processo) e excesso do mesmo assunto.
  const seenProcess = new Map<string, string>()
  const perSubject = new Map<string, number>()
  const unique: Ranked[] = []
  for (const ranked of approved) {
    const key = processKey(ranked.decision)
    const first = seenProcess.get(key)
    if (first) {
      discarded.push({ id: ranked.decision.id, score: ranked.score, reason: `mesmo processo da decisão ${first}` })
      continue
    }
    seenProcess.set(key, ranked.decision.id)
    const subject = subjectKey(ranked.decision)
    const count = subject ? (perSubject.get(subject) ?? 0) : 0
    if (subject && count >= RELEVANCE.maxPerSubject) {
      discarded.push({ id: ranked.decision.id, score: ranked.score, reason: "assunto repetido (limite por assunto)" })
      continue
    }
    if (subject) perSubject.set(subject, count + 1)
    unique.push(ranked)
  }

  const direct = unique.filter((r) => r.level === "direta")
  const related = unique.filter((r) => r.level === "relacionada")
  const selected = [...direct.slice(0, RELEVANCE.maxForAI)]
  for (const r of related) {
    if (selected.length >= RELEVANCE.maxForAI || selected.filter((s) => s.level === "relacionada").length >= RELEVANCE.maxRelated) break
    selected.push(r)
  }
  const chosen = new Set(selected)
  return {
    selected,
    overflow: unique.filter((r) => !chosen.has(r)),
    discarded,
    stats: { candidates: candidates.length, approved: unique.length, direct: direct.length, related: related.length },
  }
}

/* ---------------------------------- diagnóstico ---------------------------------- */

/**
 * Linha de log da recuperação: consulta normalizada (sem nomes próprios nem números),
 * quantidades, ids e pontuações — nunca ementa, texto da decisão ou pergunta inteira.
 * Ids são da base PÚBLICA de jurisprudência, não de dados do escritório.
 */
export interface RetrievalLogEntry {
  consulta: string
  conceitos: number
  deixados_de_fora: number
  ramo?: string
  recentes: boolean
  /** Decisões da base com algum dos conceitos (antes do corte de candidatas). */
  na_base: number
  candidatas: number
  aprovadas: number
  diretas: number
  relacionadas: number
  selecionadas: { id: string; pontuacao: number; nivel: Ranked["level"] }[]
  descartadas: { id: string; pontuacao: number; motivo: string }[]
  ms: number
  /** Migração 0022 ausente: candidatas da pesquisa da tela. */
  compatibilidade: boolean
}

/** Descartes no log: os de maior pontuação (os mais úteis para calibrar o limiar). */
const LOGGED_DISCARDS = 25

export function retrievalLogEntry(plan: QueryPlan, ranking: RankingResult, extra: { matched: number; fallback: boolean; ms: number }): RetrievalLogEntry {
  return {
    consulta: loggableQuery(plan),
    conceitos: plan.concepts.length,
    deixados_de_fora: plan.dropped.length,
    ramo: plan.branches?.join("/"),
    recentes: plan.wantsRecent,
    na_base: extra.matched,
    candidatas: ranking.stats.candidates,
    aprovadas: ranking.stats.approved,
    diretas: ranking.stats.direct,
    relacionadas: ranking.stats.related,
    selecionadas: ranking.selected.map((r) => ({ id: r.decision.id, pontuacao: r.score, nivel: r.level })),
    descartadas: [...ranking.discarded]
      .sort((a, b) => b.score - a.score)
      .slice(0, LOGGED_DISCARDS)
      .map((d) => ({ id: d.id, pontuacao: d.score, motivo: d.reason })),
    ms: extra.ms,
    compatibilidade: extra.fallback,
  }
}

export const logJurisprudence = (entry: RetrievalLogEntry) => console.info(`[ia] jurisprudência ${JSON.stringify(entry)}`)
