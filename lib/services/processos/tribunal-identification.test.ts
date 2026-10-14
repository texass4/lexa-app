import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapCoverage, mapRecords, mapSearchResponse, type DataJudSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { superiorFor } from "@/lib/integrations/legal/datajud/tribunals"
import * as sim from "@/lib/integrations/legal/datajud/__fixtures__/tribunal-scenarios"
import type { ExternalProcess } from "@/lib/integrations/legal/types"
import type { Process, TribunalCheck, TribunalIdentification } from "@/types"
import { buildProcessSheet } from "./sheet"
import {
  checkFromRecords,
  describeTribunalForAI,
  identifyFromSheet,
  identifyTribunal,
  mergeChecks,
  officeTime,
  originCheckFromSheet,
  sourceTime,
  staleAttempt,
  transferSignal,
  tribunalIdentificationOf,
  withAttempt,
} from "./tribunal-identification"

/* Todos os cenários usam DADOS SIMULADOS (`__fixtures__/tribunal-scenarios.ts`). */

/** Momento da consulta em UTC; no escritório (America/Sao_Paulo) são 09:00. */
const AT = "2026-10-14T12:00:00.000Z"
const AT_LOCAL = "2026-10-14T09:00:00"

const sheetOf = (response: DataJudSearchResponse, cnj = sim.SIM_TJSP) => buildProcessSheet(mapSearchResponse(response, cnj) as ExternalProcess)
const origin = (response: DataJudSearchResponse, cnj = sim.SIM_TJSP): TribunalCheck => originCheckFromSheet(sheetOf(response, cnj), AT)
const superior = (response: DataJudSearchResponse, tribunal = "STJ", at = AT): TribunalCheck =>
  checkFromRecords({ tribunal, role: "superior", dataset: `api_publica_${tribunal.toLowerCase()}`, checkedAt: at, records: mapRecords(response, sim.SIM_TJSP), coverage: mapCoverage(response) })
const failedCheck = (role: TribunalCheck["role"], tribunal: string): TribunalCheck => ({ tribunal, role, provider: "datajud", dataset: `api_publica_${tribunal.toLowerCase()}`, checkedAt: AT, status: "failed", records: [] })
const originMiss = (status: "not_found" | "failed", tribunal = "TJSP"): TribunalCheck => ({ ...failedCheck("origem", tribunal), status })

describe("tribunal atual — critérios de evidência", () => {
  it("confirma quando todos os critérios valem, com fonte, índice, grau e datas normalizadas", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree)], AT)
    assert.equal(id.cnj, sim.SIM_TJSP)
    assert.equal(id.origin.acronym, "TJSP")
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "TJSP")
    assert.equal(id.current.degree, "G1")
    assert.equal(id.current.dataset, "api_publica_tjsp")
    assert.equal(id.current.checkedAt, AT_LOCAL)
    assert.equal(id.current.updatedAt, "2026-09-20T10:00:00")
    assert.equal(id.inferred, undefined)
    assert.deepEqual(id.lastAttempt, { at: AT_LOCAL, tribunal: "TJSP", outcome: "found" })
  })

  it("registros de vários graus: confirma o tribunal, mas não escolhe o grau pelo mais recente", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspTwoDegrees)], AT)
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.degree, undefined)
    assert.ok(id.current.reasons.some((r) => r.includes("mais de um grau")))
    assert.equal(id.checks[0].records.length, 2)
  })

  it("resposta incompleta — sem tribunal, sem data ou sem movimentações: não confirma", () => {
    for (const response of [sim.simMissingTribunal, sim.simMissingUpdatedAt, sim.simNoMovements]) {
      const id = identifyTribunal(sim.SIM_TJSP, [origin(response)], AT)
      assert.equal(id.current.status, "not_confirmed")
      assert.equal(id.current.acronym, undefined)
      assert.equal(id.inferred?.basis, "registro_mais_recente")
    }
  })

  it("registro que se diz de outro tribunal no índice consultado: divergência, sem escolha", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simMismatchedTribunal)], AT)
    assert.equal(id.current.status, "conflicting")
    assert.equal(id.current.acronym, undefined)
    assert.equal(id.inferred, undefined)
    assert.deepEqual(id.candidates?.map((c) => c.acronym), ["TJRJ"])
  })

  it("grafia TJDF no registro conta como TJDFT (sem divergência falsa)", () => {
    const id = identifyTribunal(sim.SIM_TJDFT, [origin(sim.simTjdftAlias, sim.SIM_TJDFT)], AT)
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "TJDFT")
  })
})

