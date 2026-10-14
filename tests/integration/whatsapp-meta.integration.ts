/**
 * WhatsApp oficial (Cloud API) de ponta a ponta contra a aplicação rodando e um Supabase
 * de verdade:
 *
 *   evento no formato da Meta, assinado com o App Secret → POST /api/whatsapp/meta/webhook
 *   → número → escritório → contato/conversa/mensagem → status → leitura pela sessão (RLS).
 *
 * Os eventos são DADOS DE TESTE no formato documentado da Meta, assinados como a Meta
 * assina (o ambiente de teste não recebe webhooks reais). O código exercitado é o da
 * produção: rota, verificação de assinatura, tradução, serviço e banco.
 * Tudo o que é criado é apagado no fim.
 *
 *   WHATSAPP_E2E_BASE_URL=http://localhost:3000 META_APP_SECRET=… WHATSAPP_WEBHOOK_VERIFY_TOKEN=… \
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
 *
 * (a aplicação precisa estar rodando com os mesmos META_APP_SECRET e WHATSAPP_WEBHOOK_VERIFY_TOKEN.)
 */

import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.WHATSAPP_E2E_BASE_URL?.replace(/\/$/, "")
const SECRET = process.env.META_APP_SECRET
const VERIFY = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
const skip =
  !URL_ || !ANON || !SERVICE || !BASE || !SECRET || !VERIFY
    ? "defina WHATSAPP_E2E_BASE_URL, META_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY"
    : false

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = `Teste-${run}-senha!`
const orgs = { a: crypto.randomUUID(), b: crypto.randomUUID() }
// Ids de número de teste (só dígitos, como os da Meta), únicos por execução.
const seed = Date.now().toString().slice(-9)
const phoneIds = { a: `71${seed}01`, b: `71${seed}02`, unknown: `71${seed}99` }
const CUSTOMER = `55119${seed.slice(-8)}`
const userIds: string[] = []
let admin: SupabaseClient

const event = (phoneNumberId: string, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "900000000000000", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "5511999990001", phone_number_id: phoneNumberId }, ...value } }] }],
})

const inbound = (phoneNumberId: string, id: string, text: string, ts = Math.floor(Date.now() / 1000)) =>
  event(phoneNumberId, {
    contacts: [{ profile: { name: "Cliente de Teste" }, wa_id: CUSTOMER }],
    messages: [{ from: CUSTOMER, id, timestamp: String(ts), type: "text", text: { body: text } }],
  })

async function post(body: unknown, signature: string | null = "valid") {
  const raw = JSON.stringify(body)
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (signature === "valid") headers["x-hub-signature-256"] = `sha256=${createHmac("sha256", SECRET!).update(raw).digest("hex")}`
  else if (signature) headers["x-hub-signature-256"] = signature
  return fetch(`${BASE}/api/whatsapp/meta/webhook`, { method: "POST", headers, body: raw })
}

async function userClient(email: string) {
  const client = createClient(URL_!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

async function createUser(email: string, org: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  userIds.push(data.user.id)
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, organization_id: org, role: "owner", name: email, email })
  if (profileError) throw profileError
}

const messagesOf = async (org: string) =>
  (await admin.from("whatsapp_messages").select("id, body, status, direction, provider_message_id, provider_error_code, error").eq("organization_id", org).order("created_at")).data ?? []

