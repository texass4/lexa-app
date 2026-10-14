import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"
import type { ExternalProcess } from "@/lib/integrations/legal/types"
import type { Process } from "@/types"
import { mergeProcessSheet, newMovementsMessage } from "./process-sync"
import { buildProcessSheet } from "./sheet"

const CNJ = "00008323520184013202"
const sheet = buildProcessSheet(mapSearchResponse(trf1Response, CNJ) as ExternalProcess)

let seq = 0
const newId = () => `m_${seq++}`

const base: Process = {
  id: "p1",
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  number: sheet.number,
  code: "#103000",
  clientId: "c1",
  area: "Cível",
  type: "Procedimento comum",
  court: "1ª Vara",
  district: "TRF1",
  opposingParty: "União",
  status: "em_andamento",
  ownerId: "u1",
  claimValue: 0,
  distributedAt: "2018-01-01",
  lastMovementAt: "2018-01-01T00:00:00",
  movements: [],
  cnj: CNJ,
  className: "Classe do escritório",
  source: { provider: "datajud" },
}

describe("aplicar ficha reconsultada", () => {
  it("importa só o que é novo — aplicar duas vezes não duplica", () => {
    const first = mergeProcessSheet(base, sheet, "2026-09-29T08:00:00", { newId })
    assert.equal(first.imported.length, sheet.movements.length)
    const again = mergeProcessSheet(first.process, sheet, "2026-09-30T08:00:00", { newId })
    assert.equal(again.imported.length, 0)
    assert.equal(again.process.movements.length, sheet.movements.length)
    // Sem novidade, a lista de movimentações é a mesma (nada a regravar).
    assert.equal(again.process.movements, first.process.movements)
  })

  it("cadastro do escritório: a fonte complementa, mas não substitui o que foi preenchido à mão", () => {
    const manual: Process = {
      ...base,
      origin: "manual",
      source: undefined,
      className: undefined,
      tribunal: "TJSC (informado)",
      degree: "G2",
      judicialUnit: "Órgão do escritório",
    }
    const merged = mergeProcessSheet(manual, sheet, "2026-09-29T08:00:00", { newId }).process
    assert.equal(merged.tribunal, "TJSC (informado)")
    assert.equal(merged.degree, "G2")
    assert.equal(merged.judicialUnit, "Órgão do escritório")
    // Vazio no cadastro: a fonte preenche.
    assert.equal(merged.className, sheet.className)
    assert.equal(merged.origin, "manual")
    // Importado: a fonte é a referência.
    const imported = mergeProcessSheet({ ...base, tribunal: "Antigo" }, sheet, "2026-09-29T08:00:00", { newId }).process
    assert.equal(imported.tribunal, sheet.tribunal ?? "Antigo")
  })

  it("marca a sincronização automática só quando veio do monitoramento", () => {
    assert.equal(mergeProcessSheet(base, sheet, "2026-09-29T08:00:00", { newId }).process.autoSyncedAt, undefined)
    const auto = mergeProcessSheet(base, sheet, "2026-09-29T08:00:00", { newId, automatic: true }).process
    assert.equal(auto.autoSyncedAt, "2026-09-29T08:00:00")
    assert.equal(auto.lastSyncedAt, "2026-09-29T08:00:00")
  })

  it("datas de consulta nunca voltam no tempo (ficha antiga do cache)", () => {
    const current = { ...base, lastSyncedAt: "2026-09-29T10:00:00", autoSyncedAt: "2026-09-29T10:00:00" }
    const merged = mergeProcessSheet(current, sheet, "2026-09-29T07:00:00", { newId, automatic: true }).process
    assert.equal(merged.lastSyncedAt, "2026-09-29T10:00:00")
    assert.equal(merged.autoSyncedAt, "2026-09-29T10:00:00")
  })

  it("a fonte complementa, mas não apaga o que o escritório preencheu", () => {
    const sparse = { ...sheet, className: undefined, parties: { active: [], passive: [], others: [] } }
    const parties = { active: [{ name: "Cliente" }], passive: [], others: [] }
    const merged = mergeProcessSheet({ ...base, parties }, sparse, "2026-09-29T08:00:00", { newId }).process
    assert.equal(merged.className, "Classe do escritório")
    assert.deepEqual(merged.parties, parties)
  })

  it("frase da atividade", () => {
    assert.equal(newMovementsMessage(1, "#103000"), "Nova movimentação no processo #103000.")
    assert.equal(newMovementsMessage(3, "#103000"), "3 novas movimentações no processo #103000.")
  })
})