describe("respostas parciais e truncadas", () => {
  it("registros com fragmento falho não confirmam", () => {
    const sheet = sheetOf(sim.simPartialWithHits)
    assert.equal(sheet.coverage?.partial, true)
    const id = identifyFromSheet(sheet, AT)
    assert.equal(id.current.status, "not_confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("veio parcial")))
    assert.equal(id.checks[0].coverage?.partial, true)
  })

  it("resposta truncada (total maior que o devolvido) não confirma", () => {
    const id = identifyFromSheet(sheetOf(sim.simTruncated), AT)
    assert.equal(id.current.status, "not_confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("1 de 25 registros")))
  })

  it("documento de outro número é descartado da evidência", () => {
    const records = mapRecords(sim.simWithOtherNumber, sim.SIM_TJSP)
    assert.equal(records.length, 1)
    assert.equal(records[0].tribunal, "TJSP")
    assert.equal(identifyFromSheet(sheetOf(sim.simWithOtherNumber), AT).current.status, "confirmed")
  })

  it("superior com resposta parcial também impede confirmar", () => {
    const partialStj = { ...sim.simStjRecord, _shards: { total: 3, successful: 2, failed: 1 } }
    const id = identifyTribunal(sim.SIM_TJSP, [originMiss("not_found"), superior(partialStj)], AT)
    assert.equal(id.current.status, "not_confirmed")
  })
})

describe("tribunal superior — consulta complementar", () => {
  it("registros na origem e no superior: divergência, as duas evidências guardadas, nenhum escolhido", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior(sim.simStjRecord)], AT)
    assert.equal(id.current.status, "conflicting")
    assert.equal(id.current.acronym, undefined)
    assert.equal(id.inferred, undefined, "sem 'provável' pela data mais recente")
    assert.deepEqual(id.candidates?.map((c) => [c.acronym, c.role, c.degrees.join()]).sort(), [
      ["STJ", "superior", "SUP"],
      ["TJSP", "origem", "G1"],
    ])
    assert.deepEqual(
      id.checks.map((c) => [c.role, c.tribunal, c.records.length, c.dataset]),
      [
        ["origem", "TJSP", 1, "api_publica_tjsp"],
        ["superior", "STJ", 1, "api_publica_stj"],
      ],
    )
    assert.ok(id.current.reasons[0].includes("TJSP") && id.current.reasons[0].includes("STJ"))
  })

  it("só o superior tem registro: atual ≠ origem, origem preservada", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [originMiss("not_found"), superior(sim.simStjRecord)], AT)
    assert.equal(id.origin.acronym, "TJSP")
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.current.acronym, "STJ")
  })

  it("superior sem registro não prova nada e não derruba a confirmação da origem", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior(sim.simEmpty)], AT)
    assert.equal(id.current.status, "confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("A ausência não prova")))
  })

  it("superior fora do ar: não confirma (pode haver registro lá)", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), failedCheck("superior", "STJ")], AT)
    assert.equal(id.current.status, "not_confirmed")
    assert.ok(id.current.reasons.some((r) => r.includes("STJ não respondeu")))
  })
})

describe("número inválido × código inexistente × sem fonte × sem resultado × legado", () => {
  it("dígito verificador errado e número incompleto: invalid_number", () => {
    assert.equal(identifyTribunal(sim.withWrongCheckDigits(sim.SIM_TJSP), [], AT).current.status, "invalid_number")
    assert.equal(identifyTribunal("123", [], AT).current.status, "invalid_number")
  })

  it("código inexistente na numeração: unknown_tribunal", () => {
    const id = identifyTribunal(sim.SIM_UNKNOWN, [], AT)
    assert.equal(id.current.status, "unknown_tribunal")
    assert.equal(id.origin.acronym, undefined)
    assert.equal(id.inferred, undefined)
  })

  it("tribunal conhecido sem fonte (TRE, TJM, STF): unsupported, com a origem identificada", () => {
    for (const cnj of [sim.SIM_TRE_SP, sim.SIM_TJMMG, sim.SIM_STF]) {
      const id = identifyTribunal(cnj, [], AT)
      assert.ok(id.origin.acronym)
      assert.equal(id.origin.covered, false)
      assert.equal(id.current.status, "unsupported")
    }
  })

  it("nada encontrado: not_found, sem afirmar tramitação; origem fora do ar: not_checked", () => {
    const missing = identifyTribunal(sim.SIM_TJSP, [originMiss("not_found"), superior(sim.simEmpty)], AT)
    assert.equal(missing.current.status, "not_found")
    assert.equal(missing.inferred?.basis, "cnj")
    assert.equal(identifyTribunal(sim.SIM_TJSP, [originMiss("failed")], AT).current.status, "not_checked")
  })

  it("processo salvo antes da verificação: legacy; cadastro manual nunca consultado: not_checked", () => {
    const legacy = tribunalIdentificationOf({ cnj: sim.SIM_TJSP, number: "", tribunal: "TJSP", source: { provider: "datajud" } })
    assert.equal(legacy?.current.status, "legacy")
    assert.ok(legacy?.current.reasons[0].includes("salvo antes"))
    const manual = tribunalIdentificationOf({ cnj: sim.SIM_TJSP, number: "", tribunal: "TJSP", origin: "manual" })
    assert.equal(manual?.current.status, "not_checked")
    assert.ok(manual?.current.reasons[0].startsWith("Cadastro manual"))
  })

  it("processo antigo com número inválido continua dizendo que o número é inválido", () => {
    const id = tribunalIdentificationOf({ number: "0801234-56.2024.8.10.0001", tribunal: "TJMA", source: { provider: "datajud" } })
    assert.equal(id?.current.status, "invalid_number")
    assert.ok(id?.current.reasons[0].includes("dígito verificador"))
  })

  it("processo antigo sem número CNJ: sem identificação", () => {
    assert.equal(tribunalIdentificationOf({ number: "123", tribunal: "TJSP" }), undefined)
  })
})

