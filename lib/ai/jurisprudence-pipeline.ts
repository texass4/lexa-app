/**
 * Análise comparativa de jurisprudência — recuperação, classificação jurídica e
 * comparação com o caso. Sem IA: o modelo só recebe o resultado (e nunca a base).
 *
 *   caso (`analyzeCase`) → por questão jurídica:
 *     A. consultas ligadas à questão — principal (conceitos centrais OBRIGATÓRIOS + fatos
 *        do caso para ordenar), alternativa (com menos resultados que o mínimo: expressões
 *        de ementa, núcleo reduzido) e de CONTRÁRIOS (expressões típicas de rejeição),
 *        cada uma registrada (conceitos, resultados, tempo, situação);
 *     B. candidatas juntas, sem duplicatas (mesmo processo: fica a decisão de mérito);
 *     C. classificação: pertinência à questão (conceitos por campo, `rankCandidates`),
 *        fatos em comum, posição explícita da ementa sobre a tese, metadados, atualidade.
 *        Palavras em comum NÃO bastam: sem os conceitos centrais no assunto/ementa, a
 *        decisão sai; de outro ramo do Direito, sai (com o motivo).
 *   → comparação (fatos em comum, distinções, ressalvas, resultado como escrito) e
 *     seleção com limite — contrárias pertinentes NUNCA são descartadas por serem contrárias.
 *
 * Limites, prazo, cancelamento e cache em `PIPELINE`. Logs só com ids, contagens e conceitos.
 */

import type { JurisprudenceDecision, JurisprudenceFilters } from "@/lib/services/jurisprudence/types"
import { analyzeCase, factsIn, type CaseAnalysis, type CaseInput, type CaseIssue } from "./jurisprudence-case"
import { factByKey, readOutcome, readStance, type Stance, type StanceReading } from "./jurisprudence-issues"
import { fold, type QueryPlan } from "./jurisprudence-query"
import { decisionBranch, rankCandidates, type Candidate, type Discarded, type Ranked } from "./jurisprudence-relevance"

/* --------------------------------- contrato --------------------------------- */

export interface RetrieveOptions {
  /** Índices (a partir de 0) dos grupos OBRIGATÓRIOS (E). Sem isto: qualquer grupo (OU). */
  required?: number[]
  signal?: AbortSignal
}

/** Candidatas da base (o repositório da IA, com as permissões de quem pergunta). */
export type RetrieveFn = (
  groups: string[][],
  filters: JurisprudenceFilters,
  limit: number,
  options?: RetrieveOptions,
) => Promise<{ candidates: Candidate[]; matched: number; fallback?: boolean }>

/** Calibráveis: mudou aqui, rode `npm test` e `npm run jurisprudence:benchmark`. */
export const PIPELINE = {
  /** Candidatas por consulta (a base nunca devolve mais que 80). */
  candidatesPerQuery: 40,
  /** Teto de consultas por análise (todas as questões). */
  maxQueries: 8,
  /** Menos que isso na consulta principal: roda a alternativa. */
  minHits: 5,
  /** Prazo total da recuperação; consultas que não couberem ficam "puladas". */
  budgetMs: 8_000,
  /** Quantos precedentes vão à IA. */
  maxSelected: 6,
  maxPerIssue: 4,
  /** Vagas garantidas para contrárias pertinentes (se existirem). */
  reserveContrary: 2,
  /** Questão ampla demais: no máximo N decisões, todas como "relacionada". */
  maxVague: 3,
  /** Cache das consultas (mesmos grupos, filtros e escritório). */
  cacheTtlMs: 10 * 60_000,
  cacheSize: 200,
  /** Pesos da classificação jurídica (somam 1). */
  weights: { questao: 0.45, fatos: 0.3, posicao: 0.15, metadados: 0.05, atualidade: 0.05 },
} as const

export type QueryKind = "principal" | "alternativa" | "contrarios"
export type QueryStatus = "ok" | "erro" | "tempo_esgotado" | "cancelada" | "pulada"

