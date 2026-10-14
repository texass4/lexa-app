import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import { searchTermsFrom } from "./jurisprudence-intent"
import { loggableQuery, planQuery, singular } from "./jurisprudence-query"
import { RELEVANCE, decisionBranch, rankCandidates, retrievalLogEntry, type Candidate } from "./jurisprudence-relevance"

/*
 * TODAS as decisões abaixo são FICTÍCIAS, escritas para os testes: números, órgãos,
 * relatores e ementas não existem. Elas imitam o formato da base (verbetação em
 * maiúsculas no início da ementa, área pelo órgão julgador do STJ) só para exercitar a
 * classificação. Estes testes NÃO medem a qualidade na base real — para isso,
 * `scripts/jurisprudence-eval.ts` (ver docs/JURISPRUDENCIA.md).
 */

let seq = 0
function fict(patch: Partial<JurisprudenceDecision> & { ementa: string }): JurisprudenceDecision {
  seq += 1
  const n = String(seq).padStart(4, "0")
  return {
    id: `00000000-0000-4000-8000-00000000${n}`,
    provider: "stj",
    tribunal: "STJ",
    externalId: `ficticio-${n}`,
    processNumber: `FICT-${n}`,
    classCode: "REsp",
    court: "TURMA FICTÍCIA",
    rapporteur: "MINISTRO FICTÍCIO",
    judgmentDate: "2024-01-01",
    legislation: [],
    sourceLabel: "STJ — Portal de Dados Abertos",
    updatedAt: "2024-01-02T00:00:00Z",
    ...patch,
  }
}

const cand = (decision: JurisprudenceDecision, db?: Candidate["db"]): Candidate => ({ decision, db })

/** Pergunta da pessoa → plano, pelo mesmo caminho da conversa. */
const planFor = (question: string) => planQuery(question, searchTermsFrom(question))

const ids = (list: { decision: JurisprudenceDecision }[]) => list.map((r) => r.decision.id)
const reasonOf = (result: ReturnType<typeof rankCandidates>, id: string) => result.discarded.find((d) => d.id === id)?.reason

describe("jurisprudência na IA — plano da pesquisa (etapa separada)", () => {
  it("guarda a pergunta original; o tema vai sem as palavras do pedido", () => {
    const question = "Há jurisprudência sobre negativação indevida e dano moral?"
    const plan = planFor(question)
    assert.equal(plan.original, question)
    assert.deepEqual(
      plan.concepts.map((c) => c.key),
      ["negativacao_indevida", "dano_moral"],
    )
    assert.deepEqual(plan.branches, ["privado"])
  })

  it("singular/plural e sinônimo do dicionário: 'danos morais' é o mesmo conceito", () => {
    assert.equal(singular("morais"), "moral")
    assert.equal(singular("danos"), "dano")
    assert.equal(singular("indenizacoes"), "indenizacao")
    assert.deepEqual(
      planFor("precedentes sobre danos extrapatrimoniais").concepts.map((c) => c.key),
      ["dano_moral"],
    )
  })

  it("'atraso' sozinho NÃO vira atraso contratual (sinônimo só com correspondência justificável)", () => {
    const plan = planFor("jurisprudência sobre atraso de benefício")
    assert.ok(!plan.concepts.some((c) => c.key === "atraso_contratual"))
    assert.ok(plan.concepts.some((c) => c.key === "termo:atraso"))
  })

  it("pergunta longa não vira consulta ampla demais: teto de conceitos, o resto registrado", () => {
    const plan = planFor("jurisprudência sobre locação comercial renovatória aluguel fiador garantia benfeitorias retenção despejo multa")
    assert.ok(plan.concepts.length <= 6)
    assert.ok(plan.dropped.length > 0)
  })

  it("pedido de decisões recentes é reconhecido; sem pedido, a data não é critério", () => {
    assert.equal(planFor("decisões recentes sobre dano moral").wantsRecent, true)
    assert.equal(planFor("jurisprudência sobre dano moral").wantsRecent, false)
  })

  it("log da consulta não leva nome próprio nem número", () => {
    const plan = planFor("jurisprudência sobre negativação indevida de Fulano Beltrano 12345678900")
    const logged = loggableQuery(plan)
    assert.ok(!/fulano|beltrano/i.test(logged), logged)
    assert.ok(!/\d{5,}/.test(logged), logged)
    assert.match(logged, /negativação indevida/)
  })
})

