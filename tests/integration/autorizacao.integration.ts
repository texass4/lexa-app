/**
 * Autorização no servidor e isolamento entre escritórios, pela API de verdade (aplicação
 * rodando + Supabase). Não roda no `npm test`:
 *
 *   AUTHZ_E2E_BASE_URL=http://localhost:3000 SUPABASE_URL=… SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
 *
 * A aplicação precisa apontar para o MESMO Supabase. Cria dois escritórios FICTÍCIOS,
 * pessoas de teste e um usuário criado direto no Auth (sem perfil, como um cadastro feito
 * fora da Íntegra); apaga tudo no fim. A service role só monta e limpa o cenário — cada
 * chamada testada usa o cookie de sessão da pessoa, como o navegador.
 */

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const BASE = process.env.AUTHZ_E2E_BASE_URL?.replace(/\/$/, "")
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skip = !BASE || !URL || !ANON || !SERVICE ? "defina AUTHZ_E2E_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY" : false

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = `Teste-${run}-senha!`
const orgs = { a: crypto.randomUUID(), b: crypto.randomUUID() }
const userIds: string[] = []
let admin: SupabaseClient

async function createUser(email: string, profile?: { org: string; role: "owner" | "staff" }) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  userIds.push(data.user.id)
  if (profile) {
    const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, organization_id: profile.org, role: profile.role, name: email, email })
    if (profileError) throw profileError
  }
  return data.user.id
}

/** Entra como a pessoa e devolve o cabeçalho Cookie que a aplicação espera (formato do @supabase/ssr). */
async function cookieFor(email: string) {
  const jar = new Map<string, string>()
  const client = createServerClient(URL!, ANON!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
}

async function call(path: string, init: { method?: string; cookie?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: init.origin ?? BASE! }
  if (init.cookie) headers.Cookie = init.cookie
  const res = await fetch(`${BASE}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: "manual" })
  return res.status
}

describe("autorização no servidor e isolamento entre escritórios", { skip }, () => {
  const ids: Record<string, string> = {}
  const cookies: Record<string, string> = {}

  before(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    const { error } = await admin.from("organizations").insert([
      { id: orgs.a, name: `Teste Autorização A ${run}`, status: "active" },
      { id: orgs.b, name: `Teste Autorização B ${run}`, status: "active" },
    ])
    if (error) throw error
    ids.ownerA = await createUser(`dono-a-${run}@teste.local`, { org: orgs.a, role: "owner" })
    ids.staffA = await createUser(`equipe-a-${run}@teste.local`, { org: orgs.a, role: "staff" })
    ids.ownerB = await createUser(`dono-b-${run}@teste.local`, { org: orgs.b, role: "owner" })
    ids.raw = await createUser(`sem-perfil-${run}@teste.local`)
    // Processo FICTÍCIO do escritório B.
    const { error: processError } = await admin.from("processes").insert({
      organization_id: orgs.b,
      id: `p_authz_${run}`,
      data: { id: `p_authz_${run}`, organizationId: orgs.b, number: "0000000-00.0000.0.00.0000", movements: [] },
    })
    if (processError) throw processError
    for (const [key, email] of [
      ["ownerA", `dono-a-${run}@teste.local`],
      ["staffA", `equipe-a-${run}@teste.local`],
      ["raw", `sem-perfil-${run}@teste.local`],
    ] as const) {
      cookies[key] = await cookieFor(email)
    }
  })

  after(async () => {
    if (!admin) return
    await admin.from("processes").delete().eq("id", `p_authz_${run}`)
    await admin.from("organizations").delete().in("id", [orgs.a, orgs.b])
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  })

  const ADMIN_ROUTES = ["/api/admin/overview", "/api/admin/organizations", "/api/admin/users", "/api/admin/audit", "/api/admin/settings", "/api/admin/ai-usage", "/api/admin/finance"]

  it("rotas administrativas: sem sessão 401; membro de escritório (até o dono) 403", async () => {
    for (const path of ADMIN_ROUTES) {
      assert.equal(await call(path), 401, `${path} sem sessão`)
      assert.equal(await call(path, { cookie: cookies.ownerA }), 403, `${path} como dono de escritório`)
    }
  })

  it("alteração administrativa vinda de outro site é recusada antes de tudo (origem)", async () => {
    assert.equal(await call("/api/admin/organizations", { method: "POST", cookie: cookies.ownerA, origin: "https://site-malicioso.example", body: { name: "x" } }), 403)
  })

  it("usuário criado fora da Íntegra (sem perfil) não acessa nada do escritório", async () => {
    for (const path of ["/api/team/users", "/api/ai/usage", "/api/processes/monitoring", "/api/jurisprudence/saved"]) {
      const status = await call(path, { cookie: cookies.raw })
      assert.ok(status === 401 || status === 403, `${path} → ${status}`)
    }
  })

  it("equipe sem 'users.manage' não promove a si mesma nem a outros", async () => {
    const status = await call(`/api/team/users/${ids.staffA}`, { method: "PATCH", cookie: cookies.staffA, body: { role: "owner" } })
    assert.equal(status, 403)
    const { data } = await admin.from("profiles").select("role").eq("id", ids.staffA).single()
    assert.equal(data?.role, "staff")
  })

  it("dono do escritório A não altera nem remove pessoa do escritório B (troca de id)", async () => {
    const patch = await call(`/api/team/users/${ids.ownerB}`, { method: "PATCH", cookie: cookies.ownerA, body: { active: false } })
    assert.ok(patch >= 400, `PATCH devolveu ${patch}`)
    const del = await call(`/api/team/users/${ids.ownerB}`, { method: "DELETE", cookie: cookies.ownerA })
    assert.ok(del >= 400, `DELETE devolveu ${del}`)
    const { data } = await admin.from("profiles").select("active, organization_id").eq("id", ids.ownerB).single()
    assert.equal(data?.active, true)
    assert.equal(data?.organization_id, orgs.b)
  })

  it("processo do escritório B não é lido pela consulta processual do escritório A", async () => {
    assert.equal(await call(`/api/process-enrichment?processId=p_authz_${run}`, { cookie: cookies.ownerA }), 200, "a rota responde")
    const res = await fetch(`${BASE}/api/process-enrichment?processId=p_authz_${run}`, { headers: { Cookie: cookies.ownerA } })
    assert.deepEqual(await res.json(), { run: null }, "nenhuma execução de outro escritório")
    const start = await call("/api/process-enrichment", { method: "POST", cookie: cookies.ownerA, body: { processId: `p_authz_${run}` } })
    assert.equal(start, 404, "o processo de outro escritório é tratado como inexistente")
  })
})
