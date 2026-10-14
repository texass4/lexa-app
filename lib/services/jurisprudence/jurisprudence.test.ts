/**
 * Jurisprudência: fonte do STJ (HTTP simulado com respostas no formato do CKAN — dado
 * de TESTE, nunca usado pela aplicação), normalização, sincronização, busca e erros.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createTtlCache } from "./cache"
import { jurisprudenceConfig } from "./config"
import { JurisprudenceError, NOT_CONFIGURED_MESSAGE, publicJurisprudenceError } from "./errors"
import { cleanList, cleanText, ementaSubject, parseDate } from "./normalization"
import { createIndexedProvider, normalizeQuery } from "./provider"
import { relatedQueryForProcess, resultSentence } from "./service"
import { createStjSource, normalizeStjRecord, stjArea, stjProcessUrl } from "./sources/stj"
import { jurisprudenceRepository, type JurisprudenceRepository } from "./store"
import { runJurisprudenceSync, type SyncRepository } from "./sync"
import type { JurisprudencePage, NormalizedDecision, SourceFile } from "./types"

/* --------------------------------- fixtures -------------------------------- */

const FILE: SourceFile = {
  dataset: "espelhos-de-acordaos-terceira-turma",
  resourceId: "r-202509",
  name: "20250930.json",
  url: "https://dadosabertos.web.stj.jus.br/dataset/x/resource/r-202509/download/20250930.json",
  format: "JSON",
  historical: false,
}

/** Registro no formato do espelho de acórdão (conteúdo de teste). */
const record = (patch: Record<string, unknown> = {}) => ({
  id: "000900001",
  numeroProcesso: "2100001",
  numeroRegistro: "202501234567",
  siglaClasse: "REsp",
  descricaoClasse: "RECURSO ESPECIAL",
  nomeOrgaoJulgador: "TERCEIRA TURMA",
  ministroRelator: "MINISTRA TESTE RELATORA",
  dataPublicacao: "DJEN        DATA:25/09/2025",
  ementa:
    "CONSUMIDOR. RECURSO ESPECIAL. INSCRIÇÃO EM CADASTRO DE INADIMPLENTES. AUSÊNCIA DE NOTIFICAÇÃO PRÉVIA. 1. Texto de teste sobre a <b>negativação</b> indevida &amp; a notificação prévia do devedor. 2. Recurso conhecido.",
  tipoDeDecisao: "ACÓRDÃO",
  dataDecisao: "20250916",
  decisao: "Vistos e relatados estes autos (texto de teste).\u0007",
  referenciasLegislativas: ["LEG:FED LEI:008078 ANO:1990 CDC", "LEG:FED LEI:008078 ANO:1990 CDC"],
  termosAuxiliares: "CADASTRO RESTRITIVO",
  ...patch,
})

/* ------------------------------ normalização ------------------------------- */