describe("jurisprudência na IA — 1. negativação indevida e dano moral (FICTÍCIO)", () => {
  const plan = planFor("Há jurisprudência sobre negativação indevida e dano moral?")
  const related = fict({
    subject: "DIREITO DO CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. DANO MORAL",
    ementa:
      "DIREITO DO CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. DANO MORAL. A inscrição indevida do nome do consumidor em cadastro de inadimplentes gera dano moral (texto fictício de teste).",
    area: "Direito Privado",
  })
  const duplicate = fict({ ...related, id: "00000000-0000-4000-8000-00000000dup1", externalId: "ficticio-dup1", processNumber: related.processNumber })
  const otherBranch = fict({
    subject: "TRIBUTÁRIO. EXECUÇÃO FISCAL. INSCRIÇÃO EM DÍVIDA ATIVA",
    ementa: "TRIBUTÁRIO. EXECUÇÃO FISCAL. INSCRIÇÃO EM DÍVIDA ATIVA. Pedido de dano moral pela inscrição em dívida ativa afastado (texto fictício).",
    area: "Direito Público",
  })
  const fullTextOnly = fict({
    subject: "PREVIDENCIÁRIO. APOSENTADORIA POR IDADE",
    ementa: "PREVIDENCIÁRIO. APOSENTADORIA POR IDADE. Carência comprovada (texto fictício).",
    decisionText: "O autor menciona negativação indevida e dano moral em outro processo, sem relação com este (texto fictício).",
    area: "Direito Público",
  })
  const result = rankCandidates(plan, [otherBranch, fullTextOnly, duplicate, related].map((d) => cand(d)))

  it("a decisão realmente relacionada vem primeiro, como diretamente pertinente", () => {
    assert.equal(result.selected[0].level, "direta")
    assert.ok([related.id, duplicate.id].includes(result.selected[0].decision.id))
    assert.equal(result.selected[0].score, 100)
  })

  it("outro ramo com palavras parecidas: penalizada e abaixo do limiar (não vai à IA)", () => {
    assert.match(reasonOf(result, otherBranch.id) ?? "", /abaixo do limiar.*ramo publico/)
    assert.ok(!ids(result.selected).includes(otherBranch.id))
  })

  it("termos só no texto integral: descartada mesmo tendo todas as palavras", () => {
    assert.equal(reasonOf(result, fullTextOnly.id), "termos só no texto integral")
  })

  it("duplicata do mesmo processo: uma só", () => {
    assert.equal(result.selected.length, 1)
    assert.match(result.discarded.map((d) => d.reason).join("|"), /mesmo processo/)
  })

  it("trecho enviado é cópia literal da ementa, ligada à pergunta", () => {
    const excerpt = result.selected[0].excerpt!
    assert.equal(excerpt.field, "ementa")
    assert.ok(related.ementa.includes(excerpt.text))
    assert.match(excerpt.text, /cadastro de inadimplentes/)
  })

  it("pontuação rastreável: o detalhe por conceito explica o total", () => {
    const top = result.selected[0]
    assert.deepEqual(
      top.breakdown.map((b) => [b.concept, b.field, b.phrase]),
      [
        ["negativação indevida", "assunto", true],
        ["dano moral", "assunto", true],
      ],
    )
    const max = plan.concepts.reduce((sum, c) => sum + c.weight * (RELEVANCE.points.summary + RELEVANCE.phraseBonus), 0) + RELEVANCE.branchBonus
    const raw = top.breakdown.reduce((sum, b) => sum + b.points, 0) + RELEVANCE.branchBonus
    assert.equal(top.score, Math.round((100 * raw) / max))
  })
})

