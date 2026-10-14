/**
 * Avaliação da recuperação de jurisprudência contra os casos de REFERÊNCIA revisados
 * manualmente (`cases.json`, sobre o corpus fictício `corpus.json`, ou sobre a base real
 * quando alguém revisar ids reais).
 *
 * Mede o que importa para a resposta da IA — o que CHEGA ao modelo:
 *   precisão ........ selecionadas pertinentes ou aceitáveis ÷ selecionadas
 *   irrelevantes .... selecionadas marcadas como irrelevantes (outro tema, ramo, fatos)
 *   cobertura ....... pertinentes selecionadas ÷ pertinentes
 *   contrárias ...... as decisões desfavoráveis à tese foram incluídas?
 *   duplicatas ...... mais de uma decisão do mesmo processo selecionada
 *   afirmação indevida: decisão apresentada como "diretamente aplicável" num caso sem
 *                     nenhuma pertinente (pergunta ampla, base sem o tema, processo vazio)
 *
 * Nenhum modelo de IA é chamado: isto avalia a RECUPERAÇÃO e a CLASSIFICAÇÃO.
 */

import { readFileSync } from "node:fs"
import type { JurisprudenceDecision, JurisprudenceFilters } from "@/lib/services/jurisprudence/types"
import { rankCandidates } from "@/lib/ai/jurisprudence-relevance"
import { containsPhrase, planQuery, words } from "@/lib/ai/jurisprudence-query"
import { searchTermsFrom } from "@/lib/ai/jurisprudence-intent"
import { relatedQueryForProcess } from "@/lib/services/jurisprudence/service"
import { retrievePrecedents, type RetrieveFn } from "@/lib/ai/jurisprudence-pipeline"
import type { Process } from "@/types"

/* ---------------------------------- dados ---------------------------------- */

type CorpusEntry = Partial<JurisprudenceDecision> & Pick<JurisprudenceDecision, "id" | "ementa">

const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8")) as T
const corpusFile = readJson<{ decisoes: CorpusEntry[] }>("corpus.json")
const casesFile = readJson<{ casos: ReferenceCase[] }>("cases.json")

export const FICTITIOUS_PROVIDER = "ficticio"

export const REFERENCE_CORPUS: JurisprudenceDecision[] = corpusFile.decisoes.map((d) => ({
  provider: FICTITIOUS_PROVIDER,
  tribunal: "STJ",
  externalId: `ficticio-${d.id.slice(-4)}`,
  degree: "Superior",
  legislation: [],
  sourceLabel: "Corpus de referência FICTÍCIO (avaliação)",
  updatedAt: "2026-10-14T00:00:00Z",
  ...d,
}))

export type ReferenceProcess = Pick<Process, "area" | "type"> & Partial<Pick<Process, "subject" | "className" | "notes">>

export interface ReferenceCase {
  id: string
  tipo: string
  pergunta: string
  processo?: ReferenceProcess
  pertinentes: string[]
  contrarias: string[]
  aceitaveis: string[] | "*"
  irrelevantes: string[] | "*"
  duplicatas?: string[][]
}

export const REFERENCE_CASES = casesFile.casos

/* ------------------------------ recuperação ------------------------------ */

export type { RetrieveFn, RetrieveOptions } from "@/lib/ai/jurisprudence-pipeline"

/**
 * Simulação EM MEMÓRIA das funções do banco, para testes sem rede: um grupo casa quando
 * alguma variante aparece como frase (sem acento, singular). Partes do índice como no
 * banco: A = assunto + ementa; B = tese, classe, termos; C = texto da decisão. A ordem
 * imita a da função: mais grupos em A, depois em A ∪ B. O redutor do Postgres (radical)
 * é mais largo que o singular daqui — por isso a medida oficial roda no banco
 * (`npm run jurisprudence:benchmark`).
 */