export interface ExecutedQuery {
  issue: string
  kind: QueryKind
  /** Conceitos/expressões dos grupos (rótulos, sem nomes próprios). */
  concepts: string[]
  required: string[]
  results: number
  matched: number
  ms: number
  status: QueryStatus
  cached: boolean
  /** Migração 0025 ausente: OU + filtro na aplicação. */
  fallback?: boolean
}

export type ClientStance = "favoravel" | "contraria" | "indeterminada"

export interface Distinction {
  kind: "fato oposto" | "fato só no precedente" | "fato só no caso" | "condição" | "ressalva"
  text: string
}

export interface PrecedentComparison {
  decision: JurisprudenceDecision
  issueKey: string
  issueQuestion: string
  level: "aplicavel" | "relacionada"
  /** Classificação jurídica 0–100 e seus componentes (rastreável). */
  score: number
  components: { questao: number; fatos: number; posicao: number; metadados: number; atualidade: number }
  lexical: Pick<Ranked, "score" | "breakdown" | "excerpt" | "matched" | "branch">
  /** Posição da ementa quanto à TESE da questão. */
  stance: Stance
  /** A mesma posição do ponto de vista do cliente (réu inverte). */
  stanceForClient: ClientStance
  stanceEvidence?: StanceReading
  /** Resultado do julgamento como escrito no dispositivo/ementa. */
  outcome?: string
  sharedFacts: { key: string; label: string }[]
  distinctions: Distinction[]
  missingMetadata: string[]
  /** Consultas que encontraram a decisão. */
  foundBy: QueryKind[]
}

export type RetrievalStatus = "ok" | "sem_resultados" | "nao_executada" | "indisponivel" | "cancelada"

export interface RetrievalResult {
  analysis: CaseAnalysis
  precedents: PrecedentComparison[]
  /** Pertinentes que não couberam no limite. */
  overflow: number
  queries: ExecutedQuery[]
  status: RetrievalStatus
  /** "suficiente": toda questão tem precedente aplicável; "parcial": alguma; "insuficiente": nenhuma. */
  support: "suficiente" | "parcial" | "insuficiente"
  notRun?: string
  metrics: {
    candidates: number
    unique: number
    duplicatesRemoved: number
    approved: number
    selected: number
    applicable: number
    contrary: number
    /** Questões (não amplas) com ao menos um precedente aplicável ÷ questões. */
    coverage: number
    /** Aprovadas ÷ únicas: quanto do que a base devolveu era pertinente. */
    pertinenceRate: number
    failedQueries: number
    ms: number
  }
  discarded: Discarded[]
}

export interface RetrievalDeps {
  candidates: RetrieveFn
  /** Decisões completas (com o dispositivo) para ler o resultado. Opcional. */
  loadFull?: (ids: string[]) => Promise<JurisprudenceDecision[]>
  signal?: AbortSignal
  /** Escopo do cache (organização): o resultado nunca atravessa escritórios. */
  cacheScope?: string
  cache?: QueryCache
  /** Decisões a não sugerir (ex.: a própria decisão da conversa). */
  excludeIds?: string[]
  filters?: JurisprudenceFilters
  clock?: () => number
}

/* ----------------------------------- cache ----------------------------------- */