describe("jurisprudência: normalização (dado externo não confiável)", () => {
  it("texto puro: sem HTML, entidades resolvidas, sem caracteres de controle, com limite", () => {
    assert.equal(cleanText("<p>Olá&nbsp;<script>x</script>mundo &amp; cia</p>\u0000"), "Olá x mundo & cia")
    assert.equal(cleanText("   "), null)
    assert.equal(cleanText(undefined), null)
    assert.equal(cleanText("a".repeat(50), 10), `${"a".repeat(9)}…`)
    assert.deepEqual(cleanList(["A", "A", " B ", 3]), ["A", "B", "3"])
  })

  it("datas reais em AAAA-MM-DD; inválidas viram null", () => {
    assert.equal(parseDate("20250916"), "2025-09-16")
    assert.equal(parseDate("DJEN        DATA:25/09/2025"), "2025-09-25")
    assert.equal(parseDate("2025-09-16T00:00:00"), "2025-09-16")
    assert.equal(parseDate("20250231"), null)
    assert.equal(parseDate("19/13/2025"), null)
    assert.equal(parseDate("ontem"), null)
  })

  it("assunto = verbetação em maiúsculas do início da ementa", () => {
    assert.equal(
      ementaSubject("PROCESSUAL CIVIL. CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. 1. O texto começa aqui."),
      "PROCESSUAL CIVIL. CONSUMIDOR. NEGATIVAÇÃO INDEVIDA",
    )
    assert.equal(ementaSubject("Recurso especial interposto contra acórdão."), null)
  })

  it("registro do STJ → decisão normalizada, com área pelo Regimento e link oficial", () => {
    const d = normalizeStjRecord(record(), FILE) as NormalizedDecision
    assert.equal(d.provider, "stj")
    assert.equal(d.tribunal, "STJ")
    assert.equal(d.external_id, "000900001")
    assert.equal(d.class_code, "REsp")
    assert.equal(d.judgment_date, "2025-09-16")
    assert.equal(d.publication_date, "2025-09-25")
    assert.equal(d.area, "Direito Privado")
    assert.equal(d.degree, "Superior")
    assert.equal(d.subject, "CONSUMIDOR. RECURSO ESPECIAL. INSCRIÇÃO EM CADASTRO DE INADIMPLENTES. AUSÊNCIA DE NOTIFICAÇÃO PRÉVIA")
    assert.ok(!d.ementa.includes("<b>") && d.ementa.includes("negativação indevida & a notificação"))
    assert.ok(!d.decision_text!.includes("\u0007"))
    assert.deepEqual(d.legislation, ["LEG:FED LEI:008078 ANO:1990 CDC"])
    assert.equal(d.source_url, "https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=202501234567")
    assert.equal(d.raw_reference.file, "20250930.json")
    assert.equal(stjArea("Sexta Turma"), "Direito Penal")
    assert.equal(stjArea("CORTE ESPECIAL"), null)
    assert.equal(stjProcessUrl(null), null)
  })

  it("sem identificador, ementa, órgão ou data: descarta com o motivo (nada é inventado)", () => {
    assert.ok("skipped" in normalizeStjRecord(record({ id: "", numeroRegistro: "" }), FILE))
    assert.match((normalizeStjRecord(record({ ementa: "" }), FILE) as { skipped: string }).skipped, /sem ementa/)
    assert.match((normalizeStjRecord(record({ nomeOrgaoJulgador: null }), FILE) as { skipped: string }).skipped, /órgão julgador/)
    assert.match((normalizeStjRecord(record({ dataDecisao: "abc" }), FILE) as { skipped: string }).skipped, /data/)
    assert.ok("skipped" in normalizeStjRecord("texto solto", FILE))
  })

  it("hash: igual para o mesmo conteúdo, diferente quando a ementa muda", () => {
    const a = normalizeStjRecord(record(), FILE) as NormalizedDecision
    const b = normalizeStjRecord(record(), { ...FILE, resourceId: "outro", name: "x.json" }) as NormalizedDecision
    const c = normalizeStjRecord(record({ ementa: "CONSUMIDOR. Outro texto." }), FILE) as NormalizedDecision
    assert.equal(a.content_hash, b.content_hash)
    assert.notEqual(a.content_hash, c.content_hash)
  })
})

/* ------------------------------- fonte (HTTP) ------------------------------ */

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error

function fakeFetch(routes: Record<string, Reply | Reply[]>) {
  const calls: string[] = []
  const fn = (async (input: string | URL) => {
    const url = String(input)
    calls.push(url)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return new Response("not found", { status: 404 })
    const entry = routes[key]
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry
    if (reply instanceof Error) throw reply
    const body = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {})
    return new Response(reply.status >= 300 && reply.status < 400 ? null : body, { status: reply.status, headers: reply.headers })
  }) as typeof fetch
  return { fn, calls }
}

const ckan = (resources: object[]) => ({ status: 200, body: { success: true, result: { resources } } })
const resource = (id: string, name: string, format = "JSON", host = "https://dadosabertos.web.stj.jus.br") => ({
  id,
  name,
  format,
  url: `${host}/dataset/d/resource/${id}/download/${name}`,
})
const quick = { sleep: async () => {}, maxWaitMs: 10 }