export function inMemoryRetrieve(corpus: JurisprudenceDecision[]): RetrieveFn {
  const parts = corpus.map((d) => ({
    d,
    a: words(`${d.subject ?? ""} ${d.ementa}`),
    b: words([d.thesis, d.className, d.keywords].filter(Boolean).join(" ")),
    c: words(d.decisionText),
  }))
  return async (groups, filters, limit, options = {}) => {
    if (options.signal?.aborted) throw Object.assign(new Error("cancelada"), { name: "AbortError" })
    const variants = groups.map((g) => g.map(words).filter((v) => v.length))
    const hit = (field: string[], i: number) => variants[i].some((v) => containsPhrase(field, v))
    const rows = parts
      .filter(({ d }) => (!filters.area || d.area === filters.area) && (!filters.tribunal || d.tribunal === filters.tribunal))
      .map((p) => {
        const idx = variants.map((_, i) => i)
        return { ...p, ga: idx.filter((i) => hit(p.a, i)), gb: idx.filter((i) => hit(p.b, i)), gc: idx.filter((i) => hit(p.c, i)) }
      })
      .filter((r) => {
        const any = (i: number) => r.ga.includes(i) || r.gb.includes(i) || r.gc.includes(i)
        if (options.required?.length) return options.required.every((i) => i < groups.length && any(i))
        return variants.some((_, i) => any(i))
      })
      .sort((x, y) => y.ga.length - x.ga.length || new Set([...y.ga, ...y.gb]).size - new Set([...x.ga, ...x.gb]).size || x.d.id.localeCompare(y.d.id))
    return {
      matched: rows.length,
      candidates: rows.slice(0, limit).map((r) => ({ decision: { ...r.d, decisionText: undefined }, db: { a: r.ga, b: r.gb, c: r.gc } })),
    }
  }
}

/* -------------------------------- pipelines -------------------------------- */

export interface PipelineOutput {
  /**
   * O que vai à IA, na ordem. `level`: como a decisão é apresentada. `stance`: posição
   * em relação à tese de quem pergunta, quando o pipeline a identifica.
   */
  selected: { id: string; level: "direta" | "relacionada"; stance?: "favoravel" | "contraria" | "indeterminada" }[]
  /** Consultas feitas à base. */
  queries: number
  /** Motivo quando nada foi pesquisado. */
  notRun?: string
}

export type Pipeline = (input: { question: string; process?: ReferenceProcess }, retrieve: RetrieveFn, corpus: JurisprudenceDecision[]) => Promise<PipelineOutput>

/**
 * ANTES: exatamente o caminho que a conversa usava (`jurisprudenceFor` em chat.ts):
 * termos da pergunta → plano por conceito → UMA consulta (qualquer conceito) → classificação
 * lexical por campo. Sem tema na pergunta, o assunto/tipo do processo.
 */
export const beforePipeline: Pipeline = async ({ question, process }, retrieve) => {
  let query = searchTermsFrom(question)
  let filters: JurisprudenceFilters = {}
  if (query.length < 4 && process) {
    const related = relatedQueryForProcess(process)
    query = related.text
    filters = related.filters
  }
  const plan = query.length >= 3 ? planQuery(question, query) : undefined
  if (!plan?.concepts.length) return { selected: [], queries: 0, notRun: "pergunta sem tema" }
  const { candidates } = await retrieve(plan.groups, filters, 60)
  const ranking = rankCandidates(plan, candidates)
  return { selected: ranking.selected.map((r) => ({ id: r.decision.id, level: r.level })), queries: 1 }
}

/**
 * DEPOIS: análise do caso → consultas por questão jurídica → classificação jurídica e
 * comparação (`lib/ai/jurisprudence-pipeline.ts`), o mesmo caminho da conversa e da
 * análise comparativa.
 */
export const afterPipeline: Pipeline = async ({ question, process }, retrieve, corpus) => {
  const byId = new Map(corpus.map((d) => [d.id, d]))
  const result = await retrievePrecedents(
    { question, process },
    { candidates: retrieve, loadFull: async (ids) => ids.map((id) => byId.get(id)!).filter(Boolean), cacheScope: "avaliacao" },
  )
  return {
    selected: result.precedents.map((p) => ({ id: p.decision.id, level: p.level === "aplicavel" ? "direta" : "relacionada", stance: p.stanceForClient })),
    queries: result.queries.filter((q) => q.status === "ok").length,
    notRun: result.notRun,
  }
}

/* --------------------------------- métricas -------------------------------- */

export interface CaseScore {
  id: string
  selected: number
  precision: number | null
  irrelevant: number
  recall: number | null
  contraryIncluded: boolean | null
  /** As contrárias incluídas foram IDENTIFICADAS como contrárias (não só listadas)? */
  contraryFlagged: boolean | null
  duplicates: number
  overclaim: number
  ids: string[]
}

