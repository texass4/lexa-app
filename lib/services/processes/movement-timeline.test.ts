import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ProcessMovement } from "@/types"
import { interpretMovements } from "./movement-interpreter"
import { buildTimeline, clusterLabel, pluralizeMovementTitle } from "./movement-timeline"

const unit = { code: "16293", name: "06ª - São Luís" }

const atos = (day: string, times: string[]): ProcessMovement[] =>
  times.map((time, i) => ({ id: `${day}-${i}`, at: `${day}T${time}:00`, title: "Ato ordinatório", code: 11383, judicialUnit: unit }))

describe("timeline por dia", () => {
  it("agrupa por data, mais recente primeiro, sem perder movimentações", () => {
    const list: ProcessMovement[] = [
      { id: "r", at: "2025-12-04T18:46:00", title: "Remessa" },
      { id: "e", at: "2025-12-04T22:16:00", title: "Expedição de documento", complements: [{ key: "tipo_de_documento", name: "Certidão" }] },
      { id: "a", at: "2025-09-20T12:21:00", title: "Ato ordinatório" },
    ]
    const days = buildTimeline(interpretMovements(list))
    assert.deepEqual(
      days.map((d) => d.date),
      ["2025-12-04", "2025-09-20"],
    )
    assert.deepEqual(
      days[0].items.map((i) => (i.type === "single" ? i.movement.id : i.key)),
      ["e", "r"],
    )
    assert.equal(
      days.reduce((sum, d) => sum + d.count, 0),
      3,
    )
  })

  it("junta visualmente repetições no mesmo dia, mantendo cada registro", () => {
    const list = atos("2026-01-08", ["14:36", "14:38", "14:40", "14:41", "14:42", "14:43", "14:44", "14:45"])
    const [day] = buildTimeline(interpretMovements(list))
    assert.equal(day.items.length, 1)
    const [cluster] = day.items
    assert.equal(cluster.type, "cluster")
    if (cluster.type !== "cluster") return
    assert.equal(cluster.label, "8 atos ordinatórios")
    assert.equal(cluster.movements.length, 8)
    assert.equal(cluster.to, "2026-01-08T14:45:00")
    assert.equal(cluster.from, "2026-01-08T14:36:00")
    assert.deepEqual(cluster.judicialUnit, unit)
    // Os registros originais continuam individuais.
    assert.equal(new Set(cluster.movements.map((m) => m.id)).size, 8)
  })

  it("não agrupa poucas repetições nem movimentos diferentes", () => {
    const list = [...atos("2026-01-08", ["14:40", "14:41"]), { id: "x", at: "2026-01-08T14:42:00", title: "Remessa" }]
    const [day] = buildTimeline(interpretMovements(list))
    assert.equal(day.items.length, 3)
    assert.ok(day.items.every((i) => i.type === "single"))
  })

  it("não junta repetições de dias diferentes", () => {
    const list = [...atos("2026-01-08", ["10:00", "11:00"]), ...atos("2026-01-07", ["10:00", "11:00"])]
    const days = buildTimeline(interpretMovements(list))
    assert.equal(days.length, 2)
    assert.ok(days.every((d) => d.items.every((i) => i.type === "single")))
  })

  it("não junta mesmo nome com complementos diferentes", () => {
    const doc = (id: string, time: string, name: string): ProcessMovement => ({
      id,
      at: `2025-12-04T${time}:00`,
      title: "Documento",
      complements: [{ key: "tipo_de_documento", name }],
    })
    const list = [doc("1", "10:00", "Certidão"), doc("2", "10:01", "Certidão"), doc("3", "10:02", "Mandado"), doc("4", "10:03", "Certidão")]
    const [day] = buildTimeline(interpretMovements(list))
    assert.ok(day.items.every((i) => i.type === "single"))
  })

  it("lida com lista vazia", () => {
    assert.deepEqual(buildTimeline([]), [])
  })
})

describe("plural dos nomes", () => {
  it("pluraliza o núcleo até o primeiro conector", () => {
    assert.equal(pluralizeMovementTitle("Ato ordinatório"), "Atos ordinatórios")
    assert.equal(pluralizeMovementTitle("Expedição de documento"), "Expedições de documento")
    assert.equal(pluralizeMovementTitle("Decurso de Prazo"), "Decursos de Prazo")
    assert.equal(pluralizeMovementTitle("Mero expediente"), "Meros expedientes")
    assert.equal(pluralizeMovementTitle("Entrega em carga/vista"), "Entregas em carga/vista")
    assert.equal(pluralizeMovementTitle("Baixa Definitiva"), "Baixas Definitivas")
  })

  it("desiste quando a regra simples não é confiável", () => {
    assert.equal(pluralizeMovementTitle("Expedida/Certificada"), null)
    assert.equal(clusterLabel("Expedida/Certificada", 6), "6× Expedida/Certificada")
  })

  it("monta o rótulo do grupo", () => {
    assert.equal(clusterLabel("Intimação", 4), "4 intimações")
    assert.equal(clusterLabel("Documento", 3), "3 documentos")
  })
})
