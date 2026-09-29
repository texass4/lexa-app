import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { addBusinessDays, addCalendarDeadline, easter, holidays, isBusinessDay, isSuspended, nextBusinessDay, subtractBusinessDays } from "./calendar"
import { findTerms, suggestDeadline } from "./deadline"
import { formatOab, parseOabText, validateOab } from "./oab"
import { byTriageOrder, isOpenTriage, statusAfterLink, toIntimacao, upsertIntimacao } from "./rows"

describe("calendário forense", () => {
  it("Páscoa e feriados móveis", () => {
    assert.equal(easter(2026), "2026-04-05")
    assert.equal(easter(2027), "2027-03-28")
    const h = holidays(2026)
    assert.equal(h.get("2026-02-16"), "Carnaval")
    assert.equal(h.get("2026-04-03"), "Sexta-feira Santa")
    assert.equal(h.get("2026-06-04"), "Corpus Christi")
    assert.equal(h.get("2026-11-20"), "Dia Nacional de Zumbi e da Consciência Negra")
    assert.equal(holidays(2023).has("2023-11-20"), false)
  })

  it("Justiça Federal tem os feriados da Lei 5.010/1966", () => {
    assert.equal(isBusinessDay("2026-08-11"), true)
    assert.equal(isBusinessDay("2026-08-11", { federal: true }), false)
  })

  it("dia útil seguinte pula fim de semana e feriado", () => {
    assert.equal(nextBusinessDay("2026-09-25"), "2026-09-28") // sexta → segunda
    assert.equal(nextBusinessDay("2026-11-19"), "2026-11-23") // 20/11 é feriado → segunda
  })

  it("dias úteis contam do dia 1 e param no recesso de 20/12 a 20/01", () => {
    assert.equal(addBusinessDays("2026-09-30", 1), "2026-09-30")
    assert.equal(addBusinessDays("2026-09-30", 15), "2026-10-21") // 12/10 feriado
    assert.equal(isSuspended("2026-12-20"), true)
    assert.equal(isSuspended("2027-01-21"), false)
    assert.equal(addBusinessDays("2026-12-17", 3), "2027-01-21")
  })

  it("dias corridos terminam em dia útil", () => {
    assert.equal(addCalendarDeadline("2026-09-30", 5), "2026-10-05") // 04/10 domingo → segunda
  })
})

describe("prazo no teor da intimação", () => {
  it("encontra o prazo escrito de várias formas, com o trecho original", () => {
    const [a] = findTerms("Intime-se a parte autora para, no prazo de 15 (quinze) dias úteis, manifestar-se sobre o laudo.")
    assert.deepEqual([a.value, a.unit, a.countUnit], [15, "dias", "uteis"])
    assert.match(a.excerpt, /prazo de 15 \(quinze\) dias úteis/)
    assert.equal(findTerms("Manifeste-se em 5 dias.")[0].value, 5)
    assert.equal(findTerms("no prazo de quinze dias")[0].value, 15)
    assert.equal(findTerms("no prazo de 48 horas")[0].unit, "horas")
  })

  it("cenário principal: disponibilizada ontem, prazo de 15 dias úteis", () => {
    const s = suggestDeadline({
      availableAt: "2026-09-28",
      text: "Fica intimada a parte ré para contestar no prazo de 15 (quinze) dias.",
      tribunal: "TJSC",
    })
    assert.equal(s.publishedAt, "2026-09-29")
    assert.equal(s.startAt, "2026-09-30")
    assert.equal(s.days, 15)
    assert.equal(s.fatalDate, "2026-10-21")
    assert.equal(s.confidence, "alta")
    assert.equal(s.daysSource, "teor")
    assert.match(s.basis.join(" "), /Lei 11\.419\/2006, art\. 4º, §3º/)
    assert.match(s.caveat, /feriados locais/)
  })

  it("dúvida vai para revisão — sem inventar prazo", () => {
    const none = suggestDeadline({ availableAt: "2026-09-28", text: "Ciência da decisão." })
    assert.equal(none.fatalDate, undefined)
    assert.equal(none.confidence, "revisao")
    assert.match(none.reasons[0], /Nenhum prazo explícito/)

    const two = suggestDeadline({ availableAt: "2026-09-28", text: "Autor em 5 dias; réu no prazo de 15 dias." })
    assert.equal(two.confidence, "revisao")
    assert.equal(two.fatalDate, undefined)

    assert.equal(
      suggestDeadline({ availableAt: "2026-09-28", text: "no prazo legal." }).reasons[0],
      'O teor fala em "prazo legal" sem dizer quantos dias: informe o prazo.',
    )
    assert.equal(suggestDeadline({ availableAt: "2026-09-28", text: "Pague em 48 horas." }).confidence, "revisao")

    const penal = suggestDeadline({
      availableAt: "2026-09-28",
      text: "Apresente alegações no prazo de 5 dias.",
      classe: "Ação Penal - Procedimento Ordinário",
    })
    assert.equal(penal.unit, "corridos")
    assert.equal(penal.confidence, "revisao")
  })

  it("dias informados pelo advogado", () => {
    const s = suggestDeadline({ availableAt: "2026-09-28", text: "Ciência.", days: 5 })
    assert.equal(s.fatalDate, "2026-10-06")
    assert.equal(s.daysSource, "advogado")
    assert.equal(s.confidence, "alta")
  })
})

