import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LookupError } from "../errors"
import { createDjenClient, type DjenItem } from "./client"
import { djenCertidaoUrl, mapCommunication, readableContent, sourceDate } from "./mapper"

const CNJ = "00008323520184013202"
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

/** Item no formato da API pública (DADO DE TESTE — só existe aqui). */
const item = (patch: Partial<DjenItem> = {}): DjenItem => ({
  id: 1,
  hash: "h1",
  data_disponibilizacao: "2026-09-30",
  siglaTribunal: "TRF1",
  tipoComunicacao: "Intimação",
  nomeOrgao: "Tefé",
  texto: "<p>Intime-se.</p><br>MARIA DE SOUZA LIMA<br>Juíza Federal",
  numero_processo: CNJ,
  tipoDocumento: "Despacho",
  nomeClasse: "Procedimento do Juizado Especial Cível",
  destinatarios: [{ nome: "João da Silva", polo: "A" }],
  destinatarioadvogados: [{ advogado: { nome: "Ana Advogada", numero_oab: "1234", uf_oab: "am" } }],
  ...patch,
})

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

describe("DJEN — cliente por número de processo", () => {
  it("consulta pelo número (20 dígitos) e lê as páginas até o total informado", async () => {
    const { client, urls } = harness([json({ count: 2, items: [item()] }), json({ count: 2, items: [item({ id: 2 })] })])
    const result = await client.searchByProcess(CNJ)
    assert.equal(result.items.length, 2)
    assert.equal(result.total, 2)
    assert.match(urls[0], /\/comunicacao\?numeroProcesso=00008323520184013202&pagina=1&itensPorPagina=100/)
    assert.match(urls[1], /pagina=2/)
  })

  it("429 para na hora, com a espera pedida pela fonte", async () => {
    const { client, urls } = harness([new Response("", { status: 429, headers: { "Retry-After": "120" } })])
    await assert.rejects(client.searchByProcess(CNJ), (e: unknown) => e instanceof LookupError && e.code === "RATE_LIMIT" && e.retryAfterMs === 120_000)
    assert.equal(urls.length, 1)
  })

  it("403 (acesso de fora do Brasil) não é repetido", async () => {
    const { client, urls } = harness([new Response("", { status: 403 })])
    await assert.rejects(client.searchByProcess(CNJ), (e: unknown) => e instanceof LookupError && e.code === "AUTHENTICATION")
    assert.equal(urls.length, 1)
  })

  it("timeout e 503 são repetidos com espera crescente; persistindo, falha passageira", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" })
    const { client, waits } = harness([timeout, new Response("", { status: 503 }), new Response("", { status: 503 })])
    await assert.rejects(client.searchByProcess(CNJ), (e: unknown) => e instanceof LookupError && e.code === "UNAVAILABLE")
    assert.deepEqual(waits, [1000, 2000])
  })

  it("404 = nenhuma comunicação", async () => {
    const { client } = harness([new Response("", { status: 404 })])
    assert.deepEqual(await client.searchByProcess(CNJ), { items: [], total: 0 })
  })
})

describe("DJEN — mapeamento", () => {
  it("normaliza datas, texto, partes e advogados; link oficial só https", () => {
    const c = mapCommunication(item())!
    assert.equal(c.date, "2026-09-30")
    assert.equal(c.cnj, CNJ)
    assert.equal(c.text, "Intime-se.\n\nMARIA DE SOUZA LIMA\nJuíza Federal")
    assert.deepEqual(c.recipients, [{ name: "João da Silva", pole: "A" }])
    assert.deepEqual(c.lawyers, [{ name: "Ana Advogada", oab: "AM 1.234" }])
    assert.equal(c.url, djenCertidaoUrl("h1"))
    assert.equal(mapCommunication(item({ link: "http://inseguro.test/doc" }))!.url, djenCertidaoUrl("h1"))
    assert.equal(mapCommunication(item({ link: "https://pje.jus.br/doc/1" }))!.url, "https://pje.jus.br/doc/1")
    assert.equal(sourceDate({ datadisponibilizacao: "28/09/2026" }), "2026-09-28")
    assert.equal(readableContent("a&nbsp;&amp;&nbsp;b"), "a & b")
  })

  it("cancelada e sem id: marcada / descartada", () => {
    assert.equal(mapCommunication(item({ ativo: false }))!.cancelled, true)
    assert.equal(mapCommunication({ ...item(), id: undefined as unknown as number }), null)
  })
})