describe("jurisprudência na IA — 2. atraso contratual e indenização (FICTÍCIO)", () => {
  const plan = planFor("Cabe indenização por dano moral em caso de atraso contratual?")
  const related = fict({
    subject: "CIVIL. CONSUMIDOR. COMPRA E VENDA DE IMÓVEL. ATRASO NA ENTREGA. DANOS MORAIS",
    ementa:
      "CIVIL. CONSUMIDOR. COMPRA E VENDA DE IMÓVEL. ATRASO NA ENTREGA. DANOS MORAIS. O simples descumprimento contratual não gera, por si só, danos morais, salvo circunstâncias excepcionais (texto fictício).",
    area: "Direito Privado",
  })
  const otherBranch = fict({
    subject: "ADMINISTRATIVO. CONTRATO ADMINISTRATIVO. ATRASO NO PAGAMENTO. INDENIZAÇÃO",
    ementa:
      "ADMINISTRATIVO. CONTRATO ADMINISTRATIVO. ATRASO NO PAGAMENTO. INDENIZAÇÃO. Inadimplemento contratual da Administração; correção monetária devida (texto fictício).",
    area: "Direito Público",
  })
  const previdenciario = fict({
    subject: "PREVIDENCIÁRIO. BENEFÍCIO. PARCELAS EM ATRASO",
    ementa: "PREVIDENCIÁRIO. BENEFÍCIO. PARCELAS EM ATRASO. Correção monetária desde cada vencimento (texto fictício).",
    decisionText: "Pedido de dano moral pelo atraso afastado; não houve descumprimento contratual (texto fictício).",
    area: "Direito Público",
  })
  const result = rankCandidates(plan, [previdenciario, otherBranch, related].map((d) => cand(d)))

  it("decisão sobre atraso na entrega com 'danos morais' (plural) é a pertinente", () => {
    assert.deepEqual(ids(result.selected), [related.id])
    assert.equal(result.selected[0].level, "direta")
  })

  it("contrato administrativo (outro ramo) e previdenciária com 'atraso' não vão à IA", () => {
    assert.match(reasonOf(result, otherBranch.id) ?? "", /abaixo do limiar/)
    // "parcelas em atraso" não é atraso contratual; o resto está só no texto integral.
    assert.match(reasonOf(result, previdenciario.id) ?? "", /texto integral|genéricos|limiar/)
  })
})

describe("jurisprudência na IA — 3. erro médico e responsabilidade hospitalar (FICTÍCIO)", () => {
  const plan = planFor("Quais precedentes sobre erro médico e responsabilidade do hospital?")
  const subject = "CIVIL. RESPONSABILIDADE CIVIL. ERRO MÉDICO. RESPONSABILIDADE DO HOSPITAL"
  const related = [1, 2, 3].map((i) =>
    fict({
      subject,
      ementa: `${subject}. O hospital responde pelos danos decorrentes de erro médico de profissional do seu corpo clínico (texto fictício ${i}).`,
      area: "Direito Privado",
      judgmentDate: `202${i}-05-05`,
    }),
  )
  const penal = fict({
    subject: "PENAL. HOMICÍDIO CULPOSO. ERRO MÉDICO",
    ementa: "PENAL. HOMICÍDIO CULPOSO. ERRO MÉDICO. Imperícia não demonstrada; absolvição mantida (texto fictício).",
    area: "Direito Penal",
  })
  const fullTextOnly = fict({
    subject: "PROCESSUAL CIVIL. HONORÁRIOS ADVOCATÍCIOS",
    ementa: "PROCESSUAL CIVIL. HONORÁRIOS ADVOCATÍCIOS. Fixação por apreciação equitativa (texto fictício).",
    decisionText: "Na origem, ação de indenização por erro médico contra hospital (texto fictício).",
  })
  const result = rankCandidates(plan, [penal, fullTextOnly, ...related].map((d) => cand(d)))

  it("a decisão cível sobre hospital vem primeiro; a penal (outro ramo) não vai à IA", () => {
    assert.equal(result.selected[0].level, "direta")
    assert.ok(related.map((d) => d.id).includes(result.selected[0].decision.id))
    assert.match(reasonOf(result, penal.id) ?? "", /abaixo do limiar.*ramo penal/)
  })

  it("excesso do mesmo assunto: no máximo 2 decisões com o mesmo assunto", () => {
    assert.equal(result.selected.filter((r) => r.decision.subject === subject).length, RELEVANCE.maxPerSubject)
    assert.match(result.discarded.map((d) => d.reason).join("|"), /assunto repetido/)
  })

  it("data é só desempate: com a mesma pontuação, a mais recente primeiro", () => {
    assert.deepEqual(
      result.selected.map((r) => r.decision.judgmentDate),
      ["2023-05-05", "2022-05-05"],
    )
  })

  it("termos só no texto integral: descartada", () => {
    assert.equal(reasonOf(result, fullTextOnly.id), "termos só no texto integral")
  })
})

