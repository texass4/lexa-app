import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { byId, groupBy, groupOf, indexById, prazosByProcess, tasksByRelated } from "./indexes"

describe("índices em memória", () => {
  it("acha por id e guarda o índice por versão da lista", () => {
    const list = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ]
    assert.equal(byId(list, "b")?.n, 2)
    assert.equal(byId(list, undefined), undefined)
    assert.equal(byId(list, ""), undefined)
    assert.equal(indexById(list), indexById(list), "mesma lista: mesmo índice (não recalcula)")
    // O store é imutável: uma lista nova (registro alterado) tem índice novo.
    const next = list.map((item) => (item.id === "b" ? { ...item, n: 3 } : item))
    assert.equal(byId(next, "b")?.n, 3)
    assert.notEqual(indexById(next), indexById(list))
  })

  it("agrupa na ordem da lista e devolve vazio sem grupo", () => {
    const prazos = [
      { id: "1", processId: "p1" },
      { id: "2", processId: "p2" },
      { id: "3", processId: "p1" },
    ]
    assert.deepEqual(
      prazosByProcess(prazos, "p1").map((p) => p.id),
      ["1", "3"],
    )
    assert.deepEqual(prazosByProcess(prazos, "p9"), [])
    assert.equal(
      groupBy(prazos, "processId", (p) => p.processId),
      groupBy(prazos, "processId", (p) => p.processId),
    )
    assert.deepEqual(
      groupOf(prazos, "processId", (p) => p.processId, undefined),
      [],
    )
  })

  it("tarefas por registro vinculado (cliente ou processo)", () => {
    const tasks = [{ id: "t1", related: { type: "process", id: "p1" } }, { id: "t2", related: { type: "client", id: "c1" } }, { id: "t3" }]
    assert.deepEqual(
      tasksByRelated(tasks, "p1").map((t) => t.id),
      ["t1"],
    )
    assert.deepEqual(
      tasksByRelated(tasks, "c1").map((t) => t.id),
      ["t2"],
    )
  })
})