export function scoreCase(c: ReferenceCase, out: PipelineOutput): CaseScore {
  const ids = out.selected.map((s) => s.id)
  const isIrrelevant = (id: string) =>
    c.irrelevantes === "*" ? !c.pertinentes.includes(id) : c.irrelevantes.includes(id) || (isNoise(id) && c.aceitaveis !== "*")
  const isOk = (id: string) => c.pertinentes.includes(id) || (c.aceitaveis === "*" ? !isIrrelevant(id) : c.aceitaveis.includes(id))
  const irrelevant = ids.filter(isIrrelevant).length
  return {
    id: c.id,
    selected: ids.length,
    precision: ids.length ? ids.filter(isOk).length / ids.length : null,
    irrelevant,
    recall: c.pertinentes.length ? c.pertinentes.filter((id) => ids.includes(id)).length / c.pertinentes.length : null,
    contraryIncluded: c.contrarias.length ? c.contrarias.every((id) => ids.includes(id)) : null,
    contraryFlagged: c.contrarias.length ? c.contrarias.every((id) => out.selected.some((s) => s.id === id && s.stance === "contraria")) : null,
    duplicates: (c.duplicatas ?? []).filter((group) => group.filter((id) => ids.includes(id)).length > 1).length,
    overclaim: c.pertinentes.length ? 0 : out.selected.filter((s) => s.level === "direta").length,
    ids,
  }
}

export interface Summary {
  cases: number
  selected: number
  irrelevant: number
  /** Média das precisões (casos com seleção). */
  precision: number
  /** Média das coberturas (casos com pertinentes). */
  recall: number
  contraryCases: number
  contraryIncluded: number
  contraryFlagged: number
  duplicates: number
  overclaim: number
}

export function summarize(scores: CaseScore[]): Summary {
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  const contrary = scores.filter((s) => s.contraryIncluded !== null)
  return {
    cases: scores.length,
    selected: scores.reduce((a, s) => a + s.selected, 0),
    irrelevant: scores.reduce((a, s) => a + s.irrelevant, 0),
    precision: avg(scores.filter((s) => s.precision !== null).map((s) => s.precision!)),
    recall: avg(scores.filter((s) => s.recall !== null).map((s) => s.recall!)),
    contraryCases: contrary.length,
    contraryIncluded: contrary.filter((s) => s.contraryIncluded).length,
    contraryFlagged: contrary.filter((s) => s.contraryFlagged).length,
    duplicates: scores.reduce((a, s) => a + s.duplicates, 0),
    overclaim: scores.reduce((a, s) => a + s.overclaim, 0),
  }
}

export async function evaluate(pipeline: Pipeline, retrieve: RetrieveFn, corpus: JurisprudenceDecision[] = REFERENCE_CORPUS, cases = REFERENCE_CASES) {
  const scores: CaseScore[] = []
  for (const c of cases) scores.push(scoreCase(c, await pipeline({ question: c.pergunta, process: c.processo }, retrieve, corpus)))
  return { scores, summary: summarize(scores) }
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`)

export function scoreTable(label: string, scores: CaseScore[], summary: Summary) {
  const lines = [
    `### ${label}`,
    "",
    "| caso | enviadas à IA | precisão | irrelevantes | cobertura | contrárias incluídas | contrárias identificadas | duplicatas | afirmação indevida |",
    "|---|---|---|---|---|---|---|---|---|",
    ...scores.map(
      (s) =>
        `| ${s.id} | ${s.selected} | ${pct(s.precision)} | ${s.irrelevant} | ${pct(s.recall)} | ${s.contraryIncluded === null ? "—" : s.contraryIncluded ? "sim" : "NÃO"} | ${s.contraryFlagged === null ? "—" : s.contraryFlagged ? "sim" : "NÃO"} | ${s.duplicates} | ${s.overclaim} |`,
    ),
    `| **total** | ${summary.selected} | ${pct(summary.precision)} | ${summary.irrelevant} | ${pct(summary.recall)} | ${summary.contraryIncluded}/${summary.contraryCases} | ${summary.contraryFlagged}/${summary.contraryCases} | ${summary.duplicates} | ${summary.overclaim} |`,
  ]
  return lines.join("\n")
}

/* ----------------------------------- ruído ----------------------------------- */