describe("jurisprudência na IA — 4. fornecimento de medicamento (FICTÍCIO)", () => {
  const plan = planFor("Há jurisprudência sobre fornecimento de medicamento pelo Estado?")
  const related = fict({
    subject: "ADMINISTRATIVO. SAÚDE. FORNECIMENTO DE MEDICAMENTOS. DEVER DO ESTADO",
    ementa: "ADMINISTRATIVO. SAÚDE. FORNECIMENTO DE MEDICAMENTOS. DEVER DO ESTADO. Obrigação solidária dos entes federados (texto fictício).",
    area: "Direito Público",
  })
  const similarWords = fict({
    subject: "TRIBUTÁRIO. ICMS. MEDICAMENTOS. ISENÇÃO",
    ementa: "TRIBUTÁRIO. ICMS. MEDICAMENTOS. ISENÇÃO. Benefício fiscal concedido pelo Estado às operações com medicamentos (texto fictício).",
    area: "Direito Público",
  })
  const penal = fict({
    subject: "PENAL. FALSIFICAÇÃO DE MEDICAMENTOS",
    ementa: "PENAL. FALSIFICAÇÃO DE MEDICAMENTOS. Dosimetria mantida (texto fictício).",
    area: "Direito Penal",
  })
  const fullTextOnly = fict({
    subject: "PROCESSUAL CIVIL. MULTA COMINATÓRIA",
    ementa: "PROCESSUAL CIVIL. MULTA COMINATÓRIA. Redução do valor (texto fictício).",
    decisionText: "Obrigação de fornecimento de medicamento pelo Estado descumprida na origem (texto fictício).",
  })
  const result = rankCandidates(plan, [similarWords, penal, fullTextOnly, related].map((d) => cand(d)))

  it("'fornecimento de medicamentos' (frase) supera 'medicamentos' solto do mesmo ramo", () => {
    assert.equal(result.selected[0].decision.id, related.id)
    assert.equal(result.selected[0].level, "direta")
    const other = result.selected.find((r) => r.decision.id === similarWords.id)
    // Mesmo ramo, palavras parecidas: no máximo "relacionada", nunca direta.
    assert.ok(!other || other.level === "relacionada")
    assert.ok(!other || other.score < result.selected[0].score)
  })

  it("penal (outro ramo) e termos só no texto integral não vão à IA", () => {
    assert.ok(!ids(result.selected).includes(penal.id))
    assert.equal(reasonOf(result, fullTextOnly.id), "termos só no texto integral")
  })
})

describe("jurisprudência na IA — 5. questão tributária: ICMS sobre TUSD/TUST (FICTÍCIO)", () => {
  const plan = planFor("Qual o entendimento sobre ICMS sobre TUSD e TUST?")
  const related = fict({
    subject: "TRIBUTÁRIO. ICMS. ENERGIA ELÉTRICA. TUSD E TUST. BASE DE CÁLCULO",
    ementa: "TRIBUTÁRIO. ICMS. ENERGIA ELÉTRICA. TUSD E TUST. BASE DE CÁLCULO. As tarifas integram a base de cálculo do imposto (texto fictício).",
    area: "Direito Público",
  })
  const duplicate = fict({ ...related, id: "00000000-0000-4000-8000-00000000dup5", externalId: "ficticio-dup5", processNumber: related.processNumber, judgmentDate: "2025-01-01" })
  const otherBranch = fict({
    subject: "CIVIL. CONSUMIDOR. ENERGIA ELÉTRICA. COBRANÇA INDEVIDA",
    ementa: "CIVIL. CONSUMIDOR. ENERGIA ELÉTRICA. COBRANÇA INDEVIDA. Repetição do valor cobrado a maior, inclusive o ICMS destacado na fatura (texto fictício).",
    area: "Direito Privado",
  })
  const fullTextOnly = fict({
    subject: "PROCESSUAL CIVIL. EMBARGOS DE DECLARAÇÃO",
    ementa: "PROCESSUAL CIVIL. EMBARGOS DE DECLARAÇÃO. Omissão inexistente (texto fictício).",
    decisionText: "Discute-se, na origem, o ICMS sobre TUSD e TUST (texto fictício).",
  })
  const result = rankCandidates(plan, [otherBranch, fullTextOnly, duplicate, related].map((d) => cand(d)))

  it("decisão sobre ICMS/TUSD/TUST é direta; a cível que só cita ICMS é descartada", () => {
    assert.equal(result.selected.length, 1)
    assert.equal(result.selected[0].level, "direta")
    assert.match(reasonOf(result, otherBranch.id) ?? "", /abaixo do limiar.*ramo privado/)
    assert.equal(reasonOf(result, fullTextOnly.id), "termos só no texto integral")
  })

  it("duplicata do mesmo processo é consolidada (fica a de maior pontuação/mais recente)", () => {
    assert.equal(result.selected[0].decision.id, duplicate.id)
    assert.match(reasonOf(result, related.id) ?? "", /mesmo processo/)
  })
})