export class QueryCache {
  private entries = new Map<string, { at: number; value: Awaited<ReturnType<RetrieveFn>> }>()
  private readonly ttlMs: number
  private readonly size: number
  constructor(ttlMs: number = PIPELINE.cacheTtlMs, size: number = PIPELINE.cacheSize) {
    this.ttlMs = ttlMs
    this.size = size
  }
  get(key: string, now: number) {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (now - hit.at > this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return hit.value
  }
  set(key: string, value: Awaited<ReturnType<RetrieveFn>>, now: number) {
    if (this.entries.size >= this.size) this.entries.delete(this.entries.keys().next().value!)
    this.entries.set(key, { at: now, value })
  }
}

/** Cache do servidor (por processo Node). A chave sempre leva o escritório. */
export const sharedQueryCache = new QueryCache()

/* --------------------------------- consultas --------------------------------- */

interface PlannedQuery {
  issue: CaseIssue
  kind: QueryKind
  groups: string[][]
  labels: string[]
  required: number[]
  /** Grupo da consulta → conceito central da questão (índice), para ler o que o banco achou. */
  coreIndex: (number | undefined)[]
}

/** Índices do banco (por grupo da consulta) → índices dos conceitos centrais da questão. */
function remap(candidate: Candidate, q: PlannedQuery): Candidate {
  if (!candidate.db) return candidate
  const map = (list: number[]) => list.map((i) => q.coreIndex[i]).filter((i): i is number => i !== undefined)
  return { ...candidate, db: { a: map(candidate.db.a), b: map(candidate.db.b), c: map(candidate.db.c) } }
}

/** Fatos do caso que importam para a questão — viram grupos que só ordenam. */
function factGroups(issue: CaseIssue, analysis: CaseAnalysis) {
  const relevant = new Set(issue.catalog?.facts ?? [])
  return analysis.facts
    .filter((f) => relevant.has(f.key))
    .map((f) => ({ label: f.label, variants: factByKey(f.key)!.variants }))
}

function principalQuery(issue: CaseIssue, analysis: CaseAnalysis): PlannedQuery {
  const core = issue.core.slice(0, 4)
  const facts = factGroups(issue, analysis).slice(0, 8 - core.length)
  // Questão genérica com muitos termos: os dois primeiros obrigatórios (dicionário antes de palavras soltas).
  const required = issue.catalog ? core.map((_, i) => i) : core.slice(0, 2).map((_, i) => i)
  return {
    issue,
    kind: "principal",
    groups: [...core.map((c) => c.variants), ...facts.map((f) => f.variants)],
    labels: [...core.map((c) => c.label), ...facts.map((f) => `fato: ${f.label}`)],
    required,
    coreIndex: core.map((_, i) => i),
  }
}

function alternativeQuery(issue: CaseIssue): PlannedQuery | undefined {
  const core = issue.core.slice(0, 4)
  if (issue.catalog) {
    // Núcleo sem o último conceito + expressões típicas de ementa (obrigatórias).
    const kept = core.slice(0, Math.max(1, core.length - 1))
    const expressions = issue.catalog.expressions
    return {
      issue,
      kind: "alternativa",
      groups: [...kept.map((c) => c.variants), expressions],
      labels: [...kept.map((c) => c.label), "expressões de ementa"],
      required: [...kept.map((_, i) => i), kept.length],
      coreIndex: kept.map((_, i) => i),
    }
  }
  if (core.length < 2) return undefined
  return { issue, kind: "alternativa", groups: core.map((c) => c.variants), labels: core.map((c) => c.label), required: [0], coreIndex: core.map((_, i) => i) }
}

function contraryQuery(issue: CaseIssue): PlannedQuery | undefined {
  const rejects = issue.catalog?.rejectExpressions
  if (!rejects?.length) return undefined
  const core = issue.core.slice(0, 4)
  return {
    issue,
    kind: "contrarios",
    groups: [...core.map((c) => c.variants), rejects],
    labels: [...core.map((c) => c.label), "expressões de rejeição da tese"],
    required: [...core.map((_, i) => i), core.length],
    coreIndex: core.map((_, i) => i),
  }
}

/* ------------------------------- classificação ------------------------------- */

const isAbort = (error: unknown) => error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
const isTimeout = (error: unknown) => !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "TIMEOUT"

const processKey = (d: JurisprudenceDecision) => {
  const digits = (d.processNumber ?? d.registryNumber ?? "").replace(/\D/g, "")
  return digits ? `${d.tribunal}:${digits}` : `id:${d.id}`
}

/** Embargos de declaração repetem o mérito: entre decisões do mesmo processo, fica a de mérito. */
const isEmbargos = (d: JurisprudenceDecision) => /\bedcl\b/i.test(d.classCode ?? "") || /^[^.]*embargos de declara/i.test(fold(d.subject ?? d.ementa))

const METADATA: [keyof JurisprudenceDecision, string][] = [
  ["processNumber", "número do processo"],
  ["court", "órgão julgador"],
  ["rapporteur", "relator"],
  ["judgmentDate", "data do julgamento"],
  ["publicationDate", "data de publicação"],
]

function missingMetadata(d: JurisprudenceDecision) {
  return METADATA.filter(([key]) => !d[key] && !(key === "publicationDate" && d.publication)).map(([, label]) => label)
}

function compare(issue: CaseIssue, analysis: CaseAnalysis, decision: JurisprudenceDecision, stance: StanceReading) {
  const relevant = new Set(issue.catalog?.facts ?? [])
  const caseFacts = analysis.facts.filter((f) => relevant.has(f.key))
  const decisionFacts = factsIn(`${decision.subject ?? ""}. ${decision.ementa}`, relevant)
  const shared = caseFacts.filter((f) => decisionFacts.some((d) => d.key === f.key))
  const distinctions: Distinction[] = []
  const opposed = new Set<string>()
  for (const f of caseFacts) {
    const other = decisionFacts.find((d) => factByKey(d.key)?.opposite === f.key || factByKey(f.key)?.opposite === d.key)
    if (other) {
      opposed.add(f.key).add(other.key)
      distinctions.push({ kind: "fato oposto", text: `O caso informa "${f.label}"; o precedente trata de "${factByKey(other.key)!.label}".` })
    }
  }
  for (const d of decisionFacts) {
    if (opposed.has(d.key) || caseFacts.some((f) => f.key === d.key)) continue
    distinctions.push({ kind: "fato só no precedente", text: `O precedente considera "${factByKey(d.key)!.label}" — o caso não informa isso.` })
  }
  for (const f of caseFacts) {
    if (opposed.has(f.key) || shared.includes(f)) continue
    distinctions.push({ kind: "fato só no caso", text: `O caso tem "${f.label}", que a ementa do precedente não menciona.` })
  }
  if (stance.condition) distinctions.push({ kind: "condição", text: `A tese da decisão vale para: "${stance.condition}".` })
  if (stance.exception) distinctions.push({ kind: "ressalva", text: `Ressalva na própria ementa: "${stance.exception}"` })
  const facts = caseFacts.length ? Math.max(0, Math.round((100 * shared.length) / caseFacts.length) - 25 * opposed.size) : 50
  return { shared: shared.map((f) => ({ key: f.key, label: f.label })), distinctions, facts }
}

const clientView = (stance: Stance, analysis: CaseAnalysis): ClientStance =>
  stance === "indeterminada" ? "indeterminada" : (stance === "acolhe") === (analysis.position !== "reu") ? "favoravel" : "contraria"

function recency(date: string | undefined, now: number) {
  if (!date) return 0
  const years = (now - Date.parse(date)) / (365.25 * 24 * 3600 * 1000)
  return Math.max(0, Math.round(100 - 15 * Math.max(0, years)))
}

/* ---------------------------------- execução ---------------------------------- */

export async function retrievePrecedents(input: CaseInput | CaseAnalysis, deps: RetrievalDeps): Promise<RetrievalResult> {
  const clock = deps.clock ?? Date.now
  const started = clock()
  const analysis = "issues" in input ? input : analyzeCase(input)
  const empty = (status: RetrievalStatus, notRun?: string, queries: ExecutedQuery[] = []): RetrievalResult => ({
    analysis,
    precedents: [],
    overflow: 0,
    queries,
    status,
    support: "insuficiente",
    notRun,
    metrics: { candidates: 0, unique: 0, duplicatesRemoved: 0, approved: 0, selected: 0, applicable: 0, contrary: 0, coverage: 0, pertinenceRate: 0, failedQueries: queries.filter((q) => q.status === "erro" || q.status === "tempo_esgotado").length, ms: clock() - started },
    discarded: [],
  })
  if (!analysis.issues.length) return empty("nao_executada", analysis.gaps[0] ?? "Sem questão jurídica para pesquisar.")

  const queries: ExecutedQuery[] = []
  const filters = deps.filters ?? {}
  const cache = deps.cache ?? sharedQueryCache
  /** Candidatas por questão (com as consultas que acharam cada uma). */
  const pool = new Map<string, Map<string, { candidate: Candidate; foundBy: QueryKind[] }>>()

  const run = async (q: PlannedQuery): Promise<number> => {
    const record: ExecutedQuery = { issue: q.issue.key, kind: q.kind, concepts: q.labels, required: q.required.map((i) => q.labels[i]), results: 0, matched: 0, ms: 0, status: "ok", cached: false }
    queries.push(record)
    if (deps.signal?.aborted) {
      record.status = "cancelada"
      return 0
    }
    if (queries.length > PIPELINE.maxQueries || clock() - started > PIPELINE.budgetMs) {
      record.status = "pulada"
      return 0
    }
    const key = JSON.stringify([deps.cacheScope ?? "", q.groups, q.required, filters, PIPELINE.candidatesPerQuery])
    const t0 = clock()
    try {
      let result = cache.get(key, t0)
      if (result) record.cached = true
      else {
        result = await deps.candidates(q.groups, filters, PIPELINE.candidatesPerQuery, { required: q.required, signal: deps.signal })
        cache.set(key, result, clock())
      }
      record.results = result.candidates.length
      record.matched = result.matched
      record.fallback = result.fallback || undefined
      const bucket = pool.get(q.issue.key) ?? new Map()
      pool.set(q.issue.key, bucket)
      for (const raw of result.candidates) {
        if (deps.excludeIds?.includes(raw.decision.id)) continue
        const candidate = remap(raw, q)
        const entry = bucket.get(candidate.decision.id)
        if (entry) {
          entry.foundBy.push(q.kind)
          // O que o banco achou em cada consulta soma (cada uma confere grupos diferentes).
          if (candidate.db && entry.candidate.db) {
            const merge = (a: number[], b: number[]) => [...new Set([...a, ...b])]
            entry.candidate = { ...entry.candidate, db: { a: merge(entry.candidate.db.a, candidate.db.a), b: merge(entry.candidate.db.b, candidate.db.b), c: merge(entry.candidate.db.c, candidate.db.c) } }
          }
        } else bucket.set(candidate.decision.id, { candidate, foundBy: [q.kind] })
      }
      return result.candidates.length
    } catch (error) {
      record.status = deps.signal?.aborted || isAbort(error) ? "cancelada" : isTimeout(error) ? "tempo_esgotado" : "erro"
      return 0
    } finally {
      record.ms = clock() - t0
    }
  }

  for (const issue of analysis.issues) {
    const found = await run(principalQuery(issue, analysis))
    if (found < PIPELINE.minHits) {
      const alt = alternativeQuery(issue)
      if (alt) await run(alt)
    }
    const contrary = contraryQuery(issue)
    if (contrary) {
      // Contrárias costumam vir na principal; a consulta própria evita que o limite as corte.
      const bucket = [...(pool.get(issue.key)?.values() ?? [])]
      const truncated = found >= PIPELINE.candidatesPerQuery
      const anyContrary = bucket.some((e) => readStance(issue.catalog!, e.candidate.decision.ementa).stance === "rejeita")
      if (truncated || !anyContrary) await run(contrary)
    }
  }

  const ok = queries.filter((q) => q.status === "ok")
  if (!ok.length) {
    const cancelled = queries.some((q) => q.status === "cancelada")
    return empty(cancelled ? "cancelada" : "indisponivel", undefined, queries)
  }

  // Classificação por questão.
  const now = clock()
  const comparisons: PrecedentComparison[] = []
  const discarded: Discarded[] = []
  let candidatesTotal = 0
  let unique = 0
  let duplicatesRemoved = 0
  for (const issue of analysis.issues) {
    const bucket = [...(pool.get(issue.key)?.values() ?? [])]
    candidatesTotal += bucket.length
    // Duplicatas: mesmo processo → fica a decisão de mérito (não os embargos), a mais completa.
    const byProcess = new Map<string, (typeof bucket)[number]>()
    for (const entry of bucket) {
      const key = processKey(entry.candidate.decision)
      const current = byProcess.get(key)
      const better = (a: typeof entry, b: typeof entry) =>
        Number(isEmbargos(a.candidate.decision)) - Number(isEmbargos(b.candidate.decision)) ||
        missingMetadata(a.candidate.decision).length - missingMetadata(b.candidate.decision).length
      if (!current) byProcess.set(key, entry)
      else {
        duplicatesRemoved += 1
        const [keep, drop] = better(entry, current) < 0 ? [entry, current] : [current, entry]
        byProcess.set(key, keep)
        discarded.push({ id: drop.candidate.decision.id, score: 0, reason: `mesmo processo da decisão ${keep.candidate.decision.id}` })
      }
    }
    const entries = [...byProcess.values()]
    unique += entries.length

    const plan: QueryPlan = {
      original: analysis.question,
      terms: issue.core.map((c) => c.label).join(" "),
      normalized: "",
      concepts: issue.core,
      dropped: [],
      branches: issue.branches ?? analysis.plan?.branches,
      wantsRecent: !!analysis.plan?.wantsRecent,
      groups: issue.core.map((c) => c.variants),
    }
    const ranking = rankCandidates(
      plan,
      entries.map((e) => e.candidate),
    )
    discarded.push(...ranking.discarded)
    for (const ranked of [...ranking.selected, ...ranking.overflow]) {
      const d = ranked.decision
      // Questão do catálogo: TODOS os conceitos centrais no assunto/ementa/tese/termos — só parte da
      // questão (ex.: "ICMS" sem "TUSD/TUST") é outra questão, mesmo com palavras em comum.
      if (issue.catalog) {
        const missing = issue.core.filter((c) => !ranked.breakdown.some((b) => b.concept === c.label && b.field && b.field !== "texto integral"))
        if (missing.length) {
          discarded.push({ id: d.id, score: ranked.score, reason: `só parte da questão (falta: ${missing.map((c) => c.label).join(", ")})` })
          continue
        }
      }
      const branch = decisionBranch(d)
      if (issue.branches && branch && !issue.branches.includes(branch)) {
        discarded.push({ id: d.id, score: ranked.score, reason: `ramo ${branch}: não sustenta a questão (${issue.branches.join("/")})` })
        continue
      }
      const stance = issue.catalog ? readStance(issue.catalog, d.ementa) : { stance: "indeterminada" as Stance }
      const reading = stance.stance === "indeterminada" && issue.catalog && d.thesis ? readStance(issue.catalog, d.thesis) : stance
      const { shared, distinctions, facts } = compare(issue, analysis, d, reading)
      const missing = missingMetadata(d)
      const components = {
        questao: ranked.score,
        fatos: facts,
        posicao: reading.stance === "indeterminada" ? 0 : 100,
        metadados: Math.round((100 * (METADATA.length - missing.length)) / METADATA.length),
        atualidade: recency(d.judgmentDate, now),
      }
      const w = PIPELINE.weights
      const score = Math.round(components.questao * w.questao + components.fatos * w.fatos + components.posicao * w.posicao + components.metadados * w.metadados + components.atualidade * w.atualidade)
      // Questão genérica: aplicável só com dois conceitos ou um conceito do dicionário (tema
      // delimitado, ex.: "negativação indevida") — uma palavra solta não delimita questão.
      const applicable = !issue.vague && ranked.level === "direta" && (!!issue.catalog || issue.core.length >= 2 || issue.core.every((c) => c.source === "dicionario"))
      const entry = entries.find((e) => e.candidate.decision.id === d.id)!
      comparisons.push({
        decision: d,
        issueKey: issue.key,
        issueQuestion: issue.question,
        level: applicable ? "aplicavel" : "relacionada",
        score,
        components,
        lexical: { score: ranked.score, breakdown: ranked.breakdown, excerpt: ranked.excerpt, matched: ranked.matched, branch: ranked.branch },
        stance: reading.stance,
        stanceForClient: clientView(reading.stance, analysis),
        stanceEvidence: reading.stance === "indeterminada" ? undefined : reading,
        sharedFacts: shared,
        distinctions,
        missingMetadata: missing,
        foundBy: [...new Set(entry.foundBy)],
      })
    }
  }

  // Seleção: aplicáveis primeiro, pela classificação jurídica; contrárias garantidas.
  const order = (a: PrecedentComparison, b: PrecedentComparison) =>
    Number(b.level === "aplicavel") - Number(a.level === "aplicavel") || b.score - a.score || (b.decision.judgmentDate ?? "").localeCompare(a.decision.judgmentDate ?? "") || a.decision.id.localeCompare(b.decision.id)
  const seen = new Set<string>()
  const approved = comparisons.sort(order).filter((c) => {
    const key = processKey(c.decision)
    if (seen.has(c.decision.id) || seen.has(key)) return false
    seen.add(c.decision.id).add(key)
    return true
  })
  const vagueOnly = analysis.issues.every((i) => i.vague)
  const limit = vagueOnly ? PIPELINE.maxVague : PIPELINE.maxSelected
  const perIssue = new Map<string, number>()
  const selected: PrecedentComparison[] = []
  for (const c of approved) {
    if (selected.length >= limit) break
    if ((perIssue.get(c.issueKey) ?? 0) >= PIPELINE.maxPerIssue) continue
    selected.push(c)
    perIssue.set(c.issueKey, (perIssue.get(c.issueKey) ?? 0) + 1)
  }
  // Contrárias pertinentes que ficaram de fora entram no lugar das menos bem classificadas não contrárias.
  const contraryOut = approved.filter((c) => c.stanceForClient === "contraria" && !selected.includes(c))
  let reserved = selected.filter((c) => c.stanceForClient === "contraria").length
  for (const c of contraryOut) {
    if (reserved >= PIPELINE.reserveContrary) break
    const victim = [...selected].reverse().find((s) => s.stanceForClient !== "contraria")
    if (!victim) break
    selected.splice(selected.indexOf(victim), 1, c)
    reserved += 1
  }
  selected.sort(order)

  // Resultado do julgamento: do dispositivo, nas decisões completas (só as selecionadas).
  if (deps.loadFull && selected.length) {
    try {
      const full = new Map((await deps.loadFull(selected.map((s) => s.decision.id))).map((d) => [d.id, d]))
      for (const s of selected) {
        const d = full.get(s.decision.id)
        if (d) s.decision = { ...s.decision, decisionText: d.decisionText }
      }
    } catch {
      // Sem o texto completo, o resultado vem só da ementa.
    }
  }
  for (const s of selected) s.outcome = readOutcome(s.decision)

  const nonVague = analysis.issues.filter((i) => !i.vague)
  const covered = nonVague.filter((i) => selected.some((s) => s.issueKey === i.key && s.level === "aplicavel")).length
  const support = !nonVague.length || covered === 0 ? "insuficiente" : covered === nonVague.length ? "suficiente" : "parcial"
  return {
    analysis,
    precedents: selected,
    overflow: approved.length - selected.length,
    queries,
    status: approved.length ? "ok" : "sem_resultados",
    support,
    metrics: {
      candidates: candidatesTotal,
      unique,
      duplicatesRemoved,
      approved: approved.length,
      selected: selected.length,
      applicable: selected.filter((s) => s.level === "aplicavel").length,
      contrary: selected.filter((s) => s.stanceForClient === "contraria").length,
      coverage: nonVague.length ? covered / nonVague.length : 0,
      pertinenceRate: unique ? approved.length / unique : 0,
      failedQueries: queries.filter((q) => q.status === "erro" || q.status === "tempo_esgotado").length,
      ms: clock() - started,
    },
    discarded,
  }
}

/* ---------------------------------- diagnóstico ---------------------------------- */

/** Linha de log: conceitos, contagens, ids e situação — nunca a pergunta, ementas ou dados do processo. */
export function comparativeLogEntry(result: RetrievalResult) {
  return {
    questoes: result.analysis.issues.map((i) => i.key),
    profundidade: result.analysis.depth,
    situacao: result.status,
    suporte: result.support,
    consultas: result.queries.map((q) => ({ questao: q.issue, tipo: q.kind, conceitos: q.concepts.length, obrigatorios: q.required.length, resultados: q.results, situacao: q.status, cache: q.cached, ms: q.ms, compatibilidade: q.fallback })),
    metricas: result.metrics,
    selecionadas: result.precedents.map((p) => ({ id: p.decision.id, nivel: p.level, pontuacao: p.score, posicao: p.stanceForClient })),
    descartadas: [...result.discarded].sort((a, b) => b.score - a.score).slice(0, 20).map((d) => ({ id: d.id, pontuacao: d.score, motivo: d.reason })),
  }
}

export const logComparative = (result: RetrievalResult) => console.info(`[ia] jurisprudência comparativa ${JSON.stringify(comparativeLogEntry(result))}`)
