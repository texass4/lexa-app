import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { JurisprudenceError } from "@/lib/services/jurisprudence/errors"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import {
  REFERENCE_CASES,
  REFERENCE_CORPUS,
  afterPipeline,
  beforePipeline,
  evaluate,
  inMemoryRetrieve,
  noiseCorpus,
} from "@/scripts/jurisprudence-reference/evaluate"
import { analyzeCase, withoutProcessData } from "./jurisprudence-case"
import { citationWarnings, unknownCitations, verifyLiteral } from "./jurisprudence-citations"
import { LEGAL_ISSUES, readOutcome, readStance } from "./jurisprudence-issues"
import { PIPELINE, QueryCache, comparativeLogEntry, retrievePrecedents, type RetrieveFn, type RetrievalDeps } from "./jurisprudence-pipeline"
import { describeCase, describePrecedent } from "./context/jurisprudence-comparative"
import { SourceRegistry } from "./context/shared"
import { NOW, makeDeps, processA, processB, promptText } from "./__fixtures__/data"
import { analyzeJurisprudenceStrategy, finalizeStrategy } from "./services/jurisprudence-strategy"
import type { AIError } from "./errors"
import type { JurisprudenceStrategy } from "./types"

/*
 * Tudo aqui é FICTÍCIO: o corpus de referência (scripts/jurisprudence-reference) imita o
 * formato do STJ, mas números, relatores e ementas não existem. Nenhuma chamada de rede,
 * nenhum banco: a recuperação é a simulação em memória das funções do banco. A medida com
 * a busca textual REAL do Postgres é `npm run jurisprudence:benchmark` (docs/JURISPRUDENCIA.md).
 */

const ID = (n: number) => `f0000000-0000-4000-8000-000000000${n}`
const byId = new Map(REFERENCE_CORPUS.map((d) => [d.id, d]))
const memory = inMemoryRetrieve([...REFERENCE_CORPUS, ...noiseCorpus(600)])

function deps(overrides: Partial<RetrievalDeps> = {}): RetrievalDeps {
  return {
    candidates: memory,
    loadFull: async (ids) => ids.map((id) => byId.get(id)!).filter(Boolean),
    cache: new QueryCache(),
    cacheScope: "org-teste",
    ...overrides,
  }
}

const run = (question: string, process?: Parameters<typeof analyzeCase>[0]["process"], o: Partial<RetrievalDeps> = {}) => retrievePrecedents({ question, process }, deps(o))
const ids = (r: Awaited<ReturnType<typeof run>>) => r.precedents.map((p) => p.decision.id)
const precedent = (r: Awaited<ReturnType<typeof run>>, n: number) => r.precedents.find((p) => p.decision.id === ID(n))

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return (error as AIError).code
  }
  return "ok"
}

const withSource = async <T,>(fn: () => Promise<T>) => {
  const previous = process.env.JURISPRUDENCIA_FONTES
  process.env.JURISPRUDENCIA_FONTES = "stj"
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.JURISPRUDENCIA_FONTES
    else process.env.JURISPRUDENCIA_FONTES = previous
  }
}

/* ------------------------------- o caso (etapa 0) ------------------------------- */

