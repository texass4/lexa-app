import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { syntheticCNJ } from "./__fixtures__/tribunal-scenarios"
import { datasetFor, isCovered, superiorFor, tribunalFor, tribunalOfDataset } from "./tribunals"

/* Números SIMULADOS. Cobertura = índices já usados pela integração; TRE e TJM aguardam
   a confirmação dos nomes de índice na documentação oficial do DataJud. */

describe("cobertura do DataJud", () => {
  it("tribunal identificado não implica índice consultável", () => {
    assert.equal(tribunalFor(syntheticCNJ("8", "26")), "TJSP")
    assert.equal(tribunalFor(syntheticCNJ("6", "26")), undefined) // TRE-SP: identificado, sem índice confirmado
    assert.equal(tribunalFor(syntheticCNJ("9", "13")), undefined) // TJMMG
    assert.equal(tribunalFor(syntheticCNJ("1", "00")), undefined) // STF: fora do DataJud
    assert.equal(isCovered("TRE-SP"), false)
    assert.equal(isCovered("STJ"), true)
  })

  it("índice ↔ tribunal", () => {
    assert.equal(datasetFor("TJDFT"), "api_publica_tjdft")
    assert.equal(tribunalOfDataset("api_publica_trt2"), "TRT2")
    assert.equal(tribunalOfDataset("api_publica_desconhecido"), undefined)
    assert.equal(tribunalOfDataset(undefined), undefined)
  })

  it("superior complementar por segmento", () => {
    assert.equal(superiorFor(syntheticCNJ("8", "26")), "STJ")
    assert.equal(superiorFor(syntheticCNJ("4", "01")), "STJ")
    assert.equal(superiorFor(syntheticCNJ("5", "02")), "TST")
    assert.equal(superiorFor(syntheticCNJ("6", "26")), "TSE")
    // Número de tribunal superior (`TR` = 00): não há superior a consultar.
    assert.equal(superiorFor(syntheticCNJ("3", "00")), undefined)
    assert.equal(superiorFor(syntheticCNJ("5", "00")), undefined)
  })
})