describe("Justiça Militar da União (7.01–7.12)", () => {
  it("cada circunscrição é identificada, sem índice inventado; o superior é o STM", () => {
    for (let n = 1; n <= 12; n += 1) {
      const cnj = sim.syntheticCNJ("7", String(n).padStart(2, "0"))
      const id = identifyTribunal(cnj, [], AT)
      assert.equal(id.origin.acronym, `CJM${n}`)
      assert.ok(id.origin.name?.startsWith(`${n}ª Circunscrição Judiciária Militar`))
      assert.equal(id.origin.covered, false)
      assert.equal(id.current.status, "unsupported", "não é 'código inexistente'")
      assert.equal(superiorFor(cnj), "STM")
    }
    assert.equal(identifyTribunal(sim.syntheticCNJ("7", "13"), [], AT).current.status, "unknown_tribunal")
  })
})

describe("saída do tribunal na última movimentação", () => {
  const at = "2026-09-01T10:00:00"
  const blocks = (name: string, record: { degree?: string; tribunal?: string } = {}, description?: string) => transferSignal({ name, occurredAt: at, description }, record)?.blocks === true

  it("falsos positivos: palavras genéricas não indicam saída", () => {
    for (const name of ["Mandado devolvido cumprido", "Juntada de AR devolvido", "Remessa ao Contador", "Remessa", "Redistribuição", "Arquivado documento", "Remetidos os autos ao Ministério Público"]) {
      assert.equal(blocks(name, { degree: "G1", tribunal: "TJSP" }), false, name)
    }
    // Remessa "à instância superior" a partir do 1º grau fica no próprio tribunal (vai ao 2º grau).
    assert.equal(blocks("Remessa", { degree: "G1", tribunal: "TJSP" }, "em grau de recurso"), false)
  })

  it("falsos negativos corrigidos: remessa explícita a tribunal superior ou outra Justiça bloqueia", () => {
    for (const name of [
      "Autos encaminhados ao STJ",
      "Enviados os autos ao Superior Tribunal de Justiça",
      "Remetidos os Autos (em grau de recurso) para o STJ",
      "Processo enviado ao Tribunal Superior do Trabalho",
      "Remessa à Justiça Federal",
      "Declínio de Competência",
      "Declarada incompetência",
    ]) {
      assert.equal(blocks(name, { degree: "G2", tribunal: "TJSP" }), true, name)
    }
    assert.equal(blocks("Remessa", { degree: "G2", tribunal: "TJSP" }, "em grau de recurso"), true, "do 2º grau, a instância superior é outro tribunal")
  })

  it("baixa: na origem é informação; num tribunal superior, os autos voltaram", () => {
    assert.equal(blocks("Baixa Definitiva", { degree: "G1", tribunal: "TJSP" }), false)
    assert.equal(transferSignal({ name: "Baixa Definitiva", occurredAt: at, code: 22 }, { tribunal: "TJSP" })?.blocks, false)
    assert.equal(blocks("Baixa Definitiva", { degree: "SUP", tribunal: "STJ" }), true)
  })

  it("aplicado à identificação: remessa explícita não confirma; remessa genérica e baixa na origem confirmam", () => {
    assert.equal(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspRemessaStj)], AT).current.status, "not_confirmed")
    assert.equal(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspRemessa)], AT).current.status, "confirmed")
    const baixa = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspBaixa)], AT)
    assert.equal(baixa.current.status, "confirmed")
    assert.ok(baixa.current.reasons.some((r) => r.includes("baixa")))
    const stjBaixa = identifyTribunal(sim.SIM_TJSP, [originMiss("not_found"), superior(sim.simStjBaixa)], AT)
    assert.equal(stjBaixa.current.status, "not_confirmed")
  })
})