describe("análise do caso — antes da pesquisa", () => {
  it("questão, fatos (com origem e trecho literal), provas e lacunas; nada inventado", () => {
    const a = analyzeCase({
      question: "Meu cliente é consumidor e teve o nome negativado por um empréstimo que nunca contratou. Temos o boletim de ocorrência, mas não temos o comprovante da inscrição.",
    })
    assert.ok(!a.issues.some((i) => i.key === "negativacao_dano_moral"), "sem 'dano moral'/'indenização', a questão do catálogo não é presumida")
    const b = analyzeCase({
      question:
        "Meu cliente é consumidor e teve o nome negativado indevidamente em cadastro de inadimplentes por um empréstimo que nunca contratou; quer indenização. Temos o boletim de ocorrência, mas não temos o comprovante da inscrição.",
    })
    assert.equal(b.issues[0].key, "negativacao_dano_moral")
    assert.equal(b.position, "autor")
    const fraud = b.facts.find((f) => f.key === "fraude_terceiro")!
    assert.equal(fraud.source, "pergunta")
    assert.equal(fraud.quote, "nunca contratou")
    assert.deepEqual(
      b.evidence.map((e) => [e.key, e.status]),
      [
        ["comprovante_inscricao", "ausente"],
        ["boletim_ocorrencia", "mencionada"],
      ],
    )
    const proofOfInscription = b.issues[0].requirements[0]
    assert.equal(proofOfInscription.status, "prova ausente", "mencionar não é provar; dizer que falta fica como falta")
    assert.equal(b.depth, "completa")
    assert.ok(b.gaps.some((g) => /Fase processual não informada/.test(g)))
  })

  it("pergunta simples: profundidade curta, sem exigir fase, posição ou provas", () => {
    const a = analyzeCase({ question: "Há jurisprudência sobre ICMS sobre TUSD e TUST?" })
    assert.equal(a.depth, "simples")
    assert.equal(a.issues[0].key, "icms_tusd_tust")
    assert.equal(a.gaps.length, 0)
  })

  it("processo: questão e fatos vêm do cadastro autorizado, com a origem 'processo'; fase pela movimentação", () => {
    const a = analyzeCase({
      question: "Quais estratégias?",
      process: {
        area: "Cível",
        type: "Ação declaratória de inexistência de débito c/c indenização",
        subject: "Inclusão Indevida em Cadastro de Inadimplentes",
        notes: "Contrato fraudulento.",
        movements: [{ id: "m1", at: "2026-09-01T10:00:00", title: "Sentença" }],
      },
    })
    assert.equal(a.issues[0].key, "negativacao_dano_moral")
    assert.equal(a.issues[0].source, "processo")
    assert.equal(a.facts.find((f) => f.key === "fraude_terceiro")?.source, "processo")
    assert.match(a.phase!.text, /sentença proferida \(pela movimentação de 2026-09-01\)/)
  })

  it("posição do cliente: réu inverte 'favorável' e 'contrária'", async () => {
    const author = await run("Cabe dano moral pelo atraso na entrega de imóvel na planta?")
    const defendant = await run("Meu cliente é a construtora: cabe dano moral pelo atraso na entrega de imóvel na planta?")
    assert.equal(precedent(author, 202)?.stanceForClient, "contraria")
    assert.equal(precedent(defendant, 202)?.stanceForClient, "favoravel")
    assert.equal(precedent(defendant, 202)?.stance, "rejeita", "a posição quanto à TESE não muda")
  })
})

/* ---------------------- leitura da ementa (posição e resultado) ---------------------- */

describe("leitura da ementa: posição sobre a tese e resultado como escrito", () => {
  const atraso = LEGAL_ISSUES.find((i) => i.key === "inadimplemento_dano_moral")!
  it("'contudo' prevalece; 'salvo' é ressalva (não inverte); a oração vem literal", () => {
    const a1 = readStance(atraso, byId.get(ID(201))!.ementa)
    assert.equal(a1.stance, "acolhe")
    assert.ok(byId.get(ID(201))!.ementa.includes(a1.sentence!))
    const a2 = readStance(atraso, byId.get(ID(202))!.ementa)
    assert.equal(a2.stance, "rejeita")
    assert.match(a2.exception!, /^salvo a demonstração de circunstâncias excepcionais/)
  })
  it("resultado do julgamento: do dispositivo ou do último item da ementa; ausente fica ausente", () => {
    assert.equal(readOutcome(byId.get(ID(101))!), "por unanimidade, negar provimento ao agravo interno")
    assert.equal(readOutcome(byId.get(ID(109))!), "Agravo conhecido para não conhecer do recurso especial")
    assert.equal(readOutcome({ ementa: "TEMA. 1. Texto sem dispositivo." }), undefined)
  })
})

/* ------------------------------- os 12 cenários ------------------------------- */