describe("OAB", () => {
  it("valida e formata", () => {
    assert.equal(validateOab({ number: "12.345", uf: "sc" }), undefined)
    assert.equal(validateOab({ number: "", uf: "SC" }), "Informe o número da OAB.")
    assert.equal(validateOab({ number: "123", uf: "XX" }), "Escolha a UF da inscrição.")
    assert.equal(formatOab({ number: "123456", uf: "sp" }), "OAB/SP 123.456")
  })

  it("lê o texto livre antigo do perfil, sem inventar", () => {
    assert.deepEqual(parseOabText("OAB/SC 12.345"), [{ number: "12345", uf: "SC" }])
    assert.deepEqual(parseOabText("123456/SP; RS 4321"), [
      { number: "123456", uf: "SP" },
      { number: "4321", uf: "RS" },
    ])
    assert.deepEqual(parseOabText("12345"), [])
    assert.deepEqual(parseOabText(null), [])
  })
})

describe("caixa de triagem", () => {
  const base = {
    id: "i1",
    organization_id: "org",
    source: "djen" as const,
    external_id: "1",
    hash: null,
    oab_ids: ["oab1"],
    responsible_id: "ana",
    cnj: "00008323520184013202",
    process_number: null,
    tribunal: "TJSC",
    orgao: null,
    tipo_comunicacao: "Intimação",
    tipo_documento: null,
    classe: null,
    meio: null,
    available_at: "2026-09-28",
    published_at: "2026-09-29",
    content: "Teor",
    document_url: null,
    official_url: null,
    parties: null,
    lawyers: null,
    process_id: null,
    client_id: null,
    link_method: null,
    status: "sem_processo" as const,
    suggestion: null,
    prazo_id: null,
    decision_note: null,
    created_at: "2026-09-29T10:00:00Z",
    updated_at: "2026-09-29T10:00:00Z",
  }

  it("linha do banco → modelo da tela", () => {
    const i = toIntimacao(base)
    assert.equal(i.processId, undefined)
    assert.deepEqual(i.parties, [])
    assert.equal(i.responsibleId, "ana")
  })

  it("tempo real não duplica e não volta para uma versão antiga", () => {
    const first = toIntimacao(base)
    const newer = toIntimacao({ ...base, status: "revisao", updated_at: "2026-09-29T11:00:00Z" })
    let list = upsertIntimacao([], first)
    list = upsertIntimacao(list, newer)
    list = upsertIntimacao(list, first) // evento atrasado
    assert.equal(list.length, 1)
    assert.equal(list[0].status, "revisao")
  })

  it("vincular: a confiança da sugestão decide a situação", () => {
    assert.equal(statusAfterLink({ suggestion: suggestDeadline({ availableAt: "2026-09-28", text: "no prazo de 5 dias" }) }), "pendente")
    assert.equal(statusAfterLink({ suggestion: suggestDeadline({ availableAt: "2026-09-28", text: "Ciência." }) }), "revisao")
    assert.equal(statusAfterLink({}), "revisao")
  })

  it("abertas antes das decididas, mais novas primeiro", () => {
    const decided = toIntimacao({ ...base, id: "a", status: "confirmada", available_at: "2026-09-30" })
    const open = toIntimacao({ ...base, id: "b", available_at: "2026-09-01" })
    assert.deepEqual(
      [decided, open].sort(byTriageOrder).map((i) => i.id),
      ["b", "a"],
    )
    assert.equal(isOpenTriage(open), true)
  })

  it("data interna sugerida: dias úteis antes da fatal", () => {
    assert.equal(subtractBusinessDays("2026-10-21", 2), "2026-10-19")
    assert.equal(subtractBusinessDays("2026-10-13", 1), "2026-10-09") // 12/10 feriado
  })
})