describe("datas com e sem fuso", () => {
  it("datas da fonte ficam como estão (sem converter), as nossas viram horário do escritório", () => {
    assert.equal(sourceTime("2026-09-20T23:30:00.000Z"), "2026-09-20T23:30:00")
    assert.equal(sourceTime("2026-09-20T23:30:00"), "2026-09-20T23:30:00")
    // 02:30 UTC do dia 21 = 23:30 do dia 20 em São Paulo.
    assert.equal(officeTime("2026-09-21T02:30:00.000Z"), "2026-09-20T23:30:00")
    assert.equal(officeTime("2026-09-20T23:30:00"), "2026-09-20T23:30:00")
  })

  it("registros com e sem Z perto da meia-noite: comparados no mesmo formato, mesmo dia no texto e na evidência", () => {
    const id = identifyTribunal(sim.SIM_TJSP, [origin(sim.simMidnight)], "2026-09-21T02:50:00.000Z")
    const records = id.checks[0].records
    assert.ok(records.every((r) => !/Z$/.test(r.updatedAt ?? "")))
    assert.deepEqual(
      records.map((r) => r.updatedAt),
      ["2026-09-20T23:45:00", "2026-09-20T23:30:00"],
    )
    assert.equal(id.current.updatedAt, "2026-09-20T23:45:00")
    assert.ok(id.current.reasons[0].includes("20/09/2026"))
    assert.equal(id.identifiedAt, "2026-09-20T23:50:00")
  })

  it("consulta do superior em UTC e da origem em horário local entram no mesmo formato", () => {
    const local = { ...origin(sim.simTjspFirstDegree), checkedAt: "2026-10-14T08:00:00" }
    const id = identifyTribunal(sim.SIM_TJSP, [local, superior(sim.simEmpty)], AT)
    assert.deepEqual(
      id.checks.map((c) => c.checkedAt),
      ["2026-10-14T08:00:00", AT_LOCAL],
    )
  })
})

describe("persistência: a identificação guardada não perde consultas", () => {
  const conflicting = () => identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior(sim.simStjRecord)], AT)

  it("sincronização só da origem mantém a consulta ao superior: divergência continua divergência", () => {
    const next = identifyFromSheet(sheetOf(sim.simTjspFirstDegree), "2026-10-15T09:00:00", { previous: conflicting() })
    assert.equal(next.current.status, "conflicting")
    assert.deepEqual(
      next.checks.map((c) => [c.role, c.tribunal, c.checkedAt]),
      [
        ["origem", "TJSP", "2026-10-15T09:00:00"],
        ["superior", "STJ", AT_LOCAL],
      ],
    )
  })

  it("nova consulta ao mesmo índice substitui a anterior; consulta mais antiga não volta", () => {
    const merged = mergeChecks(conflicting().checks, [superior(sim.simEmpty, "STJ", "2026-10-16T12:00:00.000Z")])
    assert.equal(merged.find((c) => c.role === "superior")?.status, "not_found")
    const older = mergeChecks(merged, [superior(sim.simStjRecord, "STJ", "2026-10-01T12:00:00.000Z")])
    assert.equal(older.find((c) => c.role === "superior")?.status, "not_found")
  })

  it("identificação de outro número não é misturada", () => {
    const other = { ...conflicting(), cnj: sim.SIM_TRF1 }
    assert.equal(identifyFromSheet(sheetOf(sim.simTjspFirstDegree), AT, { previous: other }).current.status, "confirmed")
  })

  it("identificação da versão anterior (sem cnj, sem cobertura, datas em UTC) é aproveitada", () => {
    const old = conflicting()
    const legacyShape = {
      ...old,
      cnj: undefined,
      // Forma anterior: sem `coverage` e com o horário da consulta em UTC.
      checks: old.checks.map((c) => ({ ...c, coverage: undefined, checkedAt: AT })),
    } as TribunalIdentification
    const next = identifyFromSheet(sheetOf(sim.simTjspFirstDegree), "2026-10-15T09:00:00", { previous: legacyShape })
    assert.equal(next.current.status, "conflicting")
    assert.equal(next.checks.find((c) => c.role === "superior")?.checkedAt, AT_LOCAL)
  })
})