describe("análise comparativa — cenários obrigatórios", () => {
  it("1. pergunta específica: precedentes diretamente relacionados, com resultado e posição lidos no texto", async () => {
    const r = await run(REFERENCE_CASES[0].pergunta)
    assert.deepEqual(new Set(ids(r).slice(0, 3)), new Set([ID(101), ID(102), ID(103)]))
    const p101 = precedent(r, 101)!
    assert.equal(p101.level, "aplicavel")
    assert.equal(p101.stance, "acolhe")
    assert.equal(p101.outcome, "por unanimidade, negar provimento ao agravo interno")
    assert.ok(p101.sharedFacts.some((f) => f.key === "fraude_terceiro"))
    assert.equal(r.support, "suficiente")
  })

  it("2. sinônimos e expressões diferentes: 'danos extrapatrimoniais' / 'órgão de proteção ao crédito' acham as mesmas", async () => {
    const r = await run(REFERENCE_CASES[1].pergunta)
    for (const n of [101, 102, 103]) assert.ok(ids(r).includes(ID(n)), String(n))
  })

  it("3. mesma matéria, fatos materialmente diferentes: a distinção aparece (com × sem registro na Anvisa)", async () => {
    const without = await run("O Estado é obrigado a fornecer medicamento importado sem registro na Anvisa a paciente sem condições financeiras?")
    assert.ok(precedent(without, 302)!.sharedFacts.some((f) => f.key === "sem_registro_anvisa"))
    assert.ok(precedent(without, 301)!.distinctions.some((d) => d.kind === "fato oposto" && /SEM registro/.test(d.text)))
    const withRegistry = await run("Fornecimento pelo Estado de medicamento com registro na Anvisa, não incorporado ao SUS; há laudo médico e o paciente não tem condições financeiras")
    assert.ok(precedent(withRegistry, 301)!.sharedFacts.some((f) => f.key === "registro_anvisa"))
    assert.ok(precedent(withRegistry, 302)!.distinctions.some((d) => d.kind === "fato oposto"))
    for (const r of [without, withRegistry]) {
      assert.ok(!ids(r).includes(ID(304)), "ICMS sobre medicamentos não é a questão")
      assert.ok(!ids(r).includes(ID(305)), "crime com medicamento não é a questão")
      assert.ok(!ids(r).includes(ID(306)), "plano de saúde não é o poder público")
    }
  })

  it("4. precedente contrário: incluído, identificado e com a ressalva; nunca descartado por ser contrário", async () => {
    const r = await run(REFERENCE_CASES[2].pergunta)
    const p = precedent(r, 202)!
    assert.equal(p.stanceForClient, "contraria")
    assert.ok(p.distinctions.some((d) => d.kind === "ressalva"))
    // Mesmo com o limite cheio de favoráveis, a contrária pertinente entra.
    const favorable = (n: number): JurisprudenceDecision => ({
      ...byId.get(ID(201))!,
      id: `f2000000-0000-4000-8000-00000000000${n}`,
      processNumber: `97000${n}`,
      subject: `CIVIL. ATRASO NA ENTREGA DE IMÓVEL. DANO MORAL. CASO ${n}.`,
    })
    const crowded = inMemoryRetrieve([...Array.from({ length: 8 }, (_, i) => favorable(i + 1)), byId.get(ID(202))!])
    const full = await run(REFERENCE_CASES[2].pergunta, undefined, { candidates: crowded })
    assert.equal(full.precedents.length, PIPELINE.maxPerIssue)
    assert.ok(ids(full).includes(ID(202)))
  })

  it("5. base sem decisões pertinentes: 'sem suporte suficiente' — nada de preencher com superficiais", async () => {
    const r = await run(REFERENCE_CASES.find((c) => c.id === "R6-sem-pertinentes")!.pergunta)
    assert.equal(r.precedents.length, 0)
    assert.equal(r.status, "sem_resultados")
    assert.equal(r.support, "insuficiente")
    assert.ok(r.queries.some((q) => q.status === "ok"), "a pesquisa foi feita (não confundir com 'não executada')")
  })

  it("6. falha da busca ≠ sem resultados; prazo esgotado e cancelamento são distintos", async () => {
    const broken: RetrieveFn = async () => {
      throw new JurisprudenceError("UNAVAILABLE", "fictício")
    }
    const failed = await run(REFERENCE_CASES[0].pergunta, undefined, { candidates: broken })
    assert.equal(failed.status, "indisponivel")
    assert.ok(failed.metrics.failedQueries > 0)
    const slow: RetrieveFn = async () => {
      throw new JurisprudenceError("TIMEOUT", "fictício")
    }
    assert.equal((await run(REFERENCE_CASES[0].pergunta, undefined, { candidates: slow })).queries[0].status, "tempo_esgotado")
    let calls = 0
    const controller = new AbortController()
    controller.abort()
    const cancelled = await run(REFERENCE_CASES[0].pergunta, undefined, {
      signal: controller.signal,
      candidates: async (...args) => {
        calls += 1
        return memory(...args)
      },
    })
    assert.equal(cancelled.status, "cancelada")
    assert.equal(calls, 0, "cancelado antes: nenhuma consulta à base")
  })

  it("7. duplicidade: decisões do mesmo processo viram uma — fica a de mérito, não os embargos", async () => {
    const r = await run(REFERENCE_CASES[0].pergunta)
    assert.ok(ids(r).includes(ID(101)))
    assert.ok(!ids(r).includes(ID(108)), "EDcl do mesmo processo não entra")
    assert.ok(r.metrics.duplicatesRemoved >= 1)
  })

  it("8. metadados incompletos: listados como ausentes, nunca completados", async () => {
    const r = await run(REFERENCE_CASES[0].pergunta)
    const p = precedent(r, 109)!
    assert.deepEqual(p.missingMetadata, ["número do processo", "relator", "data de publicação"])
    const described = describePrecedent(new SourceRegistry(), new Map(), p, r.analysis, { full: true })
    assert.equal(described.processo, "AREsp")
    assert.equal(described.relator, undefined)
    assert.deepEqual(described.metadados_ausentes, ["número do processo", "relator", "data de publicação"])
    assert.equal(described.resultado_do_julgamento, "Agravo conhecido para não conhecer do recurso especial")
  })

  it("9. muitos resultados irrelevantes: ANTES × DEPOIS nos casos de referência (com ruído)", async () => {
    const corpus = [...REFERENCE_CORPUS, ...noiseCorpus(600)]
    const before = await evaluate(beforePipeline, memory, corpus)
    const after = await evaluate(afterPipeline, memory, corpus)
    assert.ok(after.summary.irrelevant < before.summary.irrelevant, `irrelevantes: ${before.summary.irrelevant} → ${after.summary.irrelevant}`)
    assert.equal(after.summary.irrelevant, 0)
    assert.ok(after.summary.precision >= before.summary.precision)
    assert.ok(after.summary.recall >= before.summary.recall)
    assert.equal(after.summary.contraryFlagged, after.summary.contraryCases, "todas as contrárias identificadas")
    assert.equal(before.summary.contraryFlagged, 0)
    assert.equal(after.summary.duplicates, 0)
    assert.equal(after.summary.overclaim, 0, "pergunta ampla/sem tema: nada apresentado como aplicável")
    assert.ok(before.summary.overclaim > 0)
  })

  it("10. fidelidade: o modelo recebe número, ementa, data, órgão e resultado EXATAMENTE como na base", async () => {
    const r = await run(REFERENCE_CASES[0].pergunta)
    const p = precedent(r, 102)!
    const d = byId.get(ID(102))!
    const described = describePrecedent(new SourceRegistry(), new Map(), p, r.analysis, { full: true })
    assert.equal(described.processo, `${d.classCode} ${d.processNumber}`)
    assert.equal(described.ementa, d.ementa)
    assert.equal(described.orgao_julgador, d.court)
    assert.equal(described.data_do_julgamento, "19/09/2023")
    assert.equal(described.resultado_do_julgamento, "por unanimidade, dar provimento ao recurso especial")
    assert.ok(d.ementa.includes(described.trecho_da_posicao!))
    assert.equal(described.vigencia, "não verificada: a base não registra reforma, superação ou entendimento posterior")
  })

  it("11. isolamento: o cache nunca atravessa escritórios", async () => {
    let calls = 0
    const counting: RetrieveFn = async (...args) => {
      calls += 1
      return memory(...args)
    }
    const cache = new QueryCache()
    await run(REFERENCE_CASES[7].pergunta, undefined, { candidates: counting, cache, cacheScope: "org-a" })
    const first = calls
    await run(REFERENCE_CASES[7].pergunta, undefined, { candidates: counting, cache, cacheScope: "org-a" })
    assert.equal(calls, first, "mesmo escritório: do cache")
    const other = await run(REFERENCE_CASES[7].pergunta, undefined, { candidates: counting, cache, cacheScope: "org-b" })
    assert.equal(calls, first * 2, "outro escritório: consulta própria")
    assert.ok(other.queries.every((q) => !q.cached))
  })

  it("12. informações insuficientes: não pesquisa, diz o que falta; pergunta ampla não vira 'aplicável'", async () => {
    const empty = await run("Quais as chances deste caso?", { area: "Cível", type: "" })
    assert.equal(empty.status, "nao_executada")
    assert.equal(empty.queries.length, 0)
    assert.match(empty.notRun!, /não permitem identificar a questão jurídica/)
    const vague = await run("Há jurisprudência sobre responsabilidade civil e indenização por danos?")
    assert.ok(vague.precedents.length <= PIPELINE.maxVague)
    assert.ok(vague.precedents.every((p) => p.level === "relacionada"))
    assert.equal(vague.support, "insuficiente")
    assert.ok(vague.analysis.gaps.some((g) => /ampla demais/.test(g)))
  })
})

