import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { suggestDeadline } from "@/lib/intimacoes/deadline"
import type { TriageItem } from "@/types"
import { finalizeInterpretation, interpretationContext, type InterpretInput, type Interpretation } from "./interpret"
import {
  byPriority,
  excerptOf,
  requiresAction,
  stateBadge,
  suggestedDeadline,
  summaryOf,
  tabOf,
  toTriageItem,
  upsertTriage,
  urgencyOf,
  type TriageDbRow,
} from "./model"
import { isRelevantMovement, movementTriageItems, RECENT_MOVEMENT_DAYS } from "./sources"

const TODAY = "2026-09-29"
const TEOR = "Fica a parte ré intimada para contestar no prazo de 15 (quinze) dias."

const row = (patch: Partial<TriageDbRow> = {}): TriageDbRow => ({
  id: "t1",
  organization_id: "org",
  kind: "intimacao",
  source: "djen",
  source_key: "1",
  intimacao_id: "t1",
  process_id: "p1",
  client_id: "c1",
  link_method: "cnj",
  cnj: "00008323520184013202",
  process_number: null,
  event_date: "2026-09-29",
  available_at: "2026-09-28",
  title: "Intimação",
  excerpt: "Fica a parte ré intimada…",
  tribunal: "TJSC",
  orgao: null,
  responsible_id: "ana",
  suggestion: null,
  ai: null,
  ai_status: "pendente",
  state: "pendente",
  decision: null,
  review_reason: null,
  decision_note: null,
  prazo_id: null,
  decided_by: null,
  decided_at: null,
  created_at: "2026-09-29T09:00:00Z",
  updated_at: "2026-09-29T09:00:00Z",
  ...patch,
})

const item = (patch: Partial<TriageDbRow> = {}): TriageItem => toTriageItem(row(patch))

describe("triagem: abas e estados", () => {
  it("cada evento fica em exatamente uma aba", () => {
    assert.equal(tabOf(item()), "a_revisar")
    assert.equal(tabOf(item({ process_id: null })), "sem_processo")
    assert.equal(tabOf(item({ state: "em_revisao", process_id: null })), "sem_processo")
    assert.equal(tabOf(item({ state: "em_revisao" })), "revisar")
    assert.equal(tabOf(item({ state: "decidido", decision: "sem_prazo" })), "decididos")
    assert.equal(tabOf(item({ state: "ignorado" })), "decididos")
  })

  it("decidido mostra a decisão", () => {
    assert.equal(stateBadge(item({ state: "decidido", decision: "prazo_criado" })).label, "Prazo criado")
    assert.equal(stateBadge(item({ state: "decidido", decision: "sem_prazo" })).label, "Sem prazo")
    assert.equal(stateBadge(item({ state: "em_revisao" })).label, "Em revisão")
  })

  it("tempo real não duplica e não volta para uma versão antiga", () => {
    const first = item()
    const newer = item({ state: "em_revisao", updated_at: "2026-09-29T10:00:00Z" })
    let list = upsertTriage([], first)
    list = upsertTriage(list, newer)
    list = upsertTriage(list, first) // evento atrasado
    assert.equal(list.length, 1)
    assert.equal(list[0].state, "em_revisao")
  })
})