describe("WhatsApp oficial de ponta a ponta (aplicação + Supabase reais)", { skip }, () => {
  before(async () => {
    admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } })
    const { error } = await admin.from("organizations").insert([
      { id: orgs.a, name: `Whats A ${run}`, status: "active" },
      { id: orgs.b, name: `Whats B ${run}`, status: "active" },
    ])
    if (error) throw error
    await createUser(`whats-a-${run}@teste.local`, orgs.a)
    await createUser(`whats-b-${run}@teste.local`, orgs.b)
    // Cliente de A com o MESMO telefone do contato: não pode ser vinculado sozinho.
    const { error: clientError } = await admin.from("clients").insert({ organization_id: orgs.a, id: `cli-${run}`, data: { id: `cli-${run}`, name: "Homônimo", phone: CUSTOMER } })
    if (clientError) throw clientError
    const { error: instanceError } = await admin.from("whatsapp_instances").insert([
      { organization_id: orgs.a, provider: "meta", external_id: phoneIds.a, business_account_id: "900000000000001", status: "connected" },
      { organization_id: orgs.b, provider: "meta", external_id: phoneIds.b, business_account_id: "900000000000002", status: "connected" },
    ])
    if (instanceError) throw instanceError
  })

  after(async () => {
    if (!admin) return
    await admin.from("organizations").delete().in("id", [orgs.a, orgs.b])
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  })

  it("verificação inicial: devolve o challenge só com o token certo", async () => {
    const ok = await fetch(`${BASE}/api/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY!)}&hub.challenge=987654321`)
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), "987654321")
    const bad = await fetch(`${BASE}/api/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=987654321`)
    assert.equal(bad.status, 403)
  })

  it("sem assinatura ou com assinatura errada: recusado e nada gravado", async () => {
    assert.equal((await post(inbound(phoneIds.a, `wamid.${run}.X`, "forjada"), null)).status, 401)
    assert.equal((await post(inbound(phoneIds.a, `wamid.${run}.X`, "forjada"), `sha256=${"0".repeat(64)}`)).status, 401)
    assert.equal((await messagesOf(orgs.a)).length, 0)
  })

  it("mensagem recebida vira contato, conversa e mensagem do escritório do número — sem vincular cliente pelo telefone", async () => {
    const response = await post(inbound(phoneIds.a, `wamid.${run}.1`, "Bom dia, quero falar do meu processo"))
    assert.equal(response.status, 200)
    const messages = await messagesOf(orgs.a)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].body, "Bom dia, quero falar do meu processo")
    assert.equal(messages[0].direction, "inbound")
    const { data: contact } = await admin.from("whatsapp_contacts").select("phone, push_name, client_id").eq("organization_id", orgs.a).single()
    assert.equal(contact?.phone, CUSTOMER)
    assert.equal(contact?.push_name, "Cliente de Teste")
    assert.equal(contact?.client_id, null, "telefone igual ao de um cliente não vincula sozinho")
    const { data: conversation } = await admin.from("whatsapp_conversations").select("unread_count, last_inbound_at, last_message_preview").eq("organization_id", orgs.a).single()
    assert.equal(conversation?.unread_count, 1)
    assert.ok(conversation?.last_inbound_at, "abre a janela de 24 h")
  })

  it("a Meta repete o evento: a mensagem não duplica", async () => {
    assert.equal((await post(inbound(phoneIds.a, `wamid.${run}.1`, "Bom dia, quero falar do meu processo"))).status, 200)
    assert.equal((await messagesOf(orgs.a)).length, 1)
    const { data: conversation } = await admin.from("whatsapp_conversations").select("unread_count").eq("organization_id", orgs.a).single()
    assert.equal(conversation?.unread_count, 1)
  })

  it("o mesmo telefone escrevendo para o número de B entra só em B", async () => {
    assert.equal((await post(inbound(phoneIds.b, `wamid.${run}.B1`, "Mensagem para o escritório B"))).status, 200)
    assert.deepEqual((await messagesOf(orgs.b)).map((m) => m.body), ["Mensagem para o escritório B"])
    assert.equal((await messagesOf(orgs.a)).length, 1)
  })

  it("número desconhecido: respondido (para a Meta não insistir) e nada gravado", async () => {
    assert.equal((await post(inbound(phoneIds.unknown, `wamid.${run}.U`, "Para ninguém"))).status, 200)
    const { count } = await admin.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("provider_message_id", `wamid.${run}.U`)
    assert.equal(count, 0)
  })

  it("status de entrega só avança; falha guarda o motivo e o código da Meta", async () => {
    const { data: conversation } = await admin.from("whatsapp_conversations").select("id").eq("organization_id", orgs.a).single()
    const { error } = await admin.from("whatsapp_messages").insert([
      { organization_id: orgs.a, conversation_id: conversation!.id, direction: "outbound", type: "text", body: "Resposta", status: "sent", provider_message_id: `wamid.${run}.OUT` },
      { organization_id: orgs.a, conversation_id: conversation!.id, direction: "outbound", type: "text", body: "Atrasada", status: "sent", provider_message_id: `wamid.${run}.FAIL` },
    ])
    if (error) throw error
    const ts = Math.floor(Date.now() / 1000)
    const status = (id: string, state: string, extra: Record<string, unknown> = {}) => event(phoneIds.a, { statuses: [{ id, status: state, timestamp: String(ts), recipient_id: CUSTOMER, ...extra }] })
    assert.equal((await post(status(`wamid.${run}.OUT`, "read"))).status, 200)
    assert.equal((await post(status(`wamid.${run}.OUT`, "delivered"))).status, 200)
    assert.equal((await post(status(`wamid.${run}.FAIL`, "failed", { errors: [{ code: 131047, title: "Re-engagement message" }] }))).status, 200)
    const byId = Object.fromEntries((await messagesOf(orgs.a)).map((m) => [m.provider_message_id, m]))
    assert.equal(byId[`wamid.${run}.OUT`].status, "read", "lida não volta para entregue")
    assert.equal(byId[`wamid.${run}.FAIL`].status, "failed")
    assert.equal(byId[`wamid.${run}.FAIL`].provider_error_code, "131047")
    assert.match(byId[`wamid.${run}.FAIL`].error ?? "", /24 horas/)
  })

  it("status com o número de B não altera mensagem de A", async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    await post(event(phoneIds.b, { statuses: [{ id: `wamid.${run}.FAIL`, status: "read", timestamp: ts, recipient_id: CUSTOMER }] }))
    const failed = (await messagesOf(orgs.a)).find((m) => m.provider_message_id === `wamid.${run}.FAIL`)
    assert.equal(failed?.status, "failed")
  })

  it("pela sessão (RLS), cada escritório lê só o seu; ninguém lê credenciais", async () => {
    const a = await userClient(`whats-a-${run}@teste.local`)
    const b = await userClient(`whats-b-${run}@teste.local`)
    const { data: seenByA } = await a.from("whatsapp_messages").select("body")
    const { data: seenByB } = await b.from("whatsapp_messages").select("body")
    assert.ok(seenByA?.length && seenByA.every((m) => m.body !== "Mensagem para o escritório B"))
    assert.deepEqual(seenByB?.map((m) => m.body), ["Mensagem para o escritório B"])
    const { error } = await a.from("whatsapp_credentials").select("instance_id")
    assert.ok(error, "credenciais invisíveis para o navegador")
  })
})