/* ------------------------------ limites e diagnóstico ------------------------------ */

describe("limites, prazo e log", () => {
  it("prazo total: depois do prazo, nenhuma consulta nova (registradas como 'puladas')", async () => {
    let late = false
    let calls = 0
    const r = await run(REFERENCE_CASES[0].pergunta, undefined, {
      clock: () => (late ? PIPELINE.budgetMs + 1 : 0),
      candidates: async (...args) => {
        calls += 1
        late = true
        return memory(...args)
      },
    })
    assert.equal(calls, 1)
    assert.ok(r.queries.slice(1).every((q) => q.status === "pulada"))
  })

  it("teto de candidatas por consulta e de precedentes enviados", async () => {
    const limits: number[] = []
    const r = await run(REFERENCE_CASES[0].pergunta, undefined, {
      candidates: async (g, f, limit, o) => {
        limits.push(limit)
        return memory(g, f, limit, o)
      },
    })
    assert.ok(limits.every((l) => l === PIPELINE.candidatesPerQuery))
    assert.ok(r.precedents.length <= PIPELINE.maxSelected)
  })

  it("log: ids, contagens e conceitos — nunca a pergunta, ementas ou fatos do caso", async () => {
    const question = "Cliente FULANO DE TAL teve negativação indevida e quer dano moral; empréstimo por fraude."
    const r = await run(question)
    const line = JSON.stringify(comparativeLogEntry(r))
    assert.ok(!line.includes("FULANO"))
    assert.ok(!line.includes(byId.get(ID(101))!.ementa.slice(0, 40)))
    assert.ok(!line.includes("fraude"), "fatos do caso não vão para o log")
    assert.match(line, /"selecionadas":\[\{"id":"f0000000/)
  })

  it("modo Jurisprudência: dados do processo servem à pesquisa, mas não vão ao modelo (nem nas distinções)", async () => {
    const full = analyzeCase({ question: "Há precedentes?", process: { area: "Cível", type: "Indenização", subject: "Inclusão Indevida em Cadastro de Inadimplentes", notes: "Cliente sigiloso XPTO; contrato fraudulento." } })
    const a = withoutProcessData(full)
    assert.equal(a.issues[0].key, "negativacao_dano_moral", "a questão continua identificada pelo processo")
    assert.equal(a.facts.length, 0)
    const text = JSON.stringify(describeCase(a, { withProcessData: false }))
    assert.ok(!text.includes("XPTO") && !text.includes("fraudulento") && !text.includes("Inclusão Indevida") && !text.includes("contratação fraudulenta"))
    const r = await retrievePrecedents(a, deps())
    const sent = JSON.stringify(r.precedents.map((p) => describePrecedent(new SourceRegistry(), new Map(), p, r.analysis, { full: false })))
    assert.ok(!/O caso (informa|tem) "contratação fraudulenta/.test(sent), "fato do processo não aparece nas distinções")
  })
})

/* ------------------------- conferência das citações da IA ------------------------- */

describe("integridade das fontes: conferência depois do modelo", () => {
  it("literal só se estiver na decisão (espaços/maiúsculas à parte; '[…]' separa partes)", () => {
    const ementa = byId.get(ID(103))!.ementa
    assert.ok(verifyLiteral("“Da anotação irregular em cadastro de proteção ao crédito não cabe indenização por dano moral”", [ementa]))
    assert.ok(verifyLiteral("Da anotação irregular em cadastro de proteção ao crédito […] ressalvado o direito ao cancelamento", [ementa]))
    assert.equal(verifyLiteral("Da anotação irregular sempre cabe indenização por dano moral", [ementa]), false)
  })

  it("citação com número fora dos dados, 'consolidado' e 'vigente' geram aviso", () => {
    const context = JSON.stringify({ processo: "REsp 9900102" })
    assert.deepEqual(unknownCitations(["Ver REsp 9900102 e o REsp 1.234.567/SP e a Súmula 385."], context), ["REsp 1.234.567/SP", "Súmula 385"])
    const warnings = citationWarnings(["É entendimento consolidado e continua vigente."], context)
    assert.equal(warnings.length, 2)
  })

  it("finalização: referência inventada sai; tese sem precedente sai; literal falso vira paráfrase", () => {
    const d = byId.get(ID(101))!
    const sources = { J1: { ref: "J1", kind: "jurisprudence" as const, id: d.id, label: "STJ" } }
    const out = finalizeStrategy(
      {
        sintese: "Questão de negativação [J1] e [J9].",
        precedentes: [
          { ref: "J1", por_que_importa: "Mesmo fato.", semelhancas: [], distincoes: [], compatibilidade: "", limitacoes: [], trechos: [
            { texto: "configura dano moral in re ipsa, dispensando a prova do prejuízo", tipo: "literal" },
            { texto: "o banco sempre responde por qualquer fraude", tipo: "literal" },
          ] },
          { ref: "J9", por_que_importa: "Inventada.", semelhancas: [], distincoes: [], compatibilidade: "", limitacoes: [], trechos: [] },
        ],
        teses_favoraveis: [
          { tese: "Dano moral presumido", justificativa: "x", requisitos: [], elementos_do_caso: [], refs: ["J1", "J7"], distincoes: [], riscos: [], informacoes_necessarias: [] },
          { tese: "Tese sem apoio na base", justificativa: "conhecimento geral", requisitos: [], elementos_do_caso: [], refs: [], distincoes: [], riscos: [], informacoes_necessarias: [] },
        ],
        contrarios_e_distincoes: [{ ref: "J8", fundamento_contrario: "x", distincao_possivel: "", como_demonstrar: "" }],
        riscos: [],
        lacunas_probatorias: [],
        cenarios: [],
        proximos_pontos: [],
        informacoes_ausentes: [],
      } satisfies JurisprudenceStrategy,
      sources,
      new Map([[d.id, d]]),
    )
    assert.equal(out.sintese, "Questão de negativação [J1] e.")
    assert.deepEqual(out.precedentes.map((p) => p.ref), ["J1"])
    assert.deepEqual(out.precedentes[0].trechos.map((t) => t.tipo), ["literal", "parafrase"])
    assert.match(out.precedentes[0].trechos[1].nota!, /não confere com o texto da decisão/)
    assert.deepEqual(out.teses_favoraveis.map((t) => [t.tese, t.refs]), [["Dano moral presumido", ["J1"]]])
    assert.equal(out.contrarios_e_distincoes.length, 0)
  })
})

/* ---------------------------- serviço (rota da análise) ---------------------------- */

describe("serviço da análise comparativa", () => {
  const corpusRows = (deps: ReturnType<typeof makeDeps>["deps"]) => {
    deps.jurisprudenceCache = new QueryCache()
    deps.jurisprudenceLog = () => {}
    deps.repo.jurisprudenceCandidates = (groups, filters, limit, options) => memory(groups, filters, limit, options)
    deps.repo.getJurisprudence = async (list) => list.map((id) => byId.get(id)!).filter(Boolean)
    return deps
  }
  const answer: JurisprudenceStrategy = {
    sintese: "A questão é se a inscrição indevida gera dano moral.",
    precedentes: [{ ref: "J1", por_que_importa: "Trata da mesma questão.", semelhancas: ["fraude"], distincoes: [], compatibilidade: "Útil.", limitacoes: [], trechos: [{ texto: "inventado como literal", tipo: "literal" }] }],
    teses_favoraveis: [],
    contrarios_e_distincoes: [],
    riscos: [{ texto: "Há entendimento consolidado contra, ver REsp 1.111.111/RS.", refs: ["J2"] }],
    lacunas_probatorias: [],
    cenarios: [],
    proximos_pontos: ["Conferir anotações anteriores."],
    informacoes_ausentes: [],
  }

  it("com precedentes: UMA chamada ao modelo, só com as decisões selecionadas; avisos da conferência", async () => {
    const { deps, calls } = makeDeps(() => answer)
    corpusRows(deps)
    const result = await withSource(() => analyzeJurisprudenceStrategy(deps, { question: REFERENCE_CASES[0].pergunta }))
    assert.equal(calls.length, 1)
    const sent = promptText(calls[0])
    assert.match(sent, /ANÁLISE COMPARATIVA/)
    assert.ok(sent.includes(byId.get(ID(101))!.ementa))
    assert.ok(!sent.includes(byId.get(ID(107))!.ementa), "decisão penal (outro ramo) não vai ao modelo")
    assert.ok(result.retrieval.precedentes.length > 0 && result.retrieval.precedentes.length <= PIPELINE.maxSelected)
    assert.equal(result.data.precedentes[0].trechos[0].tipo, "parafrase")
    assert.ok(result.warnings.some((w) => /REsp 1\.111\.111\/RS/.test(w)))
    assert.ok(result.warnings.some((w) => /consolidado/.test(w)))
    assert.ok(result.warnings.some((w) => /marcados como paráfrase/.test(w)))
    assert.equal(result.retrieval.support, "suficiente")
  })

  it("sem precedente pertinente: NÃO chama o modelo e diz que não há suporte suficiente", async () => {
    const { deps, calls } = makeDeps(() => answer)
    corpusRows(deps)
    const result = await withSource(() => analyzeJurisprudenceStrategy(deps, { question: "Há jurisprudência sobre usucapião extraordinária de imóvel rural?" }))
    assert.equal(calls.length, 0)
    assert.match(result.data.sintese, /não encontrou suporte suficiente/)
    assert.equal(result.retrieval.status, "sem_resultados")
  })

  it("base fora do ar: NÃO chama o modelo e diz que é erro técnico, não ausência", async () => {
    const { deps, calls } = makeDeps(() => answer)
    corpusRows(deps)
    deps.repo.jurisprudenceCandidates = async () => {
      throw new JurisprudenceError("UNAVAILABLE", "fictício")
    }
    const result = await withSource(() => analyzeJurisprudenceStrategy(deps, { question: REFERENCE_CASES[0].pergunta }))
    assert.equal(calls.length, 0)
    assert.equal(result.retrieval.status, "indisponivel")
    assert.match(result.data.sintese, /erro técnico, não ausência/)
  })

  it("processo de outro escritório → NOT_FOUND; sem permissão → FORBIDDEN; nada pesquisado", async () => {
    const { deps, calls } = makeDeps(() => answer)
    corpusRows(deps)
    let searched = 0
    deps.repo.jurisprudenceCandidates = async (...args) => {
      searched += 1
      return memory(...args)
    }
    assert.equal(await failure(withSource(() => analyzeJurisprudenceStrategy(deps, { question: "Estratégias?", processId: processB.id }))), "NOT_FOUND")
    const denied = makeDeps(() => answer, { permissions: ["clients.view"] })
    assert.equal(await failure(withSource(() => analyzeJurisprudenceStrategy(denied.deps, { question: "Estratégias?" }))), "FORBIDDEN")
    assert.equal(searched, 0)
    assert.equal(calls.length + denied.calls.length, 0)
  })

  it("processo do próprio escritório: os dados autorizados dele entram no caso", async () => {
    const { deps } = makeDeps(() => answer)
    corpusRows(deps)
    const result = await withSource(() => analyzeJurisprudenceStrategy(deps, { question: "Quais estratégias para este caso?", processId: processA.id }))
    assert.equal(result.retrieval.caso.profundidade, "completa")
    assert.ok(result.generatedAt.startsWith(NOW.toISOString().slice(0, 10)))
  })
})
