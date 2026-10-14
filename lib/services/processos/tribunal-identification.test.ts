import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapRecords, mapSearchResponse, type DataJudSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import * as sim from "@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios"
import type { ExternalProcess } from "@/lib/integrations/legal/types"
import type { Process } from "@/types"
import { buildProcessSheet } from "./sheet"
import {
  describeTribunalForAI,
  identifyFromSheet,
  identifyTribunal,
  originCheckFromSheet,
  transferSignal,
  tribunalIdentificationOf,
  type CheckInput,
} from "./tribunal-identification"

/* Todos os cenários usam DADOS SIMULADOS (`__fixtures__/tribunal-scenarios.ts`). */

const AT = "2026-10-14T12:00:00.000Z"

const sheetOf = (response: DataJudSearchResponse, cnj = sim.SIM_TJSP) => buildProcessSheet(mapSearchResponse(response, cnj) as ExternalProcess)
const origin = (response: DataJudSearchResponse, cnj = sim.SIM_TJSP): CheckInput => originCheckFromSheet(sheetOf(response, cnj), AT)
const superior = (status: CheckInput["status"], response: DataJudSearchResponse = sim.simEmpty, tribunal = "STJ"): CheckInput => ({
  tribunal,
  role: "superior",
  provider: "datajud",
  dataset: `api_publica_${tribunal.toLowerCase()}`,
  checkedAt: AT,
  status,
  records: mapRecords(response),
})
const originMiss = (status: "not_found" | "failed", tribunal = "TJSP"): CheckInput => ({
  tribunal,
  role: "origem",
  provider: "datajud",
  dataset: `api_publica_${tribunal.toLowerCase()}`,
  checkedAt: AT,
  status,
  records: [],
})

describe("tribunal atual — critérios de evidência", () => {
  it("confirma quando todos os critérios valem, com fonte, índice, grau e datas", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree)], AT)
    assert.equal(id.origin.acronym, "TJSP")
    assert.equal(id.origin.source, "cnj")
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "TJSP")
    assert.equal(id.current.degree, "G1")
    assert.equal(id.current.source, "datajud")
    assert.equal(id.current.dataset, "api_publica_tjsp")
    assert.equal(id.current.checkedAt, AT)
    assert.ok(id.current.updatedAt)
    assert.equal(id.inferred, undefined)
    assert.equal(id.checks[0].records.length, 1)
  })

  it("vários graus: confirma o tribunal, mas não escolhe o grau pelo mais recente", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspTwoDegrees)], AT)
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "TJSP")
    assert.equal(id.current.degree, undefined)
    assert.ok(id.current.reasons.some((r) => r.includes("mais de um grau")))
    assert.equal(id.checks[0].records.length, 2)
  })

  it("última movimentação de remessa: não confirma (recurso pode ter subido)", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspRemessa)], AT)
    assert.equal(id.current.status, "not_confirmed")
    assert.equal(id.current.acronym, undefined)
    assert.ok(id.current.reasons.some((r) => r.includes("Remessa")))
    assert.equal(id.inferred?.basis, "registro_mais_recente")
  })

  it("baixa definitiva: não confirma (autos podem ter voltado à origem)", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspBaixa)], AT)
    assert.equal(id.current.status, "not_confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("baixa")))
  })

  it("resposta incompleta — sem tribunal, sem data ou sem movimentações: não confirma", () => {
    for (const response of [sim.simMissingTribunal, sim.simMissingUpdatedAt, sim.simNoMovements]) {
      const id = identifyTribunal(sim.SIM_TJSP, [origin(response)], AT)
      assert.equal(id.current.status, "not_confirmed")
      assert.equal(id.current.acronym, undefined)
      assert.ok(id.inferred, "fica só a inferência")
    }
  })

  it("registro que se diz de outro tribunal no índice consultado: divergência", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simMismatchedTribunal)], AT)
    assert.equal(id.current.status, "conflicting")
    assert.equal(id.current.acronym, undefined)
  })

  it("grafia TJDF no registro conta como TJDFT (sem divergência falsa)", () => {
    const id = identifyTribunal(sim.SIM_TJDFT, [origin(sim.simTjdftAlias, sim.SIM_TJDFT)], AT)
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "TJDFT")
  })
})

describe("tribunal superior — consulta complementar", () => {
  it("resultados contraditórios: registros na origem e no superior → divergência, nada afirmado", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior("found", sim.simStjRecord)], AT)
    assert.equal(id.current.status, "conflicting")
    assert.equal(id.current.acronym, undefined)
    assert.ok(id.current.reasons[0].includes("TJSP") && id.current.reasons[0].includes("STJ"))
    // Inferência explícita: o registro atualizado mais recentemente (STJ).
    assert.equal(id.inferred?.acronym, "STJ")
    assert.equal(id.inferred?.basis, "registro_mais_recente")
  })

  it("só o superior tem registro: atual ≠ origem, com a origem preservada", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [originMiss("not_found"), superior("found", sim.simStjRecord)], AT)
    assert.equal(id.origin.acronym, "TJSP")
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "STJ")
    assert.equal(id.current.dataset, "api_publica_stj")
  })

  it("superior sem registro não prova nada e não derruba a confirmação da origem", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior("not_found")], AT)
    assert.equal(id.current.status, "confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("A ausência não prova")))
  })

  it("superior fora do ar: não confirma (pode haver registro lá)", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior("failed")], AT)
    assert.equal(id.current.status, "not_confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("STJ não respondeu")))
  })
})

