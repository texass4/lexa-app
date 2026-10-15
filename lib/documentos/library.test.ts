import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  activeFilters,
  breadcrumbs,
  EMPTY_STATE,
  extensionOf,
  matchesState,
  periodRange,
  readState,
  sortDocuments,
  stateParams,
  toQuery,
  uploadIssue,
  type LibraryState,
  FORMATS,
  ACCEPTED_EXTENSIONS,
  statusOf,
} from "./library"
import { pageNumbers } from "./pagination"
import { documentSearchWhere, olderDocumentsWhere } from "@/lib/store/history-lists"
import { searchFilter, windowBounds } from "@/lib/store/storage"
import type { LegalDocument } from "@/types"

const now = new Date(2026, 9, 15, 10)

const doc = (over: Partial<LegalDocument>): LegalDocument =>
  ({
    id: "d1",
    organizationId: "o1",
    name: "Contrato de honorários.pdf",
    kind: "Contrato",
    extension: "pdf",
    sizeBytes: 1000,
    uploadedById: "u1",
    uploadedAt: "2026-10-10T09:00:00",
    ...over,
  }) as LegalDocument

describe("Central de Documentos: estado na URL", () => {
  it("lê e escreve o mesmo estado (e ignora valores desconhecidos)", () => {
    const state: LibraryState = {
      section: "clientes",
      clientId: "c1",
      processId: "p1",
      kind: "Petição",
      formats: ["pdf", "word"],
      uploadedById: "u2",
      period: "30d",
    }
    assert.deepEqual(readState(stateParams(state)), state)
    assert.deepEqual(readState(new URLSearchParams("pasta=lixo&categoria=Nada&formato=exe&periodo=x")), EMPTY_STATE)
  })

  it("mantém o atalho antigo ?pasta=recentes", () => {
    assert.equal(readState(new URLSearchParams("pasta=recentes")).section, "recentes")
  })

  it("o cliente aberto em Clientes é o lugar; em Todos, é filtro removível", () => {
    assert.deepEqual(activeFilters({ ...EMPTY_STATE, section: "clientes", clientId: "c1" }), [])
    assert.deepEqual(activeFilters({ ...EMPTY_STATE, clientId: "c1", formats: ["pdf"] }), [{ key: "formats", value: "pdf" }, { key: "clientId" }])
  })
})

describe("Central de Documentos: filtros", () => {
  it("período: intervalos em dias locais, fim exclusivo", () => {
    assert.deepEqual(periodRange("7d", now), { from: "2026-10-09" })
    assert.deepEqual(periodRange("ano", now), { from: "2026-01-01" })
    assert.deepEqual(periodRange("anterior", now), { to: "2026-01-01" })
  })

  it("aplica na memória as mesmas regras do banco", () => {
    const s: LibraryState = { ...EMPTY_STATE, kind: "Contrato", formats: ["pdf"], uploadedById: "u1", period: "7d" }
    assert.equal(matchesState(doc({}), s, now), true)
    assert.equal(matchesState(doc({ extension: "docx" }), s, now), false)
    assert.equal(matchesState(doc({ uploadedAt: "2026-10-01T09:00:00" }), s, now), false)
    assert.equal(matchesState(doc({ uploadedById: "u9" }), s, now), false)
    assert.equal(matchesState(doc({ kind: "Laudo" }), s, now), false)
  })

  it("busca por nome, categoria, cliente e processo", () => {
    assert.equal(matchesState(doc({}), EMPTY_STATE, now, "honorarios"), true)
    assert.equal(matchesState(doc({}), EMPTY_STATE, now, "joão", { clientName: "João Pereira" }), true)
    assert.equal(matchesState(doc({}), EMPTY_STATE, now, "5012345", { processNumber: "5012345-87.2026" }), true)
    assert.equal(matchesState(doc({}), EMPTY_STATE, now, "inexistente"), false)
  })

  it("o recorte do banco leva os mesmos filtros (e a fronteira da janela)", () => {
    const s: LibraryState = { ...EMPTY_STATE, kind: "Contrato", clientId: "c1", formats: ["word"], period: "anterior" }
    const q = toQuery(s, now)
    assert.deepEqual(q, {
      kind: "Contrato",
      clientId: "c1",
      processId: undefined,
      extensions: ["doc", "docx"],
      uploadedById: undefined,
      to: "2026-01-01",
    })
    const bounds = windowBounds(now)
    const list = olderDocumentsWhere(bounds, q)
    assert.deepEqual(list.scope.filter, {
      eq: [
        ["data->>kind", "Contrato"],
        ["data->>clientId", "c1"],
      ],
      in: [["data->>extension", ["doc", "docx"]]],
      lt: [
        ["data->>uploadedAt", bounds.documents],
        ["data->>uploadedAt", "2026-01-01"],
      ],
    })
    // Filtros diferentes, listas diferentes (cada uma com o próprio cursor).
    assert.notEqual(list.id, olderDocumentsWhere(bounds, { ...q, kind: "Laudo" }).id)
    const search = documentSearchWhere("acordo", searchFilter("acordo")!, { extensions: ["pdf"] })
    assert.equal(search.scope.filter?.or, "search.ilike.*acordo*")
    assert.deepEqual(search.scope.filter?.in, [["data->>extension", ["pdf"]]])
  })
})

