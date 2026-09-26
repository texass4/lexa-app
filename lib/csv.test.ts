import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { toCSV } from "./csv"

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