describe("jurisprudência: fonte oficial do STJ", () => {
  it("lista só JSON/ZIP do portal oficial, em ordem cronológica; recusa link de outro host", async () => {
    const { fn } = fakeFetch({
      package_show: ckan([
        resource("b", "20250831.json"),
        resource("hist", "20220101.zip", "ZIP"),
        resource("a", "20250731.json"),
        resource("x", "20250930.json", "JSON", "https://evil.example.com"),
        { id: "pdf", name: "dicionario.pdf", format: "PDF", url: "https://dadosabertos.web.stj.jus.br/d.pdf" },
      ]),
    })
    const files = await createStjSource({ fetch: fn, ...quick }).listFiles("espelhos-de-acordaos-terceira-turma")
    assert.deepEqual(
      files.map((f) => [f.resourceId, f.historical]),
      [
        ["hist", true],
        ["a", false],
        ["b", false],
      ],
    )
  })

  it("conjunto com nome inválido é recusado antes de qualquer requisição", async () => {
    const { fn, calls } = fakeFetch({})
    await assert.rejects(createStjSource({ fetch: fn, ...quick }).listFiles("../../etc"), (e: JurisprudenceError) => e.code === "INVALID_DATA")
    assert.equal(calls.length, 0)
  })

  it("falha passageira (503) → tenta de novo e segue", async () => {
    const { fn, calls } = fakeFetch({ package_show: [{ status: 503 }, ckan([resource("a", "20250731.json")])] })
    const files = await createStjSource({ fetch: fn, ...quick }).listFiles("espelhos-de-acordaos-terceira-turma")
    assert.equal(files.length, 1)
    assert.equal(calls.length, 2)
  })

  it("429 → RATE_LIMIT com o tempo pedido pela fonte (sem insistir)", async () => {
    const { fn, calls } = fakeFetch({ package_show: { status: 429, headers: { "retry-after": "120" } } })
    await assert.rejects(
      createStjSource({ fetch: fn, ...quick }).listFiles("espelhos-de-acordaos-terceira-turma"),
      (e: JurisprudenceError) => e.code === "RATE_LIMIT" && e.retryAfterMs === 120_000,
    )
    assert.equal(calls.length, 1)
  })

  it("sem resposta → TIMEOUT depois das tentativas", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" })
    const { fn, calls } = fakeFetch({ package_show: timeout })
    await assert.rejects(createStjSource({ fetch: fn, ...quick }).listFiles("espelhos-de-acordaos-terceira-turma"), (e: JurisprudenceError) => e.code === "TIMEOUT")
    assert.equal(calls.length, 3)
  })

  it("arquivo acima do tamanho máximo é recusado", async () => {
    const { fn } = fakeFetch({ "20250930.json": { status: 200, body: [record()], headers: { "content-length": "999999999" } } })
    await assert.rejects(createStjSource({ fetch: fn, ...quick, maxFileBytes: 1000 }).fetchFile(FILE), (e: JurisprudenceError) => e.code === "INVALID_DATA")
  })

  it("lê lista solta ou embrulhada; redireciona só dentro do portal", async () => {
    const wrapped = fakeFetch({ "20250930.json": { status: 200, body: { documentos: [record()] } } })
    assert.equal((await createStjSource({ fetch: wrapped.fn, ...quick }).fetchFile(FILE)).length, 1)

    const inside = fakeFetch({
      "20250930.json": { status: 302, headers: { location: "https://dadosabertos.web.stj.jus.br/storage/f.json" } },
      "storage/f.json": { status: 200, body: [record(), record({ id: "2" })] },
    })
    assert.equal((await createStjSource({ fetch: inside.fn, ...quick }).fetchFile(FILE)).length, 2)

    const outside = fakeFetch({ "20250930.json": { status: 302, headers: { location: "https://evil.example.com/f.json" } } })
    await assert.rejects(createStjSource({ fetch: outside.fn, ...quick }).fetchFile(FILE), (e: JurisprudenceError) => e.code === "INVALID_DATA")
    assert.ok(!outside.calls.some((url) => url.includes("evil")))
  })

  it("arquivo que não é JSON → INVALID_DATA; ZIP histórico não é lido", async () => {
    const { fn } = fakeFetch({ "20250930.json": { status: 200, body: "<html>erro</html>" } })
    await assert.rejects(createStjSource({ fetch: fn, ...quick }).fetchFile(FILE), (e: JurisprudenceError) => e.code === "INVALID_DATA")
    await assert.rejects(createStjSource({ fetch: fn, ...quick }).fetchFile({ ...FILE, historical: true }), (e: JurisprudenceError) => e.code === "INVALID_DATA")
  })
})

/* ------------------------------ sincronização ------------------------------ */