describe("tribunal: origem × atual na sincronização e na importação (DADOS SIMULADOS)", () => {
  it("sincronização grava a identificação com evidência e não troca o tribunal do cadastro manual", async () => {
    const sim = await import("@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios")
    const simSheet = buildProcessSheet(mapSearchResponse(sim.simTjspFirstDegree, sim.SIM_TJSP) as ExternalProcess)
    const manual: Process = { ...base, cnj: sim.SIM_TJSP, number: simSheet.number, origin: "manual", source: undefined, tribunal: "TJSP (informado pelo escritório)" }
    const { process } = mergeProcessSheet(manual, simSheet, "2026-10-14T08:00:00", { newId })
    assert.equal(process.tribunal, "TJSP (informado pelo escritório)")
    assert.equal(process.tribunalIdentification?.origin.acronym, "TJSP")
    assert.equal(process.tribunalIdentification?.current.status, "confirmed")
    assert.equal(process.tribunalIdentification?.current.checkedAt, "2026-10-14T08:00:00")
    // Comarca do cadastro intocada.
    assert.equal(process.district, manual.district)
  })

  it("processo antigo sem identificação ganha uma na próxima sincronização", () => {
    assert.equal(base.tribunalIdentification, undefined)
    const { process } = mergeProcessSheet(base, sheet, "2026-10-14T08:00:00", { newId })
    assert.equal(process.tribunalIdentification?.origin.acronym, "TRF1")
    assert.ok(process.tribunalIdentification?.current.status)
  })

  it("importação não usa a sigla do tribunal como comarca", async () => {
    const { buildProcessDraft } = await import("./import")
    const draft = buildProcessDraft(sheet, { clientId: "c", ownerId: "u", area: "Cível" }, "2026-10-14T08:00:00")
    assert.equal(draft.district, "")
    assert.equal(draft.tribunal, "TRF1")
    assert.equal(draft.tribunalIdentification?.origin.acronym, "TRF1")
    // Comarca informada por alguém é mantida.
    assert.equal(buildProcessDraft(sheet, { clientId: "c", ownerId: "u", area: "Cível", district: "Tefé" }, "2026-10-14T08:00:00").district, "Tefé")
  })
})

describe("relatório divergente aplicado e sincronizações seguintes (DADOS SIMULADOS)", () => {
  it("aplicar com as consultas do relatório guarda a divergência; sincronizar depois não a apaga; valores manuais ficam", async () => {
    const sim = await import("@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios")
    const { mapRecords } = await import("@/lib/integrations/legal/datajud/mapper")
    const { checkFromRecords, tribunalIdentificationOf } = await import("./tribunal-identification")
    const simSheet = buildProcessSheet(mapSearchResponse(sim.simTjspFirstDegree, sim.SIM_TJSP) as ExternalProcess)
    const stj = checkFromRecords({ tribunal: "STJ", role: "superior", dataset: "api_publica_stj", checkedAt: "2026-10-14T12:00:00.000Z", records: mapRecords(sim.simStjRecord, sim.SIM_TJSP) })
    const manual: Process = { ...base, cnj: sim.SIM_TJSP, number: simSheet.number, origin: "manual", source: undefined, tribunal: "TJSP (informado)", judicialUnit: "Vara do escritório" }

    const applied = mergeProcessSheet(manual, simSheet, "2026-10-14T09:00:00", { newId, checks: [stj] }).process
    assert.equal(applied.tribunalIdentification?.current.status, "conflicting")
    assert.equal(applied.tribunalIdentification?.current.acronym, undefined)
    assert.equal(applied.tribunalIdentification?.inferred, undefined)
    assert.deepEqual(applied.tribunalIdentification?.checks.map((c) => [c.role, c.tribunal, c.records.length]), [
      ["origem", "TJSP", 1],
      ["superior", "STJ", 1],
    ])
    // Valores do escritório preservados.
    assert.equal(applied.tribunal, "TJSP (informado)")
    assert.equal(applied.judicialUnit, "Vara do escritório")

    const synced = mergeProcessSheet(applied, simSheet, "2026-10-20T09:00:00", { newId, automatic: true }).process
    const id = tribunalIdentificationOf(synced)!
    assert.equal(id.current.status, "conflicting", "a sincronização só da origem não confirma o TJSP")
    assert.equal(id.checks.find((c) => c.role === "origem")?.checkedAt, "2026-10-20T09:00:00")
    assert.equal(id.checks.find((c) => c.role === "superior")?.checkedAt, "2026-10-14T09:00:00")
    assert.deepEqual(id.candidates?.map((c) => c.acronym).sort(), ["STJ", "TJSP"])
  })

  it("nova consulta ao superior sem registro desfaz a divergência (evidência mais nova vence)", async () => {
    const sim = await import("@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios")
    const { mapRecords } = await import("@/lib/integrations/legal/datajud/mapper")
    const { checkFromRecords } = await import("./tribunal-identification")
    const simSheet = buildProcessSheet(mapSearchResponse(sim.simTjspFirstDegree, sim.SIM_TJSP) as ExternalProcess)
    const stjFound = checkFromRecords({ tribunal: "STJ", role: "superior", dataset: "api_publica_stj", checkedAt: "2026-10-14T12:00:00.000Z", records: mapRecords(sim.simStjRecord, sim.SIM_TJSP) })
    const stjEmpty = checkFromRecords({ tribunal: "STJ", role: "superior", dataset: "api_publica_stj", checkedAt: "2026-11-01T12:00:00.000Z", records: [] })
    const start: Process = { ...base, cnj: sim.SIM_TJSP, number: simSheet.number }
    const first = mergeProcessSheet(start, simSheet, "2026-10-14T09:00:00", { newId, checks: [stjFound] }).process
    const second = mergeProcessSheet(first, simSheet, "2026-11-01T09:00:00", { newId, checks: [stjEmpty] }).process
    assert.equal(second.tribunalIdentification?.current.status, "confirmed")
    assert.equal(second.tribunalIdentification?.current.acronym, "TJSP")
  })
})
