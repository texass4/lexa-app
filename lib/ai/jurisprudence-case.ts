/**
 * Etapa 0 da análise comparativa: o CASO, antes de qualquer pesquisa.
 *
 * A pergunta do advogado e os dados AUTORIZADOS do processo (assunto, tipo de ação,
 * classe, área, observações, situação, movimentações) viram uma representação
 * estruturada: questões jurídicas a decidir, fatos (cada um com a origem e o trecho
 * literal), provas mencionadas ou dadas como ausentes, posição do cliente, fase,
 * tribunal e as LACUNAS. Nada é inventado: o que não está escrito fica como lacuna.
 *
 * Sem IA e sem rede: dicionário revisável (`jurisprudence-issues.ts`). A profundidade
 * acompanha a pergunta — pergunta simples não exige todos os campos.
 */

import type { Process } from "@/types"
import { PROCESS_STATUS } from "@/lib/core/config"
import { searchTermsFrom } from "./jurisprudence-intent"
import { containsPhrase, fold, planQuery, plannedConcept, singular, words, type PlannedConcept, type QueryPlan } from "./jurisprudence-query"
import { EVIDENCE, FACTS, LEGAL_ISSUES, conceptByKey, factByKey, type IssueRequirement, type LegalIssue } from "./jurisprudence-issues"
import { LEGAL_CONCEPTS, type LegalBranch } from "./jurisprudence-terms"
import { relatedQueryForProcess } from "@/lib/services/jurisprudence/service"

export type CaseProcess = Pick<Process, "area" | "type"> &
  Partial<Pick<Process, "subject" | "className" | "notes" | "status" | "tribunal" | "degree" | "movements" | "judicialUnit" | "court" | "number">>

export interface CaseInput {
  question: string
  process?: CaseProcess | null
}

export type InfoSource = "pergunta" | "processo"

export interface CaseFact {
  key: string
  label: string
  source: InfoSource
  /** Trecho literal onde o fato aparece (quando localizável). */
  quote?: string
}

export interface CaseEvidence {
  key: string
  label: string
  /** "mencionada" = a pessoa disse que existe; "ausente" = disse que NÃO existe. Nunca "provada". */
  status: "mencionada" | "ausente"
  source: InfoSource
}

export interface RequirementCheck {
  text: string
  /** O que os dados dizem sobre o requisito — nunca "comprovado". */
  status: "fato informado" | "prova mencionada" | "prova ausente" | "não informado"
  detail?: string
}

export interface CaseIssue {
  key: string
  question: string
  /** Tese afirmativa da questão (catálogo); ausente na questão genérica. */
  thesis?: string
  branches?: LegalBranch[]
  /** Questão do catálogo (com fatos, requisitos e leitura de posição) ou genérica. */
  catalog?: LegalIssue
  /** Conceitos centrais (todos obrigatórios na consulta principal). */
  core: PlannedConcept[]
  /** Questão genérica e ampla demais: nenhuma decisão pode ser "aplicável". */
  vague: boolean
  requirements: RequirementCheck[]
  /** De onde a questão foi identificada. */
  source: InfoSource | "pergunta e processo"
}

export type Position = "autor" | "reu" | "nao_informada"

export interface CaseAnalysis {
  question: string
  /** "simples": pergunta direta (resposta curta); "completa": caso/estratégia. */
  depth: "simples" | "completa"
  area?: string
  actionType?: string
  subject?: string
  phase?: { text: string; source: InfoSource }
  tribunal?: { tribunal?: string; degree?: string; unit?: string }
  position: Position
  positionQuote?: string
  desiredOutcome?: string
  issues: CaseIssue[]
  facts: CaseFact[]
  evidence: CaseEvidence[]
  /** Observações de roteiro (ex.: ônus da prova) — não são fonte. */
  burden: string[]
  gaps: string[]
  /** Plano da pergunta (conceitos), para diagnóstico e para a questão genérica. */
  plan?: QueryPlan
}

/* --------------------------------- utilidades --------------------------------- */

