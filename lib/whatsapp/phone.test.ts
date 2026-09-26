import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatPhone, normalizeWhatsAppPhone, phoneMatchKeys } from "./phone"

describe("telefones do WhatsApp", () => {
  it("normaliza números com máscara e assume o Brasil sem DDI", () => {
    assert.equal(normalizeWhatsAppPhone("(11) 99999-8888"), "5511999998888")
    assert.equal(normalizeWhatsAppPhone("+55 11 3333-4444"), "551133334444")
    assert.equal(normalizeWhatsAppPhone("5511999998888"), "5511999998888")
    assert.equal(normalizeWhatsAppPhone("+1 415 555 0100"), "14155550100")
    assert.equal(normalizeWhatsAppPhone("123"), null)
  })

  it("gera as duas formas do celular brasileiro (com e sem o nono dígito)", () => {
    assert.deepEqual(phoneMatchKeys("5511999998888"), ["11999998888", "1199998888"])
    assert.deepEqual(phoneMatchKeys("551199998888"), ["1199998888", "11999998888"])
  })

  it("não inventa nono dígito para telefone fixo", () => {
    assert.deepEqual(phoneMatchKeys("551133334444"), ["1133334444"])
  })

  it("números estrangeiros ficam como vieram", () => {
    assert.deepEqual(phoneMatchKeys("14155550100"), ["14155550100"])
  })

  it("formata para exibição", () => {
    assert.equal(formatPhone("5511999998888"), "+55 (11) 99999-8888")
    assert.equal(formatPhone("551133334444"), "+55 (11) 3333-4444")
    assert.equal(formatPhone("14155550100"), "+14155550100")
  })
})
