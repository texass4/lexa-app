import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Client } from "@/types"
import { buildImportRows, detectColumns, summarizeImport, type ImportOptions } from "./client-import"
import { parseCSV } from "./csv"

const existing = (id: string, patch: Partial<Client>): Client => ({
  id,
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  name: `Cliente ${id}`,
  kind: "PF",
  document: "",
  email: "",
  phone: "",
  address: "",
  area: "Cível",
  ownerId: "u1",
  status: "ativo",
  clientSince: "2026-01-01",
  lastActivityAt: "2026-01-01T00:00:00",
  ...patch,
})

const options = (patch: Partial<ImportOptions> = {}): ImportOptions => ({
  existing: [],
  members: [{ id: "u2", name: "Ana Souza", email: "ana@escritorio.com" }],
  defaultOwnerId: "u1",
  defaultArea: "Cível",
  today: "2026-09-29",
  ...patch,
})

const run = (csv: string, opts?: Partial<ImportOptions>) => {
  const [header, ...records] = parseCSV(csv)
  return buildImportRows(records, detectColumns(header), options(opts))
}

describe("importação de clientes — colunas", () => {
  it("reconhece os cabeçalhos da planilha (inclusive os da exportação da Íntegra)", () => {
    assert.deepEqual(detectColumns(["Nome", "CPF/CNPJ", "E-mail", "Telefone", "Área", "Responsável", "Cidade", "UF"]), {
      name: 0,
      document: 1,
      email: 2,
      phone: 3,
      area: 4,
      owner: 5,
      city: 6,
      state: 7,
    })
    assert.deepEqual(detectColumns(["Razão social", "CNPJ", "Celular"]), { name: 0, document: 1, phone: 2 })
  })
})

describe("importação de clientes — validação", () => {
  it("linha válida vira cadastro com máscara, tipo pelo documento e responsável da equipe", () => {
    const [row] = run("Nome;CPF/CNPJ;Telefone;Responsável;Área\nEmpresa Alfa Ltda;11.222.333/0001-81;+55 48 99999-0000;ana souza;trabalhista")
    assert.equal(row.status, "ok")
    assert.equal(row.draft.kind, "PJ")
    assert.equal(row.draft.document, "11.222.333/0001-81")
    assert.equal(row.draft.phone, "(48) 99999-0000")
    assert.equal(row.draft.ownerId, "u2")
    assert.equal(row.draft.area, "Trabalhista")
    assert.equal(row.draft.status, "novo")
  })

  it("sem CPF/CNPJ entra como Contato", () => {
    const [row] = run("Nome;Telefone\nJoana Lima;(48) 98888-1111")
    assert.equal(row.status, "ok")
    assert.equal(row.draft.status, "contato")
    assert.match(row.warnings.join(" "), /Contato/)
  })

  it("inválidos: sem nome, CPF errado, e-mail, telefone, data e UF — com o motivo", () => {
    const rows = run(
      "Nome;CPF;E-mail;Telefone;Nascimento;UF\n" +
        "Jo;;;;;\n" +
        "Maria Silva;529.982.247-24;;;;\n" +
        "Pedro Alves;;pedro@;;;\n" +
        "Luiz Costa;;;1234;;\n" +
        "Carla Dias;;;;31/02/1990;\n" +
        "Rita Melo;;;;;XX",
    )
    assert.deepEqual(
      rows.map((r) => r.status),
      ["invalid", "invalid", "invalid", "invalid", "invalid", "invalid"],
    )
    assert.equal(rows[0].line, 2)
    assert.match(rows[1].reasons[0], /CPF inválido/)
    assert.match(rows[4].reasons[0], /não reconhecida/)
  })

  it("área e responsável desconhecidos não bloqueiam: viram aviso", () => {
    const [row] = run("Nome;Área;Responsável\nMaria Silva;Tributário;Fulano")
    assert.equal(row.status, "ok")
    assert.equal(row.draft.area, "Cível")
    assert.equal(row.draft.ownerId, "u1")
    assert.equal(row.warnings.length, 3)
  })
})

describe("importação de clientes — duplicados", () => {
  it("mesmo CPF de cliente já cadastrado ou de linha anterior do arquivo", () => {
    const rows = run("Nome;CPF\nMaria Silva;529.982.247-25\nMaria S.;52998224725\nJoão Souza;111.444.777-35", {
      existing: [existing("a", { name: "João de Souza", document: "111.444.777-35" })],
    })
    assert.deepEqual(
      rows.map((r) => r.status),
      ["ok", "duplicate", "duplicate"],
    )
    assert.match(rows[1].reasons[0], /repetido na linha 2/)
    assert.match(rows[2].reasons[0], /já cadastrado: João de Souza/)
  })

  it("sem documento, o mesmo telefone ou e-mail identifica a pessoa", () => {
    const rows = run("Nome;Telefone;E-mail\nJoana Lima;48 98888-1111;\nJoana;;joana@x.com", {
      existing: [existing("a", { name: "Joana (WhatsApp)", phone: "(48) 98888-1111" }), existing("b", { email: "JOANA@x.com" })],
    })
    assert.deepEqual(
      rows.map((r) => r.status),
      ["duplicate", "duplicate"],
    )
  })

  it("CPFs diferentes com o mesmo telefone (família) não são duplicados", () => {
    const rows = run("Nome;CPF;Telefone\nMaria Silva;529.982.247-25;(48) 98888-1111\nJosé Silva;111.444.777-35;(48) 98888-1111")
    assert.deepEqual(
      rows.map((r) => r.status),
      ["ok", "ok"],
    )
  })

  it("resumo por situação", () => {
    const rows = run("Nome;CPF\nMaria Silva;529.982.247-25\nMaria;52998224725\nJo;")
    assert.deepEqual(summarizeImport(rows), { total: 3, ok: 1, duplicate: 1, invalid: 1 })
  })
})
