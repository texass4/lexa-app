import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fileSlug, toCsv } from "./export"

describe("exportação", () => {
  it("CSV com ponto e vírgula, escapando aspas, separadores e quebras de linha", () => {
    assert.equal(
      toCsv(
        ["Nome", "Obs"],
        [
          ["Ana", 'Diz "oi"; tchau'],
          ["Bia", undefined],
        ],
      ),
      'Nome;Obs\r\nAna;"Diz ""oi""; tchau"\r\nBia;',
    )
  })

  it("nome de arquivo sem acentos nem símbolos", () => {
    assert.equal(fileSlug("Maria José & Filhos Ltda."), "maria-jose-filhos-ltda")
    assert.equal(fileSlug("***"), "arquivo")
  })
})