/**
 * Decisões FICTÍCIAS de ruído, determinísticas: mesmas palavras dos casos ("dano moral",
 * "inscrição", "atraso", "medicamento", "hospital", "termo inicial", "ICMS") em OUTROS
 * temas — como numa base real de dezenas de milhares de acórdãos. Ids começam com
 * `f1`: para a avaliação, são sempre irrelevantes (salvo onde o caso aceita qualquer uma).
 */
const NOISE_TOPICS: { area: string; court: string; head: string; topic: string; sentence: string }[] = [
  { area: "Direito Privado", court: "TERCEIRA TURMA", head: "CONSUMIDOR", topic: "ATRASO DE VOO. DANO MORAL", sentence: "O atraso de voo superior a quatro horas, com perda de compromisso, pode gerar dano moral e indenização ao passageiro" },
  { area: "Direito Privado", court: "QUARTA TURMA", head: "CONSUMIDOR", topic: "EXTRAVIO DE BAGAGEM. DANO MORAL. INDENIZAÇÃO", sentence: "O extravio definitivo de bagagem em viagem internacional enseja indenização por dano material e dano moral" },
  { area: "Direito Privado", court: "TERCEIRA TURMA", head: "CIVIL", topic: "OFENSA EM REDE SOCIAL. DANO MORAL", sentence: "A publicação ofensiva em rede social gera dano moral, cabendo a revisão do valor da indenização apenas se irrisório" },
  { area: "Direito Privado", court: "QUARTA TURMA", head: "CIVIL", topic: "ACIDENTE DE TRÂNSITO. RESPONSABILIDADE CIVIL. DANO MORAL", sentence: "Em acidente de trânsito, a responsabilidade civil do causador gera dever de indenizar o dano moral e o dano material" },
  { area: "Direito Privado", court: "TERCEIRA TURMA", head: "CONSUMIDOR", topic: "COBRANÇA INDEVIDA POR TELEFONE. DANO MORAL. NÃO CONFIGURAÇÃO", sentence: "A cobrança indevida, sem inscrição em cadastro e sem outra repercussão, não gera, por si só, dano moral" },
  { area: "Direito Privado", court: "TERCEIRA TURMA", head: "CONSUMIDOR", topic: "VÍCIO DO PRODUTO. VEÍCULO NOVO. DANO MORAL", sentence: "O vício reiterado em veículo novo, com atraso no reparo pela concessionária, pode configurar dano moral" },
  { area: "Direito Privado", court: "QUARTA TURMA", head: "CIVIL", topic: "PLANO DE SAÚDE. NEGATIVA DE COBERTURA. DANO MORAL", sentence: "A recusa indevida de cobertura de cirurgia de urgência pela operadora de plano de saúde gera dano moral" },
  { area: "Direito Privado", court: "TERCEIRA TURMA", head: "CIVIL", topic: "ERRO EM EXAME LABORATORIAL. LABORATÓRIO. DANO MORAL", sentence: "O laboratório responde pelo erro em exame que indicou diagnóstico falso, gerando dano moral" },
  { area: "Direito Público", court: "SEGUNDA TURMA", head: "ADMINISTRATIVO", topic: "CONCURSO PÚBLICO. INSCRIÇÃO INDEFERIDA. ILEGALIDADE", sentence: "É indevida a recusa de inscrição de candidato em concurso público por exigência não prevista em lei" },
  { area: "Direito Público", court: "PRIMEIRA TURMA", head: "ADMINISTRATIVO", topic: "LICITAÇÃO. ATRASO NA OBRA PÚBLICA. MULTA CONTRATUAL", sentence: "O atraso na entrega da obra pública autoriza a aplicação da multa contratual prevista no edital de licitação" },
  { area: "Direito Público", court: "SEGUNDA TURMA", head: "ADMINISTRATIVO", topic: "HOSPITAL PÚBLICO. CONTRATAÇÃO TEMPORÁRIA. NULIDADE", sentence: "É nula a contratação temporária de médicos para hospital público sem processo seletivo" },
  { area: "Direito Público", court: "PRIMEIRA TURMA", head: "TRIBUTÁRIO", topic: "ICMS. SUBSTITUIÇÃO TRIBUTÁRIA. COMBUSTÍVEIS", sentence: "Na substituição tributária de combustíveis, o ICMS incide sobre o preço médio ponderado ao consumidor final" },
  { area: "Direito Público", court: "SEGUNDA TURMA", head: "TRIBUTÁRIO", topic: "ICMS. CRÉDITO. BENS DE USO E CONSUMO", sentence: "Não gera crédito de ICMS a aquisição de bens de uso e consumo do estabelecimento" },
  { area: "Direito Público", court: "PRIMEIRA TURMA", head: "TRIBUTÁRIO", topic: "JUROS DE MORA. TERMO INICIAL. REPETIÇÃO DE INDÉBITO", sentence: "O termo inicial dos juros de mora na repetição de indébito tributário é o trânsito em julgado" },
  { area: "Direito Público", court: "SEGUNDA TURMA", head: "PREVIDENCIÁRIO", topic: "REVISÃO DE BENEFÍCIO. DECADÊNCIA", sentence: "Incide o prazo decadencial sobre o pedido de revisão do ato de concessão de benefício previdenciário" },
  { area: "Direito Público", court: "PRIMEIRA TURMA", head: "ADMINISTRATIVO", topic: "FORNECIMENTO DE ENERGIA ELÉTRICA. CORTE. DÉBITO PRETÉRITO", sentence: "É ilegítimo o corte do fornecimento de energia elétrica em razão de débito pretérito" },
  { area: "Direito Penal", court: "QUINTA TURMA", head: "PENAL", topic: "TRÁFICO DE DROGAS. MEDICAMENTO CONTROLADO. DOSIMETRIA", sentence: "A venda de medicamento controlado sem receita pode configurar tráfico de drogas, com reflexo na dosimetria" },
  { area: "Direito Penal", court: "SEXTA TURMA", head: "PENAL", topic: "ESTELIONATO. FRAUDE BANCÁRIA. PRISÃO PREVENTIVA", sentence: "A fraude bancária reiterada contra idosos justifica a prisão preventiva para garantia da ordem pública" },
  { area: "Direito Penal", court: "QUINTA TURMA", head: "PENAL", topic: "LESÃO CORPORAL. HOSPITAL. ERRO DE TIPO", sentence: "Não se reconhece erro de tipo na lesão corporal praticada contra profissional de hospital" },
  { area: "Direito Privado", court: "QUARTA TURMA", head: "CIVIL", topic: "LOCAÇÃO. ATRASO NO PAGAMENTO DE ALUGUEL. DESPEJO", sentence: "O atraso reiterado no pagamento do aluguel autoriza o despejo por falta de pagamento" },
]

