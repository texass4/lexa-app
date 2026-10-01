import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LookupError } from "../errors"
import { createDjenClient, type DjenItem } from "./client"
import { mapCommunication, readableContent, sourceDate } from "./mapper"

/** Item no formato da API de Comunicações do CNJ (campos usados pela Íntegra). */
const djenItem = (patch: Partial<DjenItem> = {}): DjenItem => ({
  id: 123456789,
  hash: "9rX21azVqZwaUaCKTyPklMRAKmGWlN",
  data_disponibilizacao: "2026-09-28",
  siglaTribunal: "TJSC",
  tipoComunicacao: "Intimação",
  nomeOrgao: "1ª Vara Cível da Comarca de Florianópolis",
  texto: "<p>Fica a parte ré intimada para contestar no prazo de 15 (quinze) dias.</p>",
  numero_processo: "00008323520184013202",
  numeroprocessocommascara: "0000832-35.2018.4.01.3202",
  tipoDocumento: "Despacho",
  nomeClasse: "Procedimento Comum Cível",
  meio: "D",
  meiocompleto: "Diário de Justiça Eletrônico Nacional",
  link: "https://exemplo.jus.br/documento/1",
  ativo: true,
  destinatarios: [{ nome: "Empresa Ré Ltda", polo: "P" }],
  destinatarioadvogados: [{ advogado: { nome: "Ana Advogada", numero_oab: "12345", uf_oab: "SC" } }],
  ...patch,
})

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

function harness(replies: (Response | Error)[]) {
  const urls: string[] = []
  const waits: number[] = []
  const client = createDjenClient({
    sleep: async (ms) => void waits.push(ms),
    fetch: (async (url: string) => {
      urls.push(url)
      const reply = replies[urls.length - 1] ?? replies[replies.length - 1]
      if (reply instanceof Error) throw reply
      return reply
    }) as typeof fetch,
  })
  return { client, urls, waits }
}

const query = { numeroOab: "12345", ufOab: "SC", from: "2026-09-21", to: "2026-09-28" }

describe("DJEN — cliente", () => {
  it("consulta por OAB e janela de disponibilização, página a página", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => djenItem({ id: i }))
    const { client, urls, waits } = harness([json({ count: 101, items: page1 }), json({ count: 101, items: [djenItem({ id: 999 })] })])
    const items = await client.listByOab(query)
    assert.equal(items.length, 101)
    const first = new URL(urls[0])
    assert.equal(first.pathname, "/api/v1/comunicacao")
    assert.equal(first.searchParams.get("numeroOab"), "12345")
    assert.equal(first.searchParams.get("ufOab"), "SC")
    assert.equal(first.searchParams.get("dataDisponibilizacaoInicio"), "2026-09-21")
    assert.equal(first.searchParams.get("itensPorPagina"), "100")
    assert.equal(new URL(urls[1]).searchParams.get("pagina"), "2")
    assert.deepEqual(waits, [1000]) // pausa entre páginas
  })

  it("429: não insiste e informa a espera (1 min sem Retry-After)", async () => {
    const { client, urls } = harness([json({}, 429)])
    await assert.rejects(client.listByOab(query), (e: unknown) => e instanceof LookupError && e.code === "RATE_LIMIT" && e.retryAfterMs === 60_000)
    assert.equal(urls.length, 1)
  })

  it("403 (fora do Brasil) para sem repetir", async () => {
    const { client, urls } = harness([json({}, 403)])
    await assert.rejects(client.listByOab(query), (e: unknown) => e instanceof LookupError && e.code === "AUTHENTICATION")
    assert.equal(urls.length, 1)
  })

  it("503 tenta de novo com backoff e desiste com o status", async () => {
    const { client, urls } = harness([json({}, 503)])
    await assert.rejects(client.listByOab(query), (e: unknown) => e instanceof LookupError && e.status === 503)
    assert.equal(urls.length, 3)
  })

  it("resposta incompleta não conta como lida", async () => {
    const { client } = harness([json({ count: 5, items: [djenItem()] }), json({ count: 5, items: [] })])
    await assert.rejects(client.listByOab(query), (e: unknown) => e instanceof LookupError && e.code === "UNAVAILABLE")
  })
})

describe("DJEN — comunicação", () => {
  it("mapeia os campos da fonte e guarda o teor original", () => {
    const c = mapCommunication(djenItem())!
    assert.equal(c.externalId, "123456789")
    assert.equal(c.cnj, "00008323520184013202")
    assert.equal(c.availableAt, "2026-09-28")
    assert.equal(c.content, "<p>Fica a parte ré intimada para contestar no prazo de 15 (quinze) dias.</p>")
    assert.equal(c.officialUrl, "https://comunicaapi.pje.jus.br/api/v1/comunicacao/9rX21azVqZwaUaCKTyPklMRAKmGWlN/certidao")
    assert.deepEqual(c.lawyers, [{ name: "Ana Advogada", number: "12345", uf: "SC" }])
    assert.equal(c.cancelled, false)
  })

  it("datas nos dois formatos da fonte; sem o essencial, não guarda", () => {
    assert.equal(sourceDate({ datadisponibilizacao: "28/09/2026" }), "2026-09-28")
    assert.equal(mapCommunication(djenItem({ texto: "" })), null)
    assert.equal(mapCommunication(djenItem({ data_disponibilizacao: undefined })), null)
    assert.equal(mapCommunication(djenItem({ ativo: false }))!.cancelled, true)
  })

  it("teor para leitura sem HTML", () => {
    assert.equal(readableContent("<p>Linha 1<br>Linha&nbsp;2</p><p>Fim &amp; ok</p>"), "Linha 1\nLinha 2\nFim & ok")
  })
})
