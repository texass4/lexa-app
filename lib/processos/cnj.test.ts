import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatCNJ, hasValidCheckDigits, maskCNJ, onlyDigits, parseCNJ } from "@/lib/processos/cnj"
import { SIM_TJSP, SIM_UNKNOWN, withWrongCheckDigits } from "@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios"

/** Processos públicos reais, usados apenas como caso de teste. */
const REAL_A = "0000832-35.2018.4.01.3202"
const REAL_B = "1002739-52.2019.4.01.3700"

describe("formatação do CNJ", () => {
  it("remove pontuação", () => {
    assert.equal(onlyDigits(REAL_A), "00008323520184013202")
  })

  it("formata de volta para a máscara oficial", () => {
    assert.equal(formatCNJ("00008323520184013202"), REAL_A)
    // Entrada que não tem 20 dígitos volta como veio.
    assert.equal(formatCNJ("123"), "123")
  })

  it("aplica máscara progressiva durante a digitação", () => {
    assert.equal(maskCNJ("0000832"), "0000832")
    assert.equal(maskCNJ("000083235"), "0000832-35")
    assert.equal(maskCNJ("00008323520184013202"), REAL_A)
    // Ignora o excedente em vez de deixar o campo crescer sem limite.
    assert.equal(maskCNJ("000083235201840132029999"), REAL_A)
  })
})

describe("validação do CNJ", () => {
  it("valida o dígito verificador de números reais, com ou sem pontuação", () => {
    assert.ok(hasValidCheckDigits(REAL_A))
    assert.ok(hasValidCheckDigits("10027395220194013700"))
    assert.ok(hasValidCheckDigits(REAL_B))
    assert.ok(hasValidCheckDigits("0001814-45.1997.4.01.3700"))
  })

  it("rejeita dígito verificador incorreto", () => {
    assert.equal(hasValidCheckDigits("0000832-99.2018.4.01.3202"), false)
  })

  it("rejeita quantidade de dígitos diferente de 20", () => {
    assert.equal(hasValidCheckDigits("123"), false)
    assert.equal(hasValidCheckDigits(""), false)
  })
})

describe("partes do número CNJ (números SIMULADOS)", () => {
  it("lê sequencial, dígitos, ano, segmento, tribunal e unidade", () => {
    const parts = parseCNJ(formatCNJ(SIM_TJSP))
    assert.ok(parts)
    assert.equal(parts.digits, SIM_TJSP)
    assert.equal(parts.sequence, "1234567")
    assert.equal(parts.year, 2021)
    assert.equal(parts.segment, "8")
    assert.equal(parts.tribunalCode, "26")
    assert.equal(parts.unitCode, "0100")
    assert.equal(parts.checkDigitsValid, true)
  })

  it("lê o número com dígito verificador errado, mas marca como inválido", () => {
    const parts = parseCNJ(withWrongCheckDigits(SIM_TJSP))
    assert.ok(parts)
    assert.equal(parts.checkDigitsValid, false)
    assert.equal(hasValidCheckDigits(withWrongCheckDigits(SIM_TJSP)), false)
  })

  it("validade estrutural não depende de o tribunal existir", () => {
    // `8.99` não é tribunal, mas o número é bem formado e o DV confere.
    assert.equal(parseCNJ(SIM_UNKNOWN)?.checkDigitsValid, true)
  })

  it("devolve null fora de 20 dígitos", () => {
    assert.equal(parseCNJ("123"), null)
    assert.equal(parseCNJ(`${SIM_TJSP}1`), null)
    assert.equal(parseCNJ(""), null)
  })
})