function memoryRepo() {
  const rows = new Map<string, NormalizedDecision>()
  const files = new Set<string>()
  const runs: { status: string; created: number; updated: number; skipped: number }[] = []
  let failUpsert = false
  const repo: SyncRepository = {
    startRun: async () => runs.length,
    finishRun: async (_id, s) => void runs.push({ status: s.status, created: s.created, updated: s.updated, skipped: s.skipped }),
    processedFiles: async () => new Set(files),
    markFile: async (_p, file) => void files.add(file.resourceId),
    existingHashes: async (_p, _t, ids) => new Map(ids.filter((id) => rows.has(id)).map((id) => [id, rows.get(id)!.content_hash])),
    upsert: async (list) => {
      if (failUpsert) throw new Error("banco fora")
      for (const row of list) rows.set(row.external_id, row)
    },
  }
  return { repo, rows, files, runs, fail: (v: boolean) => (failUpsert = v) }
}

function fakeSource(listing: Record<string, SourceFile[]>, contents: Record<string, unknown[] | Error>) {
  const fetched: string[] = []
  return {
    fetched,
    source: {
      id: "stj" as const,
      tribunal: "STJ",
      label: "teste",
      datasets: Object.keys(listing),
      listFiles: async (dataset: string) => {
        const list = listing[dataset]
        if (!list) throw new JurisprudenceError("UNAVAILABLE", "conjunto fora")
        return list
      },
      fetchFile: async (file: SourceFile) => {
        fetched.push(file.resourceId)
        const content = contents[file.resourceId]
        if (content instanceof Error) throw content
        return content ?? []
      },
      normalize: normalizeStjRecord,
    },
  }
}

const file = (id: string, name: string, dataset = "d1"): SourceFile => ({ ...FILE, dataset, resourceId: id, name })

