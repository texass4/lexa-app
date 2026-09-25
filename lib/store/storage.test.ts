import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Process } from "@/types"
import { LEGACY_PROCESS_KEY, loadState, saveState, storageKey, type PersistedState, type StorageLike } from "./storage"

const ORG = "org_teste"

const memory = (limit = Infinity): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > limit) throw new Error("QuotaExceededError")
      data.set(key, value)
    },
  }
}

const process = (id: string, raw: unknown = { nome: "Documento", complementosTabelados: [] }): Process => ({
  id,
  organizationId: ORG,
  createdAt: "2026-09-24T10:00:00",
  number: "0001814-45.1997.4.01.3700",
  code: "#103000",
  clientId: "c",
  area: "Cível",
  type: "Cumprimento de sentença",
  court: "06ª - São Luís",
  district: "TRF1",
  opposingParty: "União",
  status: "em_andamento",
  ownerId: "u",
  claimValue: 0,
  distributedAt: "1997-01-01",
  lastMovementAt: "2026-01-08T14:45:00",
  movements: [{ id: "m1", at: "2026-01-08T14:45:00", title: "Documento", raw }],
})

const empty = (): PersistedState => ({
  clients: [],
  processes: [],
  tasks: [],
  appointments: [],
  appointmentCategories: [],
  documents: [],
  invoices: [],
  activities: [],
  notifications: [],
})

describe("armazenamento do escritório", () => {
  it("salva e carrega todas as listas, preservando o dado bruto", () => {
    const storage = memory()
    const state = {
      ...empty(),
      processes: [process("p1")],
      appointmentCategories: [{ id: "cat1", organizationId: ORG, createdAt: "2026-09-24T10:00:00", name: "Audiência", color: "#337EA9" }],
    }
    assert.equal(saveState(ORG, state, storage), "saved")
    const loaded = loadState(ORG, storage)
    assert.equal(loaded.processes?.[0].id, "p1")
    assert.deepEqual(loaded.processes?.[0].movements[0].raw, { nome: "Documento", complementosTabelados: [] })
    assert.equal(loaded.appointmentCategories?.[0].name, "Audiência")
    assert.deepEqual(loaded.clients, [])
  })

  it("separa os dados por organização", () => {
    const storage = memory()
    saveState(ORG, { ...empty(), processes: [process("p1")] }, storage)
    assert.deepEqual(loadState("outra_org", storage), {})
  })

  it("migra os processos salvos na chave antiga", () => {
    const storage = memory()
    storage.setItem(LEGACY_PROCESS_KEY, JSON.stringify({ version: 1, processes: [process("antigo")] }))
    assert.deepEqual(
      loadState(ORG, storage).processes?.map((p) => p.id),
      ["antigo"],
    )
  })

  it("sem espaço, salva sem o registro bruto em vez de perder o processo", () => {
    const storage = memory(2500)
    assert.equal(saveState(ORG, { ...empty(), processes: [process("p1", { big: "x".repeat(5000) })] }, storage), "saved-without-raw")
    const [loaded] = loadState(ORG, storage).processes ?? []
    assert.equal(loaded.id, "p1")
    assert.equal(loaded.movements[0].raw, undefined)
  })

  it("informa falha quando nem assim cabe", () => {
    assert.equal(saveState(ORG, { ...empty(), processes: [process("p1")] }, memory(10)), "failed")
  })

  it("ignora conteúdo corrompido e registros malformados", () => {
    const storage = memory()
    storage.setItem(storageKey(ORG), "{não é json")
    assert.deepEqual(loadState(ORG, storage), {})
    storage.setItem(storageKey(ORG), JSON.stringify({ version: 1, processes: [{ id: 1 }, process("ok")], clients: [{ nome: "sem id" }], tasks: "x" }))
    const loaded = loadState(ORG, storage)
    assert.deepEqual(
      loaded.processes?.map((p) => p.id),
      ["ok"],
    )
    assert.deepEqual(loaded.clients, [])
    assert.equal(loaded.tasks, undefined)
  })

  it("funciona sem storage disponível (servidor, modo privado)", () => {
    assert.deepEqual(loadState(ORG, null), {})
    assert.equal(saveState(ORG, empty(), null), "failed")
  })
})