describe("Central de Documentos: ordem e trilha", () => {
  it("ordena por nome (natural, sem acento), tamanho e data; empate pelo mais recente", () => {
    const a = doc({ id: "a", name: "Ação 10.pdf", sizeBytes: 5, uploadedAt: "2026-10-01" })
    const b = doc({ id: "b", name: "acao 2.pdf", sizeBytes: 9, uploadedAt: "2026-10-02" })
    assert.deepEqual(
      sortDocuments([a, b], "nome", "asc").map((d) => d.id),
      ["b", "a"],
    )
    assert.deepEqual(
      sortDocuments([a, b], "tamanho", "desc").map((d) => d.id),
      ["b", "a"],
    )
    assert.deepEqual(
      sortDocuments([a, b], "enviado", "asc").map((d) => d.id),
      ["a", "b"],
    )
    assert.deepEqual(
      sortDocuments([a, b], "formato", "asc").map((d) => d.id),
      ["b", "a"],
    )
  })

  it("trilha reflete o lugar; cada segmento leva ao lugar dele; o último é o atual", () => {
    const crumbs = breadcrumbs(
      { ...EMPTY_STATE, section: "clientes", clientId: "c1", processId: "p1", kind: "Contrato" },
      { client: "Maria", process: "Ação de cobrança" },
    )
    assert.deepEqual(
      crumbs.map((c) => c.label),
      ["Documentos", "Clientes", "Maria", "Ação de cobrança", "Contratos"],
    )
    assert.equal(crumbs.at(-1)!.target, undefined)
    assert.deepEqual(crumbs[2].target, { section: "clientes", formats: [], clientId: "c1" })
    assert.deepEqual(
      breadcrumbs({ ...EMPTY_STATE, kind: "Petição" }, {}).map((c) => c.label),
      ["Documentos", "Petições"],
    )
    assert.deepEqual(
      breadcrumbs({ ...EMPTY_STATE, clientId: "c1" }, {}).map((c) => c.label),
      ["Documentos", "Todos os documentos"],
    )
  })
})

describe("Central de Documentos: envio", () => {
  it("aceita só os formatos do armazenamento, até 25 MB", () => {
    assert.equal(extensionOf("foto.JPEG"), "jpg")
    assert.equal(extensionOf("planilha.xlsx"), "xlsx")
    assert.equal(extensionOf("dados.CSV"), "csv")
    assert.equal(extensionOf("apresentacao.pptx"), null)
    assert.equal(extensionOf("semextensao"), null)
    assert.equal(uploadIssue({ name: "a.pdf", size: 10 }), null)
    assert.match(uploadIssue({ name: "a.exe", size: 10 })!, /Formato não aceito/)
    assert.match(uploadIssue({ name: "a.pdf", size: 26 * 1024 * 1024 })!, /25 MB/)
    assert.match(uploadIssue({ name: "a.pdf", size: 0 })!, /vazio/)
  })
})

describe("Central de Documentos: formatos, situação e páginas", () => {
  it("botões de formato: PDF, Word, Excel e Outros cobrem todos os formatos aceitos, sem repetir", () => {
    const all = FORMATS.flatMap((f) => f.extensions)
    assert.deepEqual(
      FORMATS.map((f) => f.short),
      ["PDF", "Word", "Excel", "Outros"],
    )
    assert.deepEqual([...all].sort(), [...ACCEPTED_EXTENSIONS].sort())
    assert.equal(new Set(all).size, all.length)
  })

  it("links antigos de formato (imagem, texto) abrem em Outros", () => {
    assert.deepEqual(readState(new URLSearchParams("formato=imagem,texto")).formats, ["outros"])
    assert.deepEqual(readState(new URLSearchParams("formato=excel")).formats, ["excel"])
  })

  it("documento sem situação marcada aparece como OK", () => {
    assert.equal(statusOf({}).label, "OK")
    assert.equal(statusOf({ status: "revisao" }).label, "Em revisão")
    assert.equal(statusOf({ status: "assinado" }).label, "Assinado")
  })

  it("paginação com reticências", () => {
    assert.deepEqual(pageNumbers(1, 5), [1, 2, 3, 4, 5])
    assert.deepEqual(pageNumbers(1, 9), [1, 2, "…", 9])
    assert.deepEqual(pageNumbers(5, 12), [1, "…", 4, 5, 6, "…", 12])
  })
})