describe("triagem: o que cada item mostra", () => {
  const suggestion = suggestDeadline({ availableAt: "2026-09-28", text: TEOR, tribunal: "TJSC" })

  it("prazo sugerido: o das regras primeiro; o da IA só quando as regras não acharam", () => {
    assert.equal(suggestedDeadline(item({ suggestion }))!.fatalDate, "2026-10-21")
    assert.equal(suggestedDeadline(item({ suggestion }))!.from, "teor")
    const none = suggestDeadline({ availableAt: "2026-09-28", text: "Ciência." })
    const fromAi = item({
      suggestion: none,
      ai: { summary: "x", requiresAction: "sim", term: { days: 5, unit: "uteis", excerpt: "em 5 dias" }, fatalDate: "2026-10-06", generatedAt: "" },
    })
    assert.equal(suggestedDeadline(fromAi)!.from, "ia")
    assert.equal(suggestedDeadline(item({ suggestion: none })), undefined)
  })

  it("exige ação: a IA quando interpretou; sem ela, só o que o teor afirma", () => {
    assert.deepEqual(requiresAction(item({ ai: { summary: "x", requiresAction: "nao", generatedAt: "" } })), { value: "nao", by: "ia" })
    assert.deepEqual(requiresAction(item({ suggestion })), { value: "sim", by: "teor" })
    assert.equal(requiresAction(item()), undefined)
  })

  it("resumo: o da IA, ou o começo do original", () => {
    assert.equal(summaryOf(item({ ai: { summary: "Intimada para contestar.", requiresAction: "sim", generatedAt: "" } })), "Intimada para contestar.")
    assert.equal(summaryOf(item()), "Fica a parte ré intimada…")
    assert.equal(excerptOf("<p>Intime-se&nbsp;a parte.</p><p>Cumpra-se.</p>"), "Intime-se a parte. Cumpra-se.")
  })

  it("prioridade: urgência, ação, prazo — decididos por último", () => {
    const soon = item({ id: "soon", suggestion: { ...suggestion, fatalDate: "2026-10-02" } })
    const later = item({ id: "later", suggestion })
    const noAction = item({ id: "info", ai: { summary: "Ciência.", requiresAction: "nao", generatedAt: "" } })
    const review = item({ id: "review", state: "em_revisao" })
    const done = item({ id: "done", state: "decidido", decision: "sem_prazo", suggestion: { ...suggestion, fatalDate: "2026-09-30" } })
    assert.equal(urgencyOf(soon, TODAY), "alta")
    assert.equal(urgencyOf(later, TODAY), "media")
    assert.equal(urgencyOf(noAction, TODAY), "baixa")
    assert.equal(urgencyOf(done, TODAY), "baixa")
    assert.deepEqual(
      [done, noAction, review, later, soon].sort(byPriority(TODAY)).map((i) => i.id),
      ["soon", "later", "review", "info", "done"],
    )
  })
})

describe("triagem: movimentações do DataJud", () => {
  it("só as que pedem atenção", () => {
    assert.equal(isRelevantMovement({ title: "Julgado procedente o pedido", code: 219 }), true)
    assert.equal(isRelevantMovement({ title: "Audiência de conciliação designada" }), true)
    assert.equal(isRelevantMovement({ title: "Decurso de Prazo" }), true)
    assert.equal(isRelevantMovement({ title: "Trânsito em julgado" }), true)
    assert.equal(isRelevantMovement({ title: "Juntada de Petição" }), false)
    assert.equal(isRelevantMovement({ title: "Conclusos para despacho" }), false)
    assert.equal(isRelevantMovement({ title: "Despacho de mero expediente" }), false)
    assert.equal(isRelevantMovement({ title: "Expedição de intimação" }), false) // o teor vem pelo DJEN
  })

  it("recentes, com o processo e o responsável; a chave não repete entre processos", () => {
    const items = movementTriageItems({
      organizationId: "org",
      process: { id: "p1", cnj: "00008323520184013202", number: "0000832-35.2018.4.01.3202", clientId: "c1", ownerId: "ana", tribunal: "TRF1" },
      movements: [
        { id: "m1", hash: "h1", at: "2026-09-25T10:00:00", title: "Sentença" },
        { id: "m2", hash: "h2", at: "2026-06-01T10:00:00", title: "Sentença" }, // antiga
        { id: "m3", hash: "h3", at: "2026-09-26T10:00:00", title: "Juntada de Petição" },
      ],
      today: TODAY,
    })
    assert.equal(RECENT_MOVEMENT_DAYS, 30)
    assert.equal(items.length, 1)
    assert.deepEqual(
      [items[0].source_key, items[0].process_id, items[0].client_id, items[0].responsible_id, items[0].event_date, items[0].link_method],
      ["p1:h1", "p1", "c1", "ana", "2026-09-25", "processo"],
    )
  })
})