/** Posição de uma frase (palavras normalizadas) no texto, ignorando o que já foi consumido. */
function findPhrase(tokens: string[], needle: string[], used: Set<number>): number {
  if (!needle.length) return -1
  outer: for (let i = 0; i <= tokens.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (tokens[i + j] !== needle[j] || used.has(i + j)) continue outer
    return i
  }
  return -1
}

/** Trecho literal do texto original onde a variante aparece (sem acento/maiúscula para achar). */
function literal(text: string, variant: string): string | undefined {
  const at = fold(text).indexOf(fold(variant))
  if (at < 0) return undefined
  // Expande até a palavra inteira, sem passar de uma frase.
  const start = Math.max(text.lastIndexOf(" ", at) + 1, 0)
  const endSpace = text.indexOf(" ", at + variant.length)
  const end = endSpace < 0 ? text.length : endSpace
  return text.slice(start, end).replace(/[.,;:!?]+$/, "")
}

/**
 * Palavras para conferir FATOS: como `words`, mas a negação fica ("sem registro na Anvisa"
 * não pode virar "registro na Anvisa"; "sem vínculo", "sem requerimento" idem).
 */
const FACT_STOP = new Set("a o as os e de da do das dos em na no nas nos para por com ao aos um uma sob que se pelo pela pelos pelas".split(" "))
export function factWords(text: string | undefined): string[] {
  if (!text) return []
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FACT_STOP.has(w))
    .map(singular)
}

/** Fatos escritos no texto (a variante negativa consome as palavras antes da positiva). */
export function factsIn(text: string | undefined, allowed?: Set<string>): { key: string; variant: string }[] {
  if (!text) return []
  const tokens = factWords(text)
  const used = new Set<number>()
  const out: { key: string; variant: string }[] = []
  for (const fact of FACTS) {
    if (allowed && !allowed.has(fact.key)) continue
    for (const variant of fact.variants) {
      const needle = factWords(variant)
      const at = findPhrase(tokens, needle, used)
      if (at < 0) continue
      needle.forEach((_, j) => used.add(at + j))
      if (!out.some((f) => f.key === fact.key)) out.push({ key: fact.key, variant })
    }
  }
  // Fato e seu oposto no mesmo texto: o oposto mais específico (negativo) vence.
  return out.filter((f) => !out.some((o) => factByKey(o.key)?.opposite === f.key))
}

/** Conceitos (dicionário + núcleos de questões) presentes no texto. */
export function conceptsIn(text: string | undefined): Set<string> {
  const found = new Set<string>()
  if (!text) return found
  const tokens = words(text)
  for (const concept of [...LEGAL_CONCEPTS, ...LEGAL_ISSUES.flatMap((i) => i.core).map(conceptByKey)]) {
    if (!concept || found.has(concept.key)) continue
    const forms = [...concept.variants, ...(concept.broader ?? [])]
    if (forms.some((form) => containsPhrase(tokens, words(form)) || (words(form).length === 1 && tokens.includes(words(form)[0])))) found.add(concept.key)
  }
  return found
}

const NEGATION_BEFORE = /(nao|sem|falta|faltam|nenhum|nenhuma|nao ha|nao tem|nao temos|nao possui|nao possuimos)\s+(o |a |os |as |um |uma |de |do |da )?$/

