import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { humanizeProcessMention, processNumberLabel, processSubject, processTitle } from "./label"

const base = { type: "Ação de cobrança", area: "Cível" as const, number: "00012345620268240001", code: "#103023" }

describe("identificação humana do processo", () => {
  it("cliente — tipo de ação, com o número como informação secundária", () => {
    assert.equal(processTitle(base, "João da Silva"), "João da Silva — Ação de cobrança")
    assert.equal(processNumberLabel(base), "0001234-56.2026.8.24.0001")
  })

  it("sem tipo usa a classe da fonte e, por fim, a área — nunca inventa", () => {
    assert.equal(processSubject({ ...base, type: "", className: "Procedimento Comum Cível" }), "Procedimento Comum Cível")
    assert.equal(processSubject({ ...base, type: "  ", area: "Trabalhista" }), "Processo trabalhista")
    assert.equal(processTitle({ ...base, type: "", area: "Trabalhista" }, "Maria"), "Maria — Processo trabalhista")
  })

  it("sem cliente mostra só o assunto; sem número, o código interno", () => {
    assert.equal(processTitle(base, undefined), "Ação de cobrança")
    assert.equal(processNumberLabel({ ...base, number: "" }), "#103023")
  })
})

describe("citação do processo em textos já gravados", () => {
  const label = "João da Silva — Ação de cobrança"
  it("trecho só com o processo vira o rótulo; no meio da frase, entre aspas", () => {
    assert.equal(
      humanizeProcessMention("Contestação · fatal em 27/10/2026 · Processo #103037", "#103037", label),
      `Contestação · fatal em 27/10/2026 · ${label}`,
    )
    assert.equal(humanizeProcessMention("Processo #103037 cadastrado.", "#103037", label), `Processo “${label}” cadastrado.`)
    assert.equal(
      humanizeProcessMention("2 novas movimentações no processo #103037.", "#103037", label),
      `2 novas movimentações no processo “${label}”.`,
    )
  })
  it("não mexe em outro processo nem em código parecido", () => {
    assert.equal(humanizeProcessMention("Processo #1030370 cadastrado.", "#103037", label), "Processo #1030370 cadastrado.")
    assert.equal(humanizeProcessMention("Processo #103099", "#103037", label), "Processo #103099")
  })
})