describe("triagem: interpretação da IA", () => {
  const input = (patch: Partial<InterpretInput> = {}): InterpretInput => ({
    id: "t1",
    organizationId: "org",
    kind: "intimacao",
    title: "Intimação",
    text: TEOR,
    eventDate: "2026-09-29",
    availableAt: "2026-09-28",
    tribunal: "TJSC",
    suggestion: suggestDeadline({ availableAt: "2026-09-28", text: TEOR, tribunal: "TJSC" }),
    attempts: 0,
    ...patch,
  })
  const answer = (patch: Partial<Interpretation> = {}): Interpretation => ({
    resumo: "Parte ré intimada para contestar.",
    exigeAcao: "sim",
    motivo: "Determina a contestação.",
    prazoDias: "15",
    prazoContagem: "nao_informado",
    prazoTrecho: "no prazo de 15 (quinze) dias",
    ...patch,
  })
  const meta = { model: "gemini-2.5-flash", now: new Date("2026-09-29T09:00:00Z") }

  it("concorda com as regras: guarda resumo, ação e prazo, sem revisão", () => {
    const { ai, reviewReason } = finalizeInterpretation(input(), answer(), meta)
    assert.equal(ai.summary, "Parte ré intimada para contestar.")
    assert.equal(ai.requiresAction, "sim")
    assert.deepEqual(ai.term, { days: 15, unit: "uteis", excerpt: "no prazo de 15 (quinze) dias" })
    assert.equal(ai.fatalDate, undefined) // a data é a das regras, já sugerida
    assert.equal(reviewReason, undefined)
    assert.equal(ai.model, "gemini-2.5-flash")
  })

  it("trecho que não está no teor é descartado — a IA não inventa prazo", () => {
    const { ai, reviewReason } = finalizeInterpretation(input(), answer({ prazoDias: "10", prazoTrecho: "no prazo de 10 dias" }), meta)
    assert.equal(ai.term, undefined)
    assert.match(ai.discarded!, /não está no teor/)
    assert.equal(reviewReason, undefined)
  })

  it("número que não está no trecho também é descartado", () => {
    const { ai } = finalizeInterpretation(input(), answer({ prazoDias: "30" }), meta)
    assert.equal(ai.term, undefined)
  })

  it("divergência entre as regras e a IA: revisão manual", () => {
    const text = "Manifeste-se em 5 (cinco) dias. Após, no prazo de 10 dias, o réu."
    const suggestion = suggestDeadline({ availableAt: "2026-09-28", text: "Manifeste-se em 5 (cinco) dias." })
    const { reviewReason } = finalizeInterpretation(
      input({ text, suggestion }),
      answer({ prazoDias: "10", prazoTrecho: "no prazo de 10 dias" }),
      meta,
    )
    assert.match(reviewReason!, /divergem/)
  })

  it("as regras não acharam prazo, a IA achou no teor: data calculada pelas regras, com revisão", () => {
    const text = "Intime-se o autor para, querendo, se manifestar dentro de quinze dias sobre o laudo; após, conclusos."
    const suggestion = suggestDeadline({ availableAt: "2026-09-28", text: "Ciência." })
    const { ai, reviewReason } = finalizeInterpretation(input({ text, suggestion }), answer({ prazoTrecho: "dentro de quinze dias" }), meta)
    assert.equal(ai.fatalDate, "2026-10-21")
    assert.ok(ai.basis!.some((line) => /dias úteis/.test(line)))
    assert.match(reviewReason!, /lido só pela Íntegra IA/)
  })

  it("'incerto' e 'não exige' com prazo no teor pedem revisão", () => {
    assert.match(finalizeInterpretation(input(), answer({ exigeAcao: "incerto" }), meta).reviewReason!, /não conseguiu dizer/)
    assert.match(finalizeInterpretation(input(), answer({ exigeAcao: "nao" }), meta).reviewReason!, /entendeu que não exige ação/)
  })

  it("movimentação: resume, mas nunca calcula data (não há publicação)", () => {
    const movement = input({ kind: "movimentacao", text: "Sentença · Julgado procedente em 15 dias", availableAt: undefined, suggestion: undefined })
    const { ai } = finalizeInterpretation(movement, answer({ prazoTrecho: "procedente em 15 dias" }), meta)
    assert.equal(ai.fatalDate, undefined)
  })

  it("o modelo recebe só o evento, sem HTML", () => {
    const context = interpretationContext(input({ text: "<p>Intime-se.</p>" }))
    assert.equal(context.texto, "Intime-se.")
    assert.deepEqual(Object.keys(context).sort(), ["classe", "data", "texto", "tipo_evento", "titulo", "tribunal"])
  })
})