describe("jurisprudência: sincronização", () => {
  it("primeira vez só os N mais recentes; repetidos no arquivo viram uma decisão; inválidos contados", async () => {
    const mem = memoryRepo()
    const { source, fetched } = fakeSource(
      { d1: [file("m1", "20250630.json"), file("m2", "20250731.json"), file("m3", "20250831.json")] },
      { m3: [record(), record(), record({ id: "2" }), record({ ementa: "" })], m2: [record({ id: "3" })] },
    )
    const summary = await runJurisprudenceSync({ source, repo: mem.repo, initialFiles: 2, maxFiles: 10, sleep: async () => {} })
    assert.deepEqual(fetched, ["m3", "m2"])
    assert.equal(summary.status, "success")
    assert.equal(summary.created, 3)
    assert.equal(summary.invalid, 1)
    assert.equal(summary.fetched, 5)
    assert.equal(summary.skipped, 2) // 1 repetido + 1 inválido
    assert.equal(mem.rows.size, 3)
  })

  it("idempotente: rodar de novo não baixa nem duplica; arquivo novo com conteúdo igual = ignorado; mudança = atualização", async () => {
    const mem = memoryRepo()
    const listing = { d1: [file("m1", "20250731.json")] }
    await runJurisprudenceSync({ source: fakeSource(listing, { m1: [record()] }).source, repo: mem.repo, initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    const again = fakeSource(listing, { m1: [record()] })
    const second = await runJurisprudenceSync({ source: again.source, repo: mem.repo, initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    assert.deepEqual(again.fetched, [])
    assert.equal(second.created + second.updated, 0)

    const next = { d1: [...listing.d1, file("m2", "20250831.json")] }
    const third = await runJurisprudenceSync({
      source: fakeSource(next, { m2: [record(), record({ id: "000900001", ementa: "CONSUMIDOR. Ementa corrigida pela fonte." }), record({ id: "9" })] }).source,
      repo: mem.repo,
      initialFiles: 3,
      maxFiles: 5,
      sleep: async () => {},
    })
    assert.equal(third.created, 1)
    assert.equal(third.updated, 1)
    assert.equal(mem.rows.get("000900001")!.ementa, "CONSUMIDOR. Ementa corrigida pela fonte.")
    assert.equal(mem.rows.size, 2)
  })

  it("limite de arquivos por execução: o resto fica para a próxima", async () => {
    const mem = memoryRepo()
    const { source, fetched } = fakeSource(
      { d1: [file("a1", "20250731.json"), file("a2", "20250831.json")], d2: [file("b1", "20250831.json", "d2")] },
      { a1: [record({ id: "a1" })], a2: [record({ id: "a2" })], b1: [record({ id: "b1" })] },
    )
    const summary = await runJurisprudenceSync({ source, repo: mem.repo, initialFiles: 3, maxFiles: 2, sleep: async () => {} })
    // Intercalado: um de cada conjunto antes do segundo do mesmo conjunto.
    assert.deepEqual(fetched, ["a2", "b1"])
    assert.equal(summary.stoppedBy, "file_limit")
    assert.equal(summary.pendingFiles, 1)
  })

  it("429 da fonte encerra como parcial e guarda o tempo de espera", async () => {
    const mem = memoryRepo()
    const { source, fetched } = fakeSource(
      { d1: [file("a1", "20250731.json"), file("a2", "20250831.json")] },
      { a2: new JurisprudenceError("RATE_LIMIT", "HTTP 429", { retryAfterMs: 60_000 }), a1: [record()] },
    )
    const summary = await runJurisprudenceSync({ source, repo: mem.repo, initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    assert.deepEqual(fetched, ["a2"])
    assert.equal(summary.status, "partial")
    assert.equal(summary.retryAfterMs, 60_000)
    assert.equal(mem.runs.at(-1)!.status, "partial")
  })

  it("conjunto fora do ar não impede os outros; erro de gravação não marca o arquivo (tenta de novo depois)", async () => {
    const mem = memoryRepo()
    const listing = { quebrado: undefined as unknown as SourceFile[], d1: [file("a1", "20250731.json")] }
    const summary = await runJurisprudenceSync({ source: fakeSource(listing, { a1: [record()] }).source, repo: mem.repo, initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    assert.equal(summary.status, "partial")
    assert.equal(summary.files, 1)
    assert.ok(summary.errors.some((e) => e.dataset === "quebrado"))

    const failing = memoryRepo()
    failing.fail(true)
    const run = await runJurisprudenceSync({ source: fakeSource({ d1: [file("a1", "20250731.json")] }, { a1: [record()] }).source, repo: failing.repo, initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    assert.equal(run.status, "failed")
    assert.equal(failing.files.size, 0)
  })

  it("sem tempo: não começa download novo", async () => {
    const mem = memoryRepo()
    const { source, fetched } = fakeSource({ d1: [file("a1", "20250731.json")] }, { a1: [record()] })
    const summary = await runJurisprudenceSync({ source, repo: mem.repo, initialFiles: 3, maxFiles: 5, deadline: 0, now: () => 1, sleep: async () => {} })
    assert.deepEqual(fetched, [])
    assert.equal(summary.stoppedBy, "time")
  })
})

/* ---------------------------------- busca ---------------------------------- */

describe("jurisprudência: busca", () => {
  it("consulta validada: termos longos, datas e período inválidos são recusados; página limitada", () => {
    assert.throws(() => normalizeQuery({ text: "a".repeat(301) }), (e: JurisprudenceError) => e.code === "INVALID_QUERY")
    assert.throws(() => normalizeQuery({ text: "x", filters: { from: "31/12/2025" } }), (e: JurisprudenceError) => e.code === "INVALID_QUERY")
    assert.throws(() => normalizeQuery({ text: "x", filters: { from: "2025-02-30" } }), (e: JurisprudenceError) => e.code === "INVALID_QUERY")
    assert.throws(() => normalizeQuery({ text: "x", filters: { from: "2025-10-01", to: "2025-01-01" } }), (e: JurisprudenceError) => e.code === "INVALID_QUERY")
    const q = normalizeQuery({ text: "  dano   moral ", page: 9999, pageSize: 500, filters: { court: "TERCEIRA TURMA", hacker: "x" } as never })
    assert.equal(q.text, "dano moral")
    assert.equal(q.page, 250)
    assert.equal(q.pageSize, 50)
    assert.deepEqual(q.filters, { court: "TERCEIRA TURMA" })
    assert.equal(normalizeQuery({ text: "x", sort: "qualquer" as never }).sort, "relevance")
  })

  it("paginação no servidor (deslocamento) e cache curto da mesma pesquisa", async () => {
    const calls: { limit: number; offset: number }[] = []
    const repo = {
      search: async (p: { limit: number; offset: number }) => {
        calls.push({ limit: p.limit, offset: p.offset })
        return { rows: [], total: 45 }
      },
      getDecision: async () => null,
    } as unknown as JurisprudenceRepository
    const provider = createIndexedProvider(repo, { cache: createTtlCache<JurisprudencePage>() })
    const page = await provider.search({ text: "negativação", page: 3 })
    assert.deepEqual(calls[0], { limit: 20, offset: 40 })
    assert.equal(page.pages, 3)
    await provider.search({ text: "negativação", page: 3 })
    assert.equal(calls.length, 1)
    await assert.rejects(provider.getDecision("00000000-0000-0000-0000-000000000000"), (e: JurisprudenceError) => e.code === "NOT_FOUND")
  })

  it("erros do banco viram erros conhecidos (tempo esgotado, migração ausente, indisponível)", async () => {
    const failing = (error: object) =>
      ({
        rpc: () => ({ abortSignal: async () => ({ data: null, error }) }),
      }) as never
    await assert.rejects(jurisprudenceRepository(failing({ code: "57014", message: "canceling statement" })).search({ text: "x", filters: {}, sort: "relevance", limit: 20, offset: 0 }), (e: JurisprudenceError) => e.code === "TIMEOUT")
    await assert.rejects(jurisprudenceRepository(failing({ code: "PGRST202", message: "function not found" })).search({ text: "x", filters: {}, sort: "relevance", limit: 20, offset: 0 }), (e: JurisprudenceError) => e.code === "NOT_CONFIGURED")
    await assert.rejects(jurisprudenceRepository(failing({ code: "XX000", message: "boom" })).search({ text: "x", filters: {}, sort: "relevance", limit: 20, offset: 0 }), (e: JurisprudenceError) => e.code === "UNAVAILABLE")
  })

  it("decisão com id inválido nem chega ao banco", async () => {
    let touched = false
    const supabase = { from: () => ((touched = true), {}) } as never
    assert.equal(await jurisprudenceRepository(supabase).getDecision("1; drop table"), null)
    assert.equal(touched, false)
  })

  it("pesquisa a partir do processo usa só o que ele tem; classe genérica não entra", () => {
    const q = relatedQueryForProcess({ subject: "Indenização por Dano Moral", type: "Ação de cobrança", className: "Procedimento Comum Cível", area: "Cível" })
    assert.equal(q.text, "Indenização por Dano Moral cobrança")
    assert.deepEqual(q.filters, { area: "Direito Privado" })
    assert.deepEqual(q.basis, ["assunto: Indenização por Dano Moral", "tipo de ação: Ação de cobrança", "área: Direito Privado"])
    // Só palavras genéricas ("Ação de alimentos" → "alimentos"): nunca casa por "ação".
    assert.equal(relatedQueryForProcess({ subject: undefined, type: "Ação de alimentos", className: "Procedimento Comum", area: "Família" }).text, "alimentos")
    assert.ok(relatedQueryForProcess({ subject: undefined, type: "Ação", className: undefined, area: "Cível" }).missing)
    const labor = relatedQueryForProcess({ subject: undefined, type: "", className: undefined, area: "Trabalhista" })
    assert.ok(labor.missing)
    assert.deepEqual(labor.filters, {})
    assert.equal(resultSentence(8), "Encontramos 8 decisões potencialmente relevantes.")
    assert.equal(resultSentence(1), "Encontramos 1 decisão potencialmente relevante.")
  })
})

/* ------------------------------ configuração ------------------------------- */

describe("jurisprudência: configuração e erros públicos", () => {
  it("sem JURISPRUDENCIA_FONTES nada é ligado; fontes desconhecidas são ignoradas", () => {
    assert.equal(jurisprudenceConfig({}).enabled, false)
    assert.deepEqual(jurisprudenceConfig({ JURISPRUDENCIA_FONTES: "stj, google" }).sources, ["stj"])
    const c = jurisprudenceConfig({ JURISPRUDENCIA_FONTES: "stj", JURISPRUDENCIA_STJ_ARQUIVOS_INICIAIS: "999", JURISPRUDENCIA_STJ_ARQUIVOS_POR_EXECUCAO: "4" })
    assert.equal(c.stj.initialFiles, 3)
    assert.equal(c.stj.filesPerRun, 4)
  })

  it("nenhum detalhe técnico chega à tela", () => {
    const pub = publicJurisprudenceError(new JurisprudenceError("UNAVAILABLE", "HTTP 503 dadosabertos.web.stj.jus.br stack…"))
    assert.ok(!/HTTP|stj\.jus|stack/.test(pub.message))
    assert.equal(publicJurisprudenceError(new JurisprudenceError("NOT_CONFIGURED")).message, NOT_CONFIGURED_MESSAGE)
    assert.equal(publicJurisprudenceError(new Error("qualquer")).status, 503)
    assert.equal(publicJurisprudenceError(new JurisprudenceError("RATE_LIMIT")).status, 429)
  })
})
