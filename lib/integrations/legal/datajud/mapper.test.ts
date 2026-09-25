import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildProcessSheet } from "@/lib/services/processes/sheet"
import { buildProcessDraft } from "@/lib/services/processes/import"
import { mapSearchResponse } from "./mapper"
import { emptyResponse, realMovementsResponse, sparseResponse, trf1Response, twoDegreesResponse, withPartiesResponse } from "./__fixtures__/responses"

const CNJ = "00008323520184013202"
const REAL_CNJ = "00018144519974013700"

describe("mapeamento DataJud → processo", () => {
  it("extrai os metadados da ficha", () => {
    const process = mapSearchResponse(trf1Response, CNJ)
    assert.ok(process)
    assert.equal(process.cnj, CNJ)
    assert.equal(process.tribunal, "TRF1")
    assert.equal(process.degree, "JE")
    assert.equal(process.className, "Procedimento do Juizado Especial Cível")
    assert.equal(process.subject, "Concessão")
    assert.equal(process.system, "PJe")
    assert.equal(process.judicialUnit?.name, "Tefé")
    assert.equal(process.judicialUnit?.municipalityCode, 255)
    assert.equal(process.source.provider, "datajud")
    assert.equal(process.source.dataset, "api_publica_trf1")
  })

  it("escolhe o documento mais recente quando há mais de um grau", () => {
    const process = mapSearchResponse(twoDegreesResponse, CNJ)
    assert.equal(process?.degree, "JE")
    assert.equal(process?.movements.length, 2)
  })

  it("devolve null quando a fonte não encontra o número", () => {
    assert.equal(mapSearchResponse(emptyResponse, CNJ), null)
  })

  it("não inventa órgão julgador nem assunto ausentes", () => {
    const process = mapSearchResponse(sparseResponse, "10027395220194013700")
    assert.ok(process)
    assert.equal(process.judicialUnit, undefined)
    assert.equal(process.subject, undefined)
    assert.equal(process.filedAt, undefined)
  })
})

describe("mapeamento de movimentações", () => {
  it("ordena da mais recente para a mais antiga", () => {
    const process = mapSearchResponse(trf1Response, CNJ)
    assert.ok(process)
    assert.equal(process.movements.length, 3)
    assert.equal(process.movements[0].name, "Ato ordinatório")
    assert.equal(process.movements[0].code, 11383)
    assert.equal(process.movements[2].name, "Distribuição")
  })

  it("usa os complementos tabelados como descrição", () => {
    const process = mapSearchResponse(trf1Response, CNJ)
    assert.equal(process?.movements[0].description, "Praticado")
  })

  it("usa o texto legível do complemento, nunca a chave técnica", () => {
    const process = mapSearchResponse(realMovementsResponse, REAL_CNJ)
    const documento = process?.movements.find((m) => m.code === 581)
    assert.equal(documento?.description, "Certidão")
    assert.equal(
      process?.movements.some((m) => m.description?.includes("tipo_de_documento")),
      false,
    )
  })

  it("preserva complementos campo a campo, órgão julgador e o objeto original", () => {
    const process = mapSearchResponse(realMovementsResponse, REAL_CNJ)
    const documento = process?.movements.find((m) => m.code === 581)
    assert.ok(documento)
    assert.deepEqual(documento.complements, [{ code: 4, key: "tipo_de_documento", value: 107, name: "Certidão" }])
    // Nome do órgão exatamente como veio; código em texto, como a fonte envia.
    assert.deepEqual(documento.judicialUnit, { code: "16293", name: "06ª - São Luís" })
    assert.equal((documento.raw as { nome?: string }).nome, "Documento")
    assert.equal((documento.raw as { complementosTabelados?: unknown[] }).complementosTabelados?.length, 1)
  })

  it("não inventa órgão julgador na movimentação que não tem", () => {
    const process = mapSearchResponse(realMovementsResponse, REAL_CNJ)
    const remessa = process?.movements.find((m) => m.code === 123)
    assert.equal(remessa?.judicialUnit, undefined)
  })

  it("leva complementos, órgão e raw até o rascunho do processo", () => {
    const external = mapSearchResponse(realMovementsResponse, REAL_CNJ)
    assert.ok(external)
    const draft = buildProcessDraft(buildProcessSheet(external), { clientId: "c", ownerId: "u", area: "Cível" }, "2026-09-24T10:00:00")
    const documento = draft.movements.find((m) => m.code === 581)
    assert.equal(documento?.complements?.[0].name, "Certidão")
    assert.equal(documento?.judicialUnit?.name, "06ª - São Luís")
    assert.ok(documento?.raw)
    assert.equal(documento?.origin, "datajud")
  })

  it("descarta movimentação sem data, que não teria identidade estável", () => {
    const process = mapSearchResponse(sparseResponse, "10027395220194013700")
    assert.equal(process?.movements.length, 1)
    assert.equal(process?.movements[0].name, "Conclusão")
  })
})

describe("mapeamento de partes", () => {
  it("devolve listas vazias quando a fonte não informa partes", () => {
    const process = mapSearchResponse(trf1Response, CNJ)
    assert.deepEqual(process?.parties, { active: [], passive: [], others: [] })
  })

  it("mapeia os polos quando a fonte informa", () => {
    const process = mapSearchResponse(withPartiesResponse, CNJ)
    assert.ok(process?.parties)
    assert.equal(process.parties.active[0].name, "Maria da Silva")
    assert.equal(process.parties.active[0].type, "individual")
    assert.equal(process.parties.passive[0].type, "company")
    // Parte sem polo explícito nunca é deduzida como autor ou réu.
    assert.equal(process.parties.others[0].name, "Ministério Público Federal")
  })
})

describe("ficha e rascunho de processo interno", () => {
  it("converte a ficha em campos do modelo do LEXA", () => {
    const external = mapSearchResponse(trf1Response, CNJ)
    assert.ok(external)
    const sheet = buildProcessSheet(external)

    assert.equal(sheet.number, "0000832-35.2018.4.01.3202")
    assert.equal(sheet.filedAt, "2018-10-29")
    assert.equal(sheet.lastMovement?.name, "Ato ordinatório")
    assert.equal(sheet.movements.length, 3)
    assert.ok(sheet.movements.every((movement) => movement.hash.length > 0))

    const draft = buildProcessDraft(sheet, { clientId: "c_joao", ownerId: "u_carlos", area: "Previdenciário" }, "2026-09-24T10:00:00")
    assert.equal(draft.cnj, CNJ)
    assert.equal(draft.type, "Procedimento do Juizado Especial Cível")
    assert.equal(draft.court, "Tefé")
    assert.equal(draft.status, "em_andamento")
    assert.equal(draft.source?.provider, "datajud")
    assert.equal(draft.lastSyncedAt, "2026-09-24T10:00:00")
    assert.equal(draft.movements.length, 3)
  })

  it("marca como não informado o que a fonte não trouxe, sem inventar", () => {
    const external = mapSearchResponse(sparseResponse, "10027395220194013700")
    assert.ok(external)
    const sheet = buildProcessSheet(external)
    const draft = buildProcessDraft(sheet, { clientId: "c_maria", ownerId: "u_ana", area: "Cível" }, "2026-09-24T10:00:00")

    assert.equal(draft.court, "Não informado pela fonte")
    assert.equal(draft.opposingParty, "Não informado pela fonte")
  })
})
