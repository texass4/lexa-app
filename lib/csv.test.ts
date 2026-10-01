import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decodeCSV, detectDelimiter, parseCSV, toCSV } from "./csv"

describe("toCSV", () => {
  it("usa ';', BOM e escapa aspas, separadores e quebras de linha", () => {
    const csv = toCSV([
      ["Cliente", "Valor"],
      ['Ana "Souza"', 1500.5],
      ["Silva; Filhos", undefined],
    ])
    assert.equal(csv, '﻿Cliente;Valor\r\n"Ana ""Souza""";1.500,5\r\n"Silva; Filhos";')
  })
})

describe("parseCSV", () => {
  it("lê o CSV do Excel em português: ';', BOM, aspas e quebra de linha dentro de aspas", () => {
    const rows = parseCSV('﻿Nome;Obs\r\n"Silva; Filhos";"linha 1\nlinha 2"\r\nAna "A";x\r\n\r\n')
    assert.deepEqual(rows, [
      ["Nome", "Obs"],
      ["Silva; Filhos", "linha 1\nlinha 2"],
      ['Ana "A"', "x"],
    ])
  })

  it("aspas dobradas e separador detectado", () => {
    assert.equal(detectDelimiter("nome,email,telefone\nA,b,c"), ",")
    assert.equal(detectDelimiter("nome\temail"), "\t")
    assert.deepEqual(parseCSV('a,"b ""c"""\n1,2'), [
      ["a", 'b "c"'],
      ["1", "2"],
    ])
  })

  it("arquivo em Windows-1252 (Excel antigo) mantém os acentos", () => {
    const latin1 = new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]) // "João"
    assert.equal(decodeCSV(latin1), "João")
    assert.equal(decodeCSV(new TextEncoder().encode("﻿João")), "João")
  })
})