describe("sem registro, sem fonte, número inválido", () => {
  it("nada na origem nem no superior: não localizado, sem afirmar tramitação", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [originMiss("not_found"), superior("not_found")], AT)
    assert.equal(id.current.status, "not_found")
    assert.equal(id.current.acronym, undefined)
    assert.equal(id.inferred?.basis, "cnj")
    assert.ok(id.current.reasons[0].includes("não prova"))
  })

  it("origem fora do ar: não verificado", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [originMiss("failed")], AT)
    assert.equal(id.current.status, "not_checked")
    assert.equal(id.checks[0].status, "failed")
  })

  it("tribunal sem índice (TRE, TJM, STF): origem identificada, atual sem fonte", () => {
    for (const cnj of [sim.SIM_TRE_SP, sim.SIM_TJMMG, sim.SIM_STF]) {
      const id = identifyTribunal(cnj, [], AT)
      assert.ok(id.origin.acronym)
      assert.equal(id.origin.covered, false)
      assert.equal(id.current.status, "unsupported")
    }
  })

  it("código de tribunal inexistente: sem origem e sem consulta", () => {
    const id = identifyTribunal(sim.SIM_UNKNOWN, [], AT)
    assert.equal(id.origin.acronym, undefined)
    assert.equal(id.current.status, "unsupported")
    assert.equal(id.inferred, undefined)
  })

  it("dígito verificador errado: nada identificado", () => {
    const id = identifyTribunal(sim.withWrongCheckDigits(sim.SIM_TJSP), [], AT)
    assert.equal(id.origin.acronym, undefined)
    assert.equal(id.current.status, "not_checked")
  })
})

describe("dados antigos, sem os campos novos", () => {
  it("ficha antiga do cache (sem `records`) usa os campos da própria ficha", () => {
    const { records: _records, ...old } = sheetOf(sim.simTjspFirstDegree)
    void _records
    const id = identifyFromSheet(old, AT)
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "TJSP")
  })

  it("processo salvo antes da verificação: origem pelo número, atual não verificado", () => {
    const legacy = { cnj: sim.SIM_TJSP, number: "", tribunal: "TJSP" } as Pick<Process, "cnj" | "number" | "tribunal" | "tribunalIdentification">
    const id = tribunalIdentificationOf(legacy)
    assert.equal(id?.origin.acronym, "TJSP")
    assert.equal(id?.current.status, "not_checked")
    assert.equal(id?.current.acronym, undefined)
    assert.ok(id?.current.reasons[0].includes("Cadastro anterior"))
  })

  it("processo antigo sem número CNJ: sem identificação", () => {
    assert.equal(tribunalIdentificationOf({ number: "123", tribunal: "TJSP" }), undefined)
  })

  it("identificação guardada é devolvida como está", () => {
    const stored = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree)], AT)
    assert.equal(tribunalIdentificationOf({ cnj: sim.SIM_TJSP, number: "", tribunalIdentification: stored }), stored)
  })
})

describe("sinais de saída na última movimentação", () => {
  it("remessa, redistribuição, declínio e baixa sinalizam; despacho não", () => {
    const at = "2026-01-01T00:00:00"
    assert.ok(transferSignal({ name: "Remessa", occurredAt: at }))
    assert.ok(transferSignal({ name: "Redistribuição", occurredAt: at }))
    assert.ok(transferSignal({ name: "Declínio de Competência", occurredAt: at }))
    assert.ok(transferSignal({ name: "Baixa Definitiva", occurredAt: at, code: 22 }))
    assert.ok(transferSignal({ name: "Expedição de documento", occurredAt: at, complementKeys: ["motivo_da_remessa"] }))
    assert.equal(transferSignal({ name: "Mero expediente", occurredAt: at }), undefined)
    assert.equal(transferSignal(undefined), undefined)
  })
})

describe("contexto da IA", () => {
  it("sem confirmação: avisa para não afirmar onde tramita e marca a inferência", () => {
    const ai = describeTribunalForAI(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspRemessa)], AT))
    assert.ok(ai?.aviso)
    assert.equal(ai?.tribunal_atual.tribunal, undefined)
    assert.ok(ai?.tribunal_inferido?.observacao.includes("inferência"))
    assert.ok(ai?.tribunal_de_origem.includes("pelo número CNJ"))
  })

  it("confirmado: leva tribunal, fonte e índice, sem aviso", () => {
    const ai = describeTribunalForAI(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree)], AT))
    assert.equal(ai?.aviso, undefined)
    assert.ok(ai?.tribunal_atual.tribunal?.startsWith("TJSP"))
    assert.equal(ai?.tribunal_atual.indice_consultado, "api_publica_tjsp")
    assert.equal(ai?.tribunal_inferido, undefined)
  })
})