describe("última tentativa sem apagar a evidência", () => {
  const confirmed = identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree)], AT)
  const process = { cnj: sim.SIM_TJSP, number: "", tribunal: "TJSP", tribunalIdentification: confirmed } satisfies Partial<Process>

  for (const outcome of ["not_found", "rate_limited", "failed"] as const) {
    it(`confirmação seguida de ${outcome}: mantém a confirmação e a data dela, registra a tentativa`, () => {
      const next = withAttempt(process, { at: "2026-10-20T12:00:00.000Z", outcome })!
      assert.equal(next.current.status, "confirmed")
      assert.equal(next.current.checkedAt, AT_LOCAL)
      assert.deepEqual(next.lastAttempt, { at: "2026-10-20T09:00:00", outcome })
      assert.equal(staleAttempt(next)?.outcome, outcome)
      const ai = describeTribunalForAI(next)!
      assert.ok(ai.limitacao?.includes("não foi revalidada"))
      assert.equal(ai.ultima_tentativa?.em, "2026-10-20T09:00:00")
    })
  }

  it("tentativa anterior à evidência não a marca como desatualizada", () => {
    assert.equal(staleAttempt({ ...confirmed, lastAttempt: { at: "2026-10-01T09:00:00", outcome: "failed" } }), undefined)
  })

  it("processo legado ganha a tentativa sem virar 'confirmado'", () => {
    const next = withAttempt({ cnj: sim.SIM_TJSP, number: "", tribunal: "TJSP", source: { provider: "datajud" } }, { at: AT, outcome: "not_found" })
    assert.equal(next?.current.status, "legacy")
    assert.equal(next?.lastAttempt?.outcome, "not_found")
  })
})

describe("contexto da IA", () => {
  it("divergência: estado, tribunais com registro lado a lado, sem inferido nem tribunal atual", () => {
    const ai = describeTribunalForAI(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree), superior(sim.simStjRecord)], AT))!
    assert.equal(ai.tribunal_atual.estado, "conflicting")
    assert.equal(ai.tribunal_atual.tribunal, undefined)
    assert.equal(ai.tribunal_inferido, undefined)
    assert.equal(ai.tribunais_com_registro?.length, 2)
    assert.ok(ai.limitacao)
    assert.ok(ai.tribunal_de_origem.includes("pelo número CNJ"))
  })

  it("não confirmado: inferência rotulada, estado e significado", () => {
    const ai = describeTribunalForAI(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspRemessaStj)], AT))!
    assert.equal(ai.tribunal_atual.estado, "not_confirmed")
    assert.ok(ai.tribunal_atual.significado)
    assert.ok(ai.tribunal_inferido?.observacao.includes("inferência"))
  })

  it("estados sem evidência nunca levam tribunal atual", () => {
    const ids = [
      identifyTribunal(sim.SIM_TJSP, [originMiss("not_found")], AT),
      identifyTribunal(sim.SIM_TRE_SP, [], AT),
      identifyTribunal(sim.SIM_UNKNOWN, [], AT),
      identifyTribunal(sim.withWrongCheckDigits(sim.SIM_TJSP), [], AT),
      identifyTribunal(sim.SIM_TJSP, [originMiss("failed")], AT),
      tribunalIdentificationOf({ cnj: sim.SIM_TJSP, number: "", source: { provider: "datajud" } }),
    ]
    assert.deepEqual(
      ids.map((id) => id?.current.status),
      ["not_found", "unsupported", "unknown_tribunal", "invalid_number", "not_checked", "legacy"],
    )
    for (const id of ids) {
      const ai = describeTribunalForAI(id)!
      assert.equal(ai.tribunal_atual.tribunal, undefined)
      assert.ok(ai.limitacao)
    }
  })

  it("confirmado e revalidado: tribunal, fonte e índice, sem limitação", () => {
    const ai = describeTribunalForAI(identifyTribunal(sim.SIM_TJSP, [origin(sim.simTjspFirstDegree)], AT))!
    assert.equal(ai.limitacao, undefined)
    assert.ok(ai.tribunal_atual.tribunal?.startsWith("TJSP"))
    assert.equal(ai.tribunal_atual.indice_consultado, "api_publica_tjsp")
  })
})

describe("fichas antigas do cache", () => {
  it("sem `records` nem `coverage`: usa os campos da própria ficha", () => {
    const { records: _r, coverage: _c, ...old } = sheetOf(sim.simTjspFirstDegree)
    void _r
    void _c
    const id = identifyFromSheet(old, AT)
    assert.equal(id.current.status, "confirmed")
    assert.equal(id.checks[0].coverage, undefined)
  })
})