describe("jurisprudência na IA — evidência insuficiente e regras gerais (FICTÍCIO)", () => {
  it("só candidatas irrelevantes: nada vai à IA (a resposta deve admitir falta de evidência)", () => {
    const plan = planFor("Há jurisprudência sobre negativação indevida?")
    const unrelated = fict({ subject: "PENAL. ROUBO", ementa: "PENAL. ROUBO. Dosimetria (texto fictício).", decisionText: "negativação indevida citada de passagem", area: "Direito Penal" })
    const result = rankCandidates(plan, [cand(unrelated)])
    assert.equal(result.selected.length, 0)
    assert.equal(result.stats.approved, 0)
  })

  it("conceito genérico sozinho ('indenização') no assunto não torna a decisão pertinente", () => {
    const plan = planFor("jurisprudência sobre indenização por erro médico")
    const generic = fict({ subject: "ADMINISTRATIVO. DESAPROPRIAÇÃO. INDENIZAÇÃO", ementa: "ADMINISTRATIVO. DESAPROPRIAÇÃO. INDENIZAÇÃO. Justo preço (texto fictício).", area: "Direito Público" })
    const result = rankCandidates(plan, [cand(generic)])
    assert.equal(reasonOf(result, generic.id), "só conceitos genéricos no assunto/ementa")
  })

  it("o que o banco achou com o redutor do Postgres conta (sem bônus); só no texto integral, pouco", () => {
    const plan = planFor("jurisprudência sobre dano moral")
    const d = fict({ subject: "CIVIL. TEMA FICTÍCIO", ementa: "CIVIL. TEMA FICTÍCIO. Ementa sem as palavras (texto fictício).", area: "Direito Privado" })
    const viaDb = rankCandidates(plan, [cand(d, { a: [0], b: [], c: [] })])
    assert.equal(viaDb.selected[0]?.breakdown[0].field, "ementa")
    const onlyC = rankCandidates(plan, [cand(d, { a: [], b: [], c: [0] })])
    assert.equal(reasonOf(onlyC, d.id), "termos só no texto integral")
  })

  it("pedido de recentes: dentro do mesmo nível, a data passa a ordenar", () => {
    const plan = planFor("decisões recentes sobre dano moral")
    const older = fict({ subject: "CIVIL. DANO MORAL. QUANTUM", ementa: "CIVIL. DANO MORAL. QUANTUM. Valor mantido (texto fictício A).", area: "Direito Privado", judgmentDate: "2019-01-01" })
    const newer = fict({ subject: "CIVIL. DANO MORAL. PROVA", ementa: "CIVIL. DANO MORAL. PROVA. Dano moral in re ipsa afastado (texto fictício B).", area: "Direito Privado", judgmentDate: "2025-01-01" })
    assert.deepEqual(ids(rankCandidates(plan, [cand(older), cand(newer)]).selected), [newer.id, older.id])
  })

  it("ramo da decisão: cabeçalho do assunto primeiro, área da base depois", () => {
    assert.equal(decisionBranch({ subject: "TRIBUTÁRIO. ICMS", ementa: "x", area: "Direito Privado" }), "publico")
    assert.equal(decisionBranch({ subject: "PROCESSUAL CIVIL. AGRAVO", ementa: "x", area: "Direito Privado" }), "privado")
    assert.equal(decisionBranch({ subject: "PROCESSUAL CIVIL. AGRAVO", ementa: "x" }), undefined)
  })

  it("log da recuperação: ids, pontuações e motivos — sem ementa nem texto", () => {
    const plan = planFor("Há jurisprudência sobre negativação indevida?")
    const d = fict({ subject: "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA", ementa: "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. Ementa sigilosa de teste (texto fictício).", area: "Direito Privado" })
    const junk = fict({ subject: "PENAL. FURTO", ementa: "PENAL. FURTO. Outra ementa (texto fictício).", decisionText: "negativação indevida" })
    const entry = retrievalLogEntry(plan, rankCandidates(plan, [cand(d), cand(junk)]), { matched: 42, fallback: false, ms: 7 })
    const text = JSON.stringify(entry)
    assert.equal(entry.candidatas, 2)
    assert.equal(entry.aprovadas, 1)
    assert.equal(entry.na_base, 42)
    assert.deepEqual(entry.selecionadas.map((s) => s.id), [d.id])
    assert.equal(entry.descartadas[0].motivo, "termos só no texto integral")
    assert.ok(!text.includes("Ementa sigilosa"))
    assert.ok(!text.includes("Há jurisprudência"))
  })
})