function evidenceIn(text: string | undefined, source: InfoSource): CaseEvidence[] {
  if (!text) return []
  const folded = fold(text)
  const out: CaseEvidence[] = []
  for (const cue of EVIDENCE) {
    for (const variant of cue.variants) {
      const v = fold(variant)
      const at = folded.search(new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`))
      if (at < 0) continue
      const before = folded.slice(Math.max(0, at - 30), at)
      out.push({ key: cue.key, label: cue.label, status: NEGATION_BEFORE.test(before) ? "ausente" : "mencionada", source })
      break
    }
  }
  return out
}

/* --------------------------------- posição/fase --------------------------------- */

const DEFENDANT_ROLES = "reu|re|requerid[oa]|demandad[oa]|banco|instituicao financeira|construtora|incorporadora|hospital|clinica|operadora|plano de saude|estado|municipio|uniao|inss|empresa|fornecedor|seguradora"
const PLAINTIFF_ROLES = "autor|autora|requerente|consumidor|consumidora|paciente|comprador|compradora|adquirente|segurad[oa]|vitima|beneficiari[oa]|contribuinte|segurad[oa]"

const POSITION_RULES: [RegExp, Position][] = [
  [new RegExp(`\\b(meu|minha|nosso|nossa|o|a) client[ea] (e|sera|foi|seria) (o |a )?(${DEFENDANT_ROLES})\\b`), "reu"],
  [new RegExp(`\\brepresent(o|amos) (o |a )?(${DEFENDANT_ROLES})\\b`), "reu"],
  [/\b(defender|defesa d[oa] client|contestar|contestacao|afastar a (condenacao|responsabilidade)|somos (o|a) (re|reu))\b/, "reu"],
  [new RegExp(`\\b(meu|minha|nosso|nossa|o|a) client[ea] (e|sera|foi|seria) (o |a )?(${PLAINTIFF_ROLES})\\b`), "autor"],
  [new RegExp(`\\brepresent(o|amos) (o |a )?(${PLAINTIFF_ROLES})\\b`), "autor"],
  [/\b(o|a|meu|minha|nosso|nossa) client[ea] (teve|sofreu|ficou|comprou|precisa|pagou|nunca contratou)\b/, "autor"],
  [/\b(ajuizar|propor a acao|entrar com a acao|vamos pedir|queremos pedir)\b/, "autor"],
]

const PHASE_RULES: [RegExp, string][] = [
  [/cumprimento de sentenca|execucao de sentenca|penhora/, "cumprimento de sentença/execução"],
  [/recurso especial|recurso extraordinario|agravo em recurso especial/, "recurso aos tribunais superiores"],
  [/apelacao|recurso inominado/, "recurso (apelação/recurso inominado)"],
  [/sentenca/, "sentença proferida"],
  [/audiencia/, "instrução/audiência"],
  [/contestacao|defesa apresentada/, "contestação apresentada"],
  [/citacao|citad[oa]/, "citação"],
  [/distribuicao|distribuid[oa]|peticao inicial/, "inicial/distribuição"],
]

const QUESTION_PHASE: [RegExp, string][] = [
  [/\b(antes de ajuizar|vou ajuizar|vamos ajuizar|pretendo ajuizar|ainda nao ajuiz|propor a acao)\b/, "antes do ajuizamento"],
  [/\b(contestar|contestacao)\b/, "defesa (contestação)"],
  [/\b(apelar|apelacao|recorrer|recurso especial)\b/, "fase recursal"],
  [/\b(cumprimento de sentenca|execucao)\b/, "cumprimento de sentença/execução"],
]

function phaseOf(question: string, process?: CaseProcess | null): CaseAnalysis["phase"] {
  const q = fold(question)
  for (const [pattern, text] of QUESTION_PHASE) if (pattern.test(q)) return { text, source: "pergunta" }
  if (!process) return undefined
  const latest = [...(process.movements ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  for (const movement of latest) {
    const title = fold(`${movement.title} ${movement.description ?? ""}`)
    for (const [pattern, text] of PHASE_RULES) if (pattern.test(title)) return { text: `${text} (pela movimentação de ${movement.at.slice(0, 10)})`, source: "processo" }
  }
  if (process.status === "recurso") return { text: "em recurso (situação cadastrada)", source: "processo" }
  if (process.status === "concluido") return { text: "concluído (situação cadastrada)", source: "processo" }
  return undefined
}

/* ----------------------------------- questões ----------------------------------- */

/** Palavras amplas demais para delimitar uma questão sozinhas. */
const VAGUE_TERMS = new Set(["dano", "responsabilidade", "indenizacao", "direito", "acao", "contrato", "valor", "civil", "moral", "material", "lei", "justica"])

function requirementChecks(requirements: IssueRequirement[], facts: CaseFact[], evidence: CaseEvidence[]): RequirementCheck[] {
  return requirements.map((req) => {
    const fact = req.fact ? facts.find((f) => f.key === req.fact) : undefined
    if (fact) return { text: req.text, status: "fato informado", detail: fact.quote ?? fact.label }
    const opposite = req.fact ? facts.find((f) => factByKey(f.key)?.opposite === req.fact || factByKey(req.fact!)?.opposite === f.key) : undefined
    if (opposite) return { text: req.text, status: "fato informado", detail: `em sentido contrário: ${opposite.quote ?? opposite.label}` }
    const missing = evidence.find((e) => req.evidence?.includes(e.key) && e.status === "ausente")
    if (missing) return { text: req.text, status: "prova ausente", detail: missing.label }
    const mentioned = evidence.find((e) => req.evidence?.includes(e.key) && e.status === "mencionada")
    if (mentioned) return { text: req.text, status: "prova mencionada", detail: mentioned.label }
    return { text: req.text, status: "não informado" }
  })
}

const coreOf = (keys: string[]) => keys.map((k) => conceptByKey(k)).filter((c) => !!c).map((c) => plannedConcept(c!))

/** Até quantas questões uma análise trata (cada uma custa consultas). */
export const MAX_ISSUES = 3

export function analyzeCase(input: CaseInput): CaseAnalysis {
  const question = input.question.trim()
  const process = input.process ?? undefined
  const processText = process ? [process.subject, process.type, process.className, process.notes].filter(Boolean).join(". ") : ""

  // Conceitos e fatos, com a origem.
  const fromQuestion = conceptsIn(question)
  const fromProcess = conceptsIn(processText)
  const all = new Set([...fromQuestion, ...fromProcess])
  const facts: CaseFact[] = []
  for (const [text, source] of [
    [question, "pergunta"],
    [process?.notes, "processo"],
    [process ? [process.subject, process.type, process.className].filter(Boolean).join(". ") : undefined, "processo"],
  ] as [string | undefined, InfoSource][]) {
    for (const f of factsIn(text)) {
      if (facts.some((x) => x.key === f.key)) continue
      // Oposto já registrado por outra origem: os dois ficam (conflito visível), cada um com a origem.
      facts.push({ key: f.key, label: factByKey(f.key)!.label, source, quote: text ? literal(text, f.variant) : undefined })
    }
  }
  const evidence = [...evidenceIn(question, "pergunta"), ...evidenceIn(process?.notes, "processo")].filter(
    (e, i, list) => list.findIndex((x) => x.key === e.key) === i,
  )

  // Questões do catálogo levantadas pelo caso.
  const issues: CaseIssue[] = []
  for (const issue of LEGAL_ISSUES) {
    if (!issue.trigger.every((k) => all.has(k))) continue
    if (issue.triggerAny && !issue.triggerAny.some((k) => all.has(k))) continue
    const inQuestion = issue.trigger.every((k) => fromQuestion.has(k))
    const inProcess = issue.trigger.every((k) => fromProcess.has(k))
    issues.push({
      key: issue.key,
      question: issue.question,
      thesis: issue.thesis,
      branches: issue.branches,
      catalog: issue,
      core: coreOf(issue.core),
      vague: false,
      requirements: requirementChecks(issue.requirements, facts, evidence),
      source: inQuestion && inProcess ? "pergunta e processo" : inQuestion ? "pergunta" : "processo",
    })
  }
  // Pergunta antes do processo: a questão que a pessoa fez vem primeiro.
  issues.sort((a, b) => Number(a.source === "processo") - Number(b.source === "processo"))

  // Sem questão do catálogo: questão genérica pelos conceitos da pergunta (ou do processo).
  let terms = searchTermsFrom(question)
  if (terms.length < 4 && process) terms = relatedQueryForProcess(process).text
  const plan = terms.length >= 3 ? planQuery(question, terms) : undefined
  if (!issues.length && plan?.concepts.length) {
    const strong = plan.concepts.filter((c) => !c.weak && !VAGUE_TERMS.has(c.key.replace(/^termo:/, "")))
    issues.push({
      key: "generica",
      question: `Questão a partir dos termos: ${plan.concepts.map((c) => c.label).join(", ")}`,
      core: strong.length ? strong : plan.concepts,
      vague: strong.length === 0,
      requirements: [],
      source: searchTermsFrom(question).length >= 4 ? "pergunta" : "processo",
    })
  }

  // Posição, resultado pretendido, fase, tribunal.
  const q = fold(question)
  let position: Position = "nao_informada"
  let positionQuote: string | undefined
  for (const [pattern, value] of POSITION_RULES) {
    const match = pattern.exec(q)
    if (match) {
      position = value
      positionQuote = question.slice(match.index, match.index + match[0].length)
      break
    }
  }
  const outcome = /\b(quer|queremos|pretende|pretendemos|objetivo e|buscamos|busca)\s+([^.?!]{5,140})/.exec(q)
  const desiredOutcome = outcome ? question.slice(outcome.index, outcome.index + outcome[0].length).trim() : undefined
  const phase = phaseOf(question, process)
  const tribunal = process && (process.tribunal || process.degree || process.judicialUnit) ? { tribunal: process.tribunal, degree: process.degree, unit: process.judicialUnit ?? process.court } : undefined

  const depth: CaseAnalysis["depth"] =
    process || /\b(estrateg|tese|teses|chance|argument|defesa|contestar|distin|compar|riscos?|caso concreto|meu cliente|nosso cliente|o cliente)/.test(q) || question.length > 160
      ? "completa"
      : "simples"

  const burden: string[] = []
  if (all.has("consumidor") || issues.some((i) => i.key === "negativacao_dano_moral")) {
    burden.push("Relação de consumo: verifique se cabe pedir a inversão do ônus da prova (roteiro de verificação, não é conclusão).")
  }

  const gaps: string[] = []
  if (!issues.length) gaps.push("Os dados não permitem identificar a questão jurídica a decidir: informe o tema (ex.: o que se pede e por quê).")
  if (issues.some((i) => i.vague)) gaps.push("A pergunta é ampla demais para indicar precedentes aplicáveis: delimite a questão (o fato, o pedido, a tese).")
  if (process && !process.subject && !process.type?.trim()) gaps.push("O processo não tem assunto nem tipo de ação cadastrados.")
  if (depth === "completa") {
    if (position === "nao_informada") gaps.push("Não está claro se o cliente é autor ou réu — a posição das decisões é lida em relação à tese da questão.")
    if (!facts.length) gaps.push("Nenhum fato determinante foi informado (só o tema): a comparação com os precedentes fica limitada.")
    if (!phase) gaps.push("Fase processual não informada.")
    if (!desiredOutcome) gaps.push("Resultado pretendido não informado.")
    for (const issue of issues) {
      const missing = issue.requirements.filter((r) => r.status === "não informado").map((r) => r.text)
      if (missing.length) gaps.push(`${issue.question} — sem informação sobre: ${missing.join("; ")}.`)
    }
  }

  return {
    question,
    depth,
    area: process?.area,
    actionType: process?.type?.trim() || undefined,
    subject: process?.subject,
    phase,
    tribunal,
    position,
    positionQuote,
    desiredOutcome,
    issues: issues.slice(0, MAX_ISSUES),
    facts,
    evidence,
    burden,
    gaps,
    plan,
  }
}

/**
 * O caso SEM o que veio do processo (modo Jurisprudência da conversa): o processo serviu
 * para identificar a questão; fatos, provas, fase e roteiro passam a refletir só a pergunta.
 */
export function withoutProcessData(analysis: CaseAnalysis): CaseAnalysis {
  const facts = analysis.facts.filter((f) => f.source === "pergunta")
  const evidence = analysis.evidence.filter((e) => e.source === "pergunta")
  return {
    ...analysis,
    area: undefined,
    actionType: undefined,
    subject: undefined,
    tribunal: undefined,
    phase: analysis.phase?.source === "pergunta" ? analysis.phase : undefined,
    facts,
    evidence,
    issues: analysis.issues.map((i) => ({ ...i, requirements: i.catalog ? requirementChecks(i.catalog.requirements, facts, evidence) : [] })),
  }
}

/** Situação cadastrada do processo, em palavras. */
export const statusLabel = (process?: CaseProcess | null) => (process?.status ? PROCESS_STATUS[process.status]?.label : undefined)