const CLOSINGS = ["Recurso especial não provido.", "Recurso especial provido.", "Agravo interno não provido.", "Recurso especial parcialmente provido."]

export function noiseCorpus(count: number): JurisprudenceDecision[] {
  return Array.from({ length: count }, (_, i) => {
    const t = NOISE_TOPICS[i % NOISE_TOPICS.length]
    const n = String(i + 1).padStart(12, "0")
    const year = 2019 + (i % 6)
    const month = String((i % 12) + 1).padStart(2, "0")
    return {
      id: `f1000000-0000-4000-8000-${n}`,
      provider: FICTITIOUS_PROVIDER,
      tribunal: "STJ",
      externalId: `ficticio-ruido-${i + 1}`,
      processNumber: `98${String(i + 1).padStart(5, "0")}`,
      classCode: i % 3 ? "REsp" : "AgInt no REsp",
      court: t.court,
      rapporteur: `MINISTRO FICTÍCIO R${(i % 9) + 1}`,
      judgmentDate: `${year}-${month}-15`,
      area: t.area,
      degree: "Superior",
      subject: `${t.head}. ${t.topic}.`,
      ementa: `${t.head}. RECURSO ESPECIAL. ${t.topic}. 1. ${t.sentence}. 2. Caso fictício de número ${i + 1}, sem relação com outros. 3. ${CLOSINGS[i % CLOSINGS.length]}`,
      decisionText: `Acordam os Ministros, por unanimidade, ${i % 2 ? "negar" : "dar"} provimento ao recurso.`,
      legislation: [],
      sourceLabel: "Corpus de referência FICTÍCIO (avaliação)",
      updatedAt: "2026-10-14T00:00:00Z",
    }
  })
}

/** Ruído: sempre irrelevante, salvo onde o caso aceita qualquer decisão. */
export const isNoise = (id: string) => id.startsWith("f1")
