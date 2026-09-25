import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { diffCollection, diffState, orderCollection, type PersistedState } from "./storage"

const empty = (): PersistedState => ({
  clients: [],
  processes: [],
  tasks: [],
  taskColumns: [],
  appointments: [],
  appointmentCategories: [],
  documents: [],
  invoices: [],
  activities: [],
  notifications: [],
})

describe("sincronização com o banco", () => {
  it("grava só o que é novo ou mudou e apaga o que saiu", () => {
    const a = { id: "a", v: 1 }
    const b = { id: "b", v: 1 }
    const c = { id: "c", v: 1 }
    const b2 = { ...b, v: 2 }
    const d = { id: "d", v: 1 }
    const diff = diffCollection([a, b, c], [a, b2, d])
    assert.deepEqual(
      diff.upserts.map((x) => x.id),
      ["b", "d"],
    )
    assert.deepEqual(
      diff.deletes.map((x) => x.id),
      ["c"],
    )
  })

  it("não grava nada quando o estado não mudou", () => {
    const state = { ...empty(), clients: [{ id: "c1" }] as unknown as PersistedState["clients"] }
    assert.deepEqual(diffState(state, state), {})
    assert.deepEqual(diffState(state, { ...state }), {})
  })

  it("ignora coleção recriada com os mesmos objetos", () => {
    const client = { id: "c1" } as unknown as PersistedState["clients"][number]
    const prev = { ...empty(), clients: [client] }
    assert.deepEqual(diffState(prev, { ...prev, clients: [client] }), {})
  })

  it("aponta só as coleções alteradas", () => {
    const prev = empty()
    const task = { id: "t1" } as unknown as PersistedState["tasks"][number]
    const diff = diffState(prev, { ...prev, tasks: [task] })
    assert.deepEqual(Object.keys(diff), ["tasks"])
    assert.equal(diff.tasks?.upserts[0], task)
  })

  it("ordena como o store: mais novo no topo, ou cronológico", () => {
    const items = [
      { id: "1", createdAt: "2026-01-01T10:00:00" },
      { id: "2", createdAt: "2026-03-01T10:00:00" },
      { id: "3", createdAt: "2026-02-01T10:00:00" },
    ]
    assert.deepEqual(
      orderCollection("clients", items).map((x) => x.id),
      ["2", "3", "1"],
    )
    assert.deepEqual(
      orderCollection("appointments", items).map((x) => x.id),
      ["1", "3", "2"],
    )
  })
})
