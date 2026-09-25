import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapMovements, type DataJudRawMovement } from "@/lib/integrations/legal/datajud/mapper"
import type { ProcessMovement } from "@/types"
import { complementLabel, complementText, interpretMovement, interpretMovements } from "./movement-interpreter"

const SAO_LUIS = { codigo: "16293", nome: "06ª - São Luís" }
const AT = "2025-12-04T22:16:00.000Z"

/** DataJud bruto → mapper real → movimentação interna → interpretador. */
function fromDataJud(raw: DataJudRawMovement) {
  const [external] = mapMovements({ movimentos: [{ dataHora: AT, ...raw }] })
  assert.ok(external, "o mapper deveria aceitar o movimento")
  const movement: ProcessMovement = {
    id: "m1",
    at: external.occurredAt,
    title: external.name,
    description: external.description,
    code: external.code,
    origin: "datajud",
    complements: external.complements,
    judicialUnit: external.judicialUnit,
    raw: external.raw,
  }
  return interpretMovement(movement, "p1")
}

const certidao = { codigo: 4, descricao: "tipo_de_documento", valor: 107, nome: "Certidão" }

describe("interpretador de movimentações", () => {
  it("1. documento simples: não inventa descrição", () => {
    const m = fromDataJud({ codigo: 581, nome: "Documento", orgaoJulgador: SAO_LUIS })
    assert.equal(m.category, "documento")
    assert.equal(m.title, "Documento")
    assert.equal(m.description, undefined)
    assert.deepEqual(m.complements, [])
  })

  it("2. documento + certidão: descrição legível, chave técnica preservada", () => {
    const m = fromDataJud({ codigo: 581, nome: "Documento", orgaoJulgador: SAO_LUIS, complementosTabelados: [certidao] })
    assert.equal(m.category, "documento")
    assert.equal(m.title, "Documento")
    assert.equal(m.description, "Certidão")
    assert.equal(m.complements[0].label, "Tipo do documento")
    assert.equal(m.complements[0].text, "Certidão")
    assert.equal(m.complements[0].source.key, "tipo_de_documento")
    assert.equal(m.complements[0].source.value, 107)
    // Documento informado não é arquivo disponível.
    assert.equal(m.document, undefined)
  })

  it("3. expedição de documento mantém o nome da fonte", () => {
    const m = fromDataJud({ codigo: 60, nome: "Expedição de documento", orgaoJulgador: SAO_LUIS, complementosTabelados: [certidao] })
    assert.equal(m.category, "documento")
    assert.equal(m.title, "Expedição de documento")
    assert.equal(m.description, "Certidão")
  })

  it("4. decurso de prazo", () => {
    const m = fromDataJud({ codigo: 1051, nome: "Decurso de Prazo", orgaoJulgador: SAO_LUIS })
    assert.equal(m.category, "prazo")
    assert.equal(m.title, "Decurso de Prazo")
  })

  it("5. intimação", () => {
    assert.equal(fromDataJud({ codigo: 12263, nome: "Intimação" }).category, "comunicacao")
    assert.equal(fromDataJud({ codigo: 92, nome: "Publicação" }).category, "comunicacao")
    assert.equal(fromDataJud({ codigo: 1061, nome: "Disponibilização no Diário da Justiça Eletrônico" }).category, "comunicacao")
  })

  it("6. remessa, com o motivo como descrição", () => {
    const m = fromDataJud({
      codigo: 123,
      nome: "Remessa",
      complementosTabelados: [{ codigo: 18, descricao: "motivo_da_remessa", valor: 40, nome: "outros motivos" }],
    })
    assert.equal(m.category, "tramitacao")
    assert.equal(m.description, "outros motivos")
    assert.equal(m.complements[0].label, "Motivo da remessa")
  })

  it("7. recebimento", () => {
    assert.equal(fromDataJud({ codigo: 132, nome: "Recebimento" }).category, "tramitacao")
    assert.equal(fromDataJud({ codigo: 36, nome: "Redistribuição" }).category, "tramitacao")
  })

  it("8. petição", () => {
    const m = fromDataJud({
      codigo: 85,
      nome: "Petição",
      complementosTabelados: [{ codigo: 19, descricao: "tipo_de_peticao", valor: 57, nome: "Petição (outras)" }],
    })
    assert.equal(m.category, "peticao")
    assert.equal(m.description, "Petição (outras)")
    assert.equal(m.complements[0].label, "Tipo de petição")
  })

  it("9. ato ordinatório", () => {
    const m = fromDataJud({ codigo: 11383, nome: "Ato ordinatório", orgaoJulgador: SAO_LUIS })
    assert.equal(m.category, "ato")
    assert.equal(m.title, "Ato ordinatório")
  })

  it("10. movimento sem complementos", () => {
    const m = fromDataJud({ codigo: 51, nome: "Conclusão" })
    assert.equal(m.category, "tramitacao")
    assert.deepEqual(m.complements, [])
    assert.equal(m.description, undefined)
  })

  it("11. movimento sem órgão julgador", () => {
    const m = fromDataJud({ codigo: 22, nome: "Baixa Definitiva" })
    assert.equal(m.category, "baixa")
    assert.equal(m.judicialUnit, undefined)
  })

  it("12. múltiplos complementos, na ordem da fonte, sem texto técnico", () => {
    const m = fromDataJud({
      codigo: 970,
      nome: "Audiência",
      orgaoJulgador: SAO_LUIS,
      complementosTabelados: [
        { codigo: 16, descricao: "tipo_de_audiencia", valor: 23, nome: "instrução e julgamento" },
        { codigo: 15, descricao: "situacao_da_audiencia", valor: 9, nome: "designada" },
      ],
    })
    assert.equal(m.category, "audiencia")
    assert.equal(m.description, "instrução e julgamento · designada")
    assert.deepEqual(
      m.complements.map((c) => c.label),
      ["Tipo de audiência", "Situação da audiência"],
    )
    assert.equal(m.description?.includes("_"), false)
  })

  it("13. movimento desconhecido cai em 'outros' sem quebrar", () => {
    const m = fromDataJud({ codigo: 268, nome: "Morte ou perda da capacidade" })
    assert.equal(m.category, "outros")
    assert.equal(m.title, "Morte ou perda da capacidade")
    const semNome = fromDataJud({})
    assert.equal(semNome.category, "outros")
    assert.equal(semNome.title, "Movimentação")
  })
})

