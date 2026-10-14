/**
 * Jurisprudência de ponta a ponta contra um Supabase de verdade (banco, RLS, PostgREST):
 *
 *   arquivo no formato do portal (CKAN) → sincronização → normalização → deduplicação
 *   → tabela `jurisprudence` → busca pela sessão do advogado → salvar → vincular
 *   → isolamento entre escritórios.
 *
 * A "fonte" aqui é um servidor HTTP local que responde no formato do CKAN do STJ com
 * DADOS DE TESTE (o ambiente de testes não acessa o portal). O código exercitado é o
 * mesmo da produção: `createStjSource` + `runJurisprudenceSync` + `supabaseSyncRepository`
 * + `jurisprudenceRepository`. Tudo o que é criado é apagado no fim.
 *
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
 */

import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, describe, it } from "node:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createStjSource } from "@/lib/services/jurisprudence/sources/stj"
import { jurisprudenceRepository, supabaseSyncRepository } from "@/lib/services/jurisprudence/store"
import { runJurisprudenceSync } from "@/lib/services/jurisprudence/sync"

const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skip = !URL_ || !ANON || !SERVICE ? "defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY" : false

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = `Teste-${run}-senha!`
const DATASET = `espelhos-de-acordaos-teste-${run}`
const orgs = { a: crypto.randomUUID(), b: crypto.randomUUID() }
const userIds: string[] = []

/** Registros de TESTE no formato do espelho de acórdão. */
const espelho = (n: number, ementa: string, patch: Record<string, unknown> = {}) => ({
  id: `teste-${run}-${n}`,
  numeroProcesso: String(2_200_000 + n),
  numeroRegistro: `2025${String(n).padStart(8, "0")}`,
  siglaClasse: "REsp",
  descricaoClasse: "RECURSO ESPECIAL",
  nomeOrgaoJulgador: "TERCEIRA TURMA",
  ministroRelator: "MINISTRO DE TESTE",
  dataDecisao: `202509${String(10 + n).padStart(2, "0")}`,
  ementa,
  ...patch,
})

const files: Record<string, unknown> = {
  "20250831.json": [
    espelho(1, "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. Inscrição sem prévia notificação. Dano moral. (texto de teste)"),
    espelho(2, "PROCESSUAL CIVIL. Honorários sucumbenciais. (texto de teste)"),
  ],
  "20250930.json": [
    espelho(1, "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. Inscrição sem prévia notificação. Dano moral. (texto de teste)"),
    espelho(3, "CONSUMIDOR. Cadastro de inadimplentes. Notificação prévia comprovada. (texto de teste)"),
    { id: "", ementa: "registro quebrado" },
  ],
}

let server: Server
let base = ""
let admin: SupabaseClient

async function userClient(email: string) {
  const client = createClient(URL_!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

async function createUser(email: string, org: string, role: "owner" | "staff") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  userIds.push(data.user.id)
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, organization_id: org, role, name: email, email })
  if (profileError) throw profileError
  return data.user.id
}

const source = () => createStjSource({ baseUrl: base, datasets: [DATASET], sleep: async () => {} })

