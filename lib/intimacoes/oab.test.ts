import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatOab, parseOabText, validateOab } from "./oab"

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
