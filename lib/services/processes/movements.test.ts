import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ProcessMovement } from "@/types"
import { collectHashes, diffMovements, externalMovementHash, movementHash } from "./movements"
import { toProcessMovements } from "./import"
import { buildProcessSheet } from "./sheet"
import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"

const CNJ = "00008323520184013202"

describe("hash de movimentação", () => {
  it("é determinístico para o mesmo conteúdo", () => {
    const input = { cnj: CNJ, code: 11383, name: "Ato ordinatório", occurredAt: "2024-07-03T14:20:00" }
    assert.equal(movementHash(input), movementHash({ ...input }))
  })

  it("ignora acento, caixa e espaçamento no texto", () => {
    const base = { cnj: CNJ, code: 26, occurredAt: "2018-10-29T10:05:00" }
    assert.equal(movementHash({ ...base, name: "Distribuição" }), movementHash({ ...base, name: "  DISTRIBUICAO  " }))
  })

  it("muda quando o conteúdo muda", () => {
    const base = { cnj: CNJ, code: 26, occurredAt: "2018-10-29T10:05:00", name: "Distribuição" }
    assert.notEqual(movementHash(base), movementHash({ ...base, code: 27 }))
    assert.notEqual(movementHash(base), movementHash({ ...base, occurredAt: "2018-10-30T10:05:00" }))
    assert.notEqual(movementHash(base), movementHash({ ...base, cnj: "10027395220194013700" }))
  })

  it("não depende da pontuação do número do processo", () => {
    const base = { code: 26, occurredAt: "2018-10-29T10:05:00", name: "Distribuição" }
    assert.equal(movementHash({ ...base, cnj: CNJ }), movementHash({ ...base, cnj: "0000832-35.2018.4.01.3202" }))
  })
})

describe("deduplicação", () => {
  const sheet = buildProcessSheet(mapSearchResponse(trf1Response, CNJ)!)

  it("importa tudo na primeira sincronização", () => {
    const incoming = toProcessMovements(sheet.movements, "datajud")
    const { fresh, known } = diffMovements(new Set<string>(), incoming)
    assert.equal(fresh.length, 3)
    assert.equal(known.length, 0)
  })

  it("não importa nada na segunda sincronização", () => {
    const incoming = toProcessMovements(sheet.movements, "datajud")
    const stored: ProcessMovement[] = incoming.map((movement, i) => ({ ...movement, id: `m${i}` }))
    const { fresh, known } = diffMovements(collectHashes(CNJ, stored), toProcessMovements(sheet.movements, "datajud"))
    assert.equal(fresh.length, 0)
    assert.equal(known.length, 3)
  })

  it("detecta apenas a movimentação inédita", () => {
    const stored: ProcessMovement[] = toProcessMovements(sheet.movements.slice(1), "datajud").map((m, i) => ({ ...m, id: `m${i}` }))
    const { fresh } = diffMovements(collectHashes(CNJ, stored), toProcessMovements(sheet.movements, "datajud"))
    assert.equal(fresh.length, 1)
    assert.equal(fresh[0].title, "Ato ordinatório")
  })

  it("reconhece movimentação antiga sem hash gravado, comparando conteúdo", () => {
    // Seeds da demo e cadastros manuais não têm hash — não podem duplicar.
    const legacy: ProcessMovement[] = [
      { id: "m1", at: "2024-07-03T14:20:00", title: "Ato ordinatório", description: "Praticado", kind: "other", code: 11383 },
    ]
    const { fresh } = diffMovements(collectHashes(CNJ, legacy), toProcessMovements(sheet.movements, "datajud"))
    assert.equal(fresh.length, 2)
    assert.equal(
      fresh.some((movement) => movement.title === "Ato ordinatório"),
      false,
    )
  })

  it("não duplica repetição vinda na mesma resposta", () => {
    const incoming = toProcessMovements(sheet.movements, "datajud")
    const { fresh } = diffMovements(new Set<string>(), [...incoming, ...incoming])
    assert.equal(fresh.length, 3)
  })

  it("gera o mesmo hash pela ficha e pelo modelo externo", () => {
    const external = mapSearchResponse(trf1Response, CNJ)!
    assert.equal(externalMovementHash(CNJ, external.movements[0]), sheet.movements[0].hash)
  })
})