describe("jurisprudência de ponta a ponta (Supabase real)", { skip }, () => {
  before(async () => {
    server = createServer((req, res) => {
      const url = new globalThis.URL(req.url ?? "/", "http://local")
      if (url.pathname === "/api/3/action/package_show" && url.searchParams.get("id") === DATASET) {
        const resources = Object.keys(files).map((name) => ({ id: `${run}-${name}`, name, format: "JSON", url: `${base}/files/${name}` }))
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ success: true, result: { resources } }))
        return
      }
      const name = url.pathname.replace("/files/", "")
      if (files[name]) return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(files[name]))
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } })
    const { error } = await admin.from("organizations").insert([
      { id: orgs.a, name: `Juris A ${run}`, status: "active" },
      { id: orgs.b, name: `Juris B ${run}`, status: "active" },
    ])
    if (error) throw error
    await createUser(`juris-a-${run}@teste.local`, orgs.a, "owner")
    await createUser(`juris-b-${run}@teste.local`, orgs.b, "owner")
    const { error: processError } = await admin.from("processes").insert([
      { organization_id: orgs.a, id: `p-a-${run}`, data: { id: `p-a-${run}`, code: "#A", number: "0001" } },
      { organization_id: orgs.b, id: `p-b-${run}`, data: { id: `p-b-${run}`, code: "#B", number: "0002" } },
    ])
    if (processError) throw processError
  })

  after(async () => {
    server?.close()
    if (!admin) return
    await admin.from("jurisprudence").delete().like("external_id", `teste-${run}-%`)
    await admin.from("jurisprudence_sync_files").delete().like("resource_id", `${run}-%`)
    await admin.from("organizations").delete().in("id", [orgs.a, orgs.b])
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  })

  it("sincroniza: normaliza, deduplica e descarta o inválido", async () => {
    const summary = await runJurisprudenceSync({ source: source(), repo: supabaseSyncRepository(admin), initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    assert.equal(summary.status, "success", JSON.stringify(summary.errors))
    assert.equal(summary.files, 2)
    assert.equal(summary.created, 3)
    assert.equal(summary.invalid, 1)
    const { data } = await admin.from("jurisprudence").select("external_id, area, subject, source_url").like("external_id", `teste-${run}-%`).order("external_id")
    assert.equal(data?.length, 3)
    assert.equal(data?.[0].area, "Direito Privado")
    assert.equal(data?.[0].subject, "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA")
    assert.match(data?.[0].source_url ?? "", /^https:\/\/processo\.stj\.jus\.br\//)
    const { data: log } = await admin.from("jurisprudence_sync_runs").select("status, records_created").order("id", { ascending: false }).limit(1).single()
    assert.equal(log?.status, "success")
    assert.equal(log?.records_created, 3)
  })

  it("é idempotente: rodar de novo não baixa nem duplica", async () => {
    const summary = await runJurisprudenceSync({ source: source(), repo: supabaseSyncRepository(admin), initialFiles: 3, maxFiles: 5, sleep: async () => {} })
    assert.equal(summary.files, 0)
    assert.equal(summary.created + summary.updated, 0)
    const { count } = await admin.from("jurisprudence").select("id", { count: "exact", head: true }).like("external_id", `teste-${run}-%`)
    assert.equal(count, 3)
  })

  it("advogado pesquisa em linguagem natural, abre, salva e vincula — e o outro escritório não vê", async () => {
    const a = await userClient(`juris-a-${run}@teste.local`)
    const repoA = jurisprudenceRepository(a)
    const page = await repoA.search({ text: "indenizacao por negativacao indevida sem notificacao", filters: { court: "TERCEIRA TURMA" }, sort: "relevance", limit: 20, offset: 0 })
    const ours = page.rows.filter((r) => r.processNumber?.startsWith("22000"))
    assert.ok(ours.length >= 2)
    assert.equal(ours[0].processNumber, "2200001")
    assert.match(ours[0].snippet, /⟦/)

    const decision = await repoA.getDecision(ours[0].id)
    assert.equal(decision?.court, "TERCEIRA TURMA")
    await repoA.save(orgs.a, ours[0].id, userIds[0], "usar na inicial")
    assert.equal((await repoA.listSaved(20, 0)).entries[0].notes, "usar na inicial")
    assert.equal((await repoA.link(orgs.a, `p-a-${run}`, ours[0].id, userIds[0])).created, true)
    assert.equal((await repoA.link(orgs.a, `p-a-${run}`, ours[0].id, userIds[0])).created, false)
    assert.equal((await repoA.listLinked(`p-a-${run}`)).length, 1)
    // Processo de outro escritório: o banco recusa.
    await assert.rejects(repoA.link(orgs.a, `p-b-${run}`, ours[0].id, userIds[0]))

    const b = jurisprudenceRepository(await userClient(`juris-b-${run}@teste.local`))
    assert.ok((await b.getDecision(ours[0].id))?.id, "a base pública é a mesma para todos")
    assert.equal((await b.listSaved(20, 0)).total, 0)
    assert.deepEqual(await b.linkedProcessIds(ours[0].id), [])
    await b.unsave(ours[0].id)
    assert.equal((await repoA.listSaved(20, 0)).total, 1, "B não remove o que A salvou")
  })
})