describe("preservação do dado original", () => {
  it("mantém código, nome, data/hora, órgão e objeto bruto", () => {
    const m = fromDataJud({ codigo: 581, nome: "Documento", orgaoJulgador: SAO_LUIS, complementosTabelados: [certidao] })
    assert.equal(m.code, 581)
    assert.equal(m.originalName, "Documento")
    assert.equal(m.at, AT)
    assert.deepEqual(m.judicialUnit, { code: "16293", name: "06ª - São Luís" })
    assert.equal((m.raw as { orgaoJulgador?: unknown }).orgaoJulgador, SAO_LUIS)
    assert.equal(m.processId, "p1")
  })

  it("não traduz o nome do órgão julgador", () => {
    const m = fromDataJud({ codigo: 11383, nome: "Ato ordinatório", orgaoJulgador: SAO_LUIS })
    assert.equal(m.judicialUnit?.name, "06ª - São Luís")
  })

  it("só expõe documento quando há arquivo disponível", () => {
    const base: ProcessMovement = { id: "m", at: AT, title: "Documento" }
    assert.equal(interpretMovement({ ...base, document: { available: false } }).document, undefined)
    const pdf = { available: true, id: "d1", url: "https://exemplo/doc.pdf", type: "PDF" }
    assert.deepEqual(interpretMovement({ ...base, document: pdf }).document, pdf)
  })
})

describe("complementos", () => {
  it("aceita fonte com os campos trocados, sem mostrar a chave", () => {
    const invertido = { key: "Certidão", name: "tipo_de_documento" }
    assert.equal(complementText(invertido), "Certidão")
    assert.equal(complementLabel(invertido), "Tipo do documento")
  })

  it("rotula chaves desconhecidas de forma genérica", () => {
    assert.equal(complementLabel({ key: "classe_nova_qualquer", name: "X" }), "Classe nova qualquer")
    assert.equal(complementLabel({ name: "Sem chave" }), "Complemento")
  })

  it("complemento só técnico não vira descrição", () => {
    const m = interpretMovement({ id: "m", at: AT, title: "Documento", complements: [{ key: "tipo_de_documento" }] })
    assert.equal(m.description, undefined)
    assert.deepEqual(m.complements, [])
  })

  it("limpa descrição técnica gravada antes da correção do mapper", () => {
    const m = interpretMovement({ id: "m", at: AT, title: "Documento", description: "tipo_de_documento" })
    assert.equal(m.description, undefined)
  })
})

describe("cadastro manual", () => {
  it("produz o mesmo modelo, usando a classificação legada quando o nome não basta", () => {
    const seed: ProcessMovement = {
      id: "s",
      at: "2026-09-20T10:00:00",
      title: "Benefício implantado",
      kind: "decision",
      description: "INSS comunicou a implantação.",
    }
    const m = interpretMovement(seed)
    assert.equal(m.category, "julgamento")
    assert.equal(m.description, "INSS comunicou a implantação.")
    assert.deepEqual(m.complements, [])
  })

  it("o nome tem prioridade sobre a classificação legada", () => {
    const m = interpretMovement({ id: "s", at: "2026-09-20T10:00:00", title: "Audiência designada", kind: "decision" })
    assert.equal(m.category, "audiencia")
  })
})

describe("lista interpretada", () => {
  it("ordena da mais recente para a mais antiga sem perder itens", () => {
    const list: ProcessMovement[] = [
      { id: "a", at: "2025-01-01T10:00:00", title: "Recebimento" },
      { id: "b", at: "2026-01-08T14:45:00", title: "Ato ordinatório" },
      { id: "c", at: "2025-06-01T09:00:00", title: "Remessa" },
    ]
    const result = interpretMovements(list, "p")
    assert.deepEqual(
      result.map((m) => m.id),
      ["b", "c", "a"],
    )
  })

  it("reaproveita o resultado para o mesmo array", () => {
    const list: ProcessMovement[] = [{ id: "a", at: "2025-01-01T10:00:00", title: "Recebimento" }]
    assert.equal(interpretMovements(list, "p"), interpretMovements(list, "p"))
  })
})
