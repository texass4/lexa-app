import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Prazo } from "@/types"
import { nextPrazo, prazoPeriod, prazosOfProcess, validatePrazo, weekPrazos } from "@/lib/prazos/prazos"

const NOW = new Date(2026, 8, 24, 10, 0) // qui, 24/09/2026 — semana de 21 a 27/09

const prazo = (id: string, patch: Partial<Prazo> = {}): Prazo => ({
  id,
  organizationId: "org",
  createdAt: "2026-09-01T10:00:00",
  processId: "p1",
  description: `Prazo ${id}`,
  fatalDate: "2026-10-10",
  internalDate: "2026-10-08",
  responsibleId: "u1",
  origin: "manual",
  status: "aberto",
  createdById: "u1",
  ...patch,
})

describe("próximo prazo", () => {
  it("é o aberto de menor data fatal, ignorando cumpridos e perdidos", () => {
    const prazos = [
      prazo("a", { fatalDate: "2026-10-20" }),
      prazo("b", { fatalDate: "2026-09-30", status: "cumprido" }),
      prazo("c", { fatalDate: "2026-10-01" }),
      prazo("d", { fatalDate: "2026-09-25", status: "perdido" }),
    ]
    assert.equal(nextPrazo(prazos, "p1")?.id, "c")
  })

  it("só do processo pedido (ou de um conjunto de processos)", () => {
    const prazos = [prazo("a", { processId: "p2", fatalDate: "2026-09-26" }), prazo("b", { fatalDate: "2026-10-05" })]
    assert.equal(nextPrazo(prazos, "p1")?.id, "b")
    assert.equal(nextPrazo(prazos, new Set(["p1", "p2"]))?.id, "a")
    assert.equal(nextPrazo(prazos, "p3"), undefined)
    assert.equal(nextPrazo([]), undefined)
  })

  it("lista do processo: abertos por urgência, depois os encerrados", () => {
    const prazos = [prazo("a", { fatalDate: "2026-10-20" }), prazo("b", { status: "cumprido" }), prazo("c", { fatalDate: "2026-10-01" })]
    assert.deepEqual(
      prazosOfProcess(prazos, "p1").map((p) => p.id),
      ["c", "a", "b"],
    )
  })
})

describe("prazos da semana", () => {
  it("abertos até domingo (inclusive vencidos), agrupados por responsável", () => {
    const prazos = [
      prazo("hoje", { fatalDate: "2026-09-24", responsibleId: "u2" }),
      prazo("domingo", { fatalDate: "2026-09-27" }),
      prazo("vencido", { fatalDate: "2026-09-22" }),
      prazo("proxima-semana", { fatalDate: "2026-09-28" }),
      prazo("cumprido", { fatalDate: "2026-09-25", status: "cumprido" }),
    ]
    const groups = weekPrazos(prazos, NOW)
    assert.deepEqual(
      groups.map((g) => [g.responsibleId, g.prazos.map((p) => p.id)]),
      [
        ["u1", ["vencido", "domingo"]],
        ["u2", ["hoje"]],
      ],
    )
    assert.deepEqual(weekPrazos([], NOW), [])
  })
})

describe("validação do prazo", () => {
  const valid = {
    processId: "p1",
    description: "Contestação",
    fatalDate: "2026-10-10",
    internalDate: "2026-10-08",
    responsibleId: "u1",
    origin: "intimacao",
  }

  it("aceita um prazo completo", () => {
    assert.deepEqual(validatePrazo(valid), {})
  })

  it("exige descrição, datas, responsável, processo e origem válida", () => {
    const errors = validatePrazo({ processId: "", description: " ", fatalDate: "", internalDate: "2026-02-31", responsibleId: "", origin: "email" })
    assert.deepEqual(Object.keys(errors).sort(), ["description", "fatalDate", "internalDate", "origin", "processId", "responsibleId"])
  })

  it("data interna depois da fatal só com justificativa", () => {
    assert.ok(validatePrazo({ ...valid, internalDate: "2026-10-12" }).internalDateReason)
    assert.deepEqual(validatePrazo({ ...valid, internalDate: "2026-10-12", internalDateReason: "Protocolo combinado com o cliente" }), {})
  })
})

describe("período do prazo (panorama)", () => {
  it("vencido, hoje, até domingo, semana que vem e depois", () => {
    const period = (fatalDate: string, now = NOW) => prazoPeriod(prazo("x", { fatalDate }), now)
    assert.equal(period("2026-09-23"), "vencido")
    assert.equal(period("2026-09-24"), "hoje")
    assert.equal(period("2026-09-25"), "semana")
    assert.equal(period("2026-09-27"), "semana")
    assert.equal(period("2026-09-28"), "proxima")
    assert.equal(period("2026-10-04"), "proxima")
    assert.equal(period("2026-10-05"), "depois")
  })

  it("no domingo, o próprio domingo é hoje e segunda já é semana que vem", () => {
    const sunday = new Date(2026, 8, 27, 20, 0)
    assert.equal(prazoPeriod(prazo("x", { fatalDate: "2026-09-27" }), sunday), "hoje")
    assert.equal(prazoPeriod(prazo("x", { fatalDate: "2026-09-28" }), sunday), "proxima")
  })
})
