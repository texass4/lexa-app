import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { syntheticCNJ } from "@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios"
import { originAcronym, originTribunal, tribunalName } from "./tribunals"

/* Números SIMULADOS (sintéticos, com DV válido) — um por segmento da Justiça. */

describe("tribunal de origem pelo número CNJ", () => {
  const cases: [string, string, string][] = [
    ["1", "00", "STF"],
    ["2", "00", "CNJ"],
    ["3", "00", "STJ"],
    ["4", "01", "TRF1"],
    ["4", "06", "TRF6"],
    ["5", "00", "TST"],
    ["5", "02", "TRT2"],
    ["5", "24", "TRT24"],
    ["6", "00", "TSE"],
    ["6", "26", "TRE-SP"],
    ["6", "01", "TRE-AC"],
    ["7", "00", "STM"],
    ["8", "26", "TJSP"],
    ["8", "07", "TJDFT"],
    ["8", "13", "TJMG"],
    ["9", "13", "TJMMG"],
    ["9", "21", "TJMRS"],
    ["9", "26", "TJMSP"],
  ]
  for (const [segment, tr, expected] of cases) {
    it(`${segment}.${tr} → ${expected}`, () => assert.equal(originAcronym(syntheticCNJ(segment, tr)), expected))
  }

  it("código inexistente na numeração fica sem tribunal", () => {
    assert.equal(originAcronym(syntheticCNJ("8", "99")), undefined)
    assert.equal(originAcronym(syntheticCNJ("9", "01")), undefined) // só MG, RS e SP têm TJM
    assert.equal(originAcronym(syntheticCNJ("4", "07")), undefined)
  })

  it("nomes por extenso, inclusive Eleitoral e Militar Estadual", () => {
    assert.equal(tribunalName("TRE-SP"), "Tribunal Regional Eleitoral de São Paulo")
    assert.equal(tribunalName("TJMMG"), "Tribunal de Justiça Militar do Estado de Minas Gerais")
    assert.equal(tribunalName("TJSP"), "Tribunal de Justiça do Estado de São Paulo")
    assert.equal(tribunalName("TRT2"), "Tribunal Regional do Trabalho da 2ª Região")
  })

  it("origem traz segmento e site institucional", () => {
    const tre = originTribunal(syntheticCNJ("6", "26"))
    assert.equal(tre?.segment, "Justiça Eleitoral")
    assert.equal(tre?.site, "https://www.tre-sp.jus.br")
  })
})
