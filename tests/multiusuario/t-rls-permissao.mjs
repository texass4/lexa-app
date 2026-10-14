// Avisos de exclusão respeitam a permissão da coleção: estagiário (sem finance.view) não fica sabendo de lançamento excluído.
import { createClient } from "@supabase/supabase-js"
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL,
  ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const { data: orgs } = await admin.from("organizations").select("id, name")
const alfa = orgs.find((o) => o.name === "Escritório Alfa").id
let { data: prof } = await admin.from("profiles").select("id").eq("email", "e@alfa.test").maybeSingle()
if (!prof) {
  const { data, error } = await admin.auth.admin.createUser({ email: "e@alfa.test", password: "Rt#2026senha-forte", email_confirm: true })
  if (error) throw error
  await admin
    .from("profiles")
    .insert({ id: data.user.id, organization_id: alfa, role: "staff", name: "Estagiário Alfa", email: "e@alfa.test", active: true })
}
const E = createClient(URL, ANON, { auth: { persistSession: false } })
await E.auth.signInWithPassword({ email: "e@alfa.test", password: "Rt#2026senha-forte" })
await E.realtime.setAuth()
const got = { avisos: [], lancamentos: [] }
await Promise.all([
  new Promise((res) =>
    E.channel("e1")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "realtime_deletions", filter: `organization_id=eq.${alfa}` }, (p) =>
        got.avisos.push(p.new),
      )
      .subscribe((s) => s === "SUBSCRIBED" && res()),
  ),
  new Promise((res) =>
    E.channel("e2")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `organization_id=eq.${alfa}` }, (p) =>
        got.lancamentos.push(p),
      )
      .subscribe((s) => s === "SUBSCRIBED" && res()),
  ),
])
await wait(5000)
const now = new Date().toISOString().slice(0, 19),
  inv = `rt-inv-${Date.now()}`,
  cli = `rt-cli-${Date.now()}`
const { data: client } = await admin.from("clients").select("id").eq("organization_id", alfa).neq("data->>document", "").limit(1).single()
let r = await admin.from("invoices").insert({
  organization_id: alfa,
  id: inv,
  data: {
    id: inv,
    organizationId: alfa,
    clientId: client.id,
    description: "RT secreto",
    amount: 1,
    dueDate: now.slice(0, 10),
    status: "pendente",
    createdAt: now,
  },
})
if (r.error) throw r.error
r = await admin.from("clients").insert({
  organization_id: alfa,
  id: cli,
  data: {
    id: cli,
    organizationId: alfa,
    name: "RT temp",
    kind: "PF",
    document: "",
    status: "contato",
    area: "Cível",
    createdAt: now,
    clientSince: now.slice(0, 10),
  },
})
if (r.error) throw r.error
await wait(1500)
await admin.from("invoices").delete().eq("id", inv).eq("organization_id", alfa)
await admin.from("clients").delete().eq("id", cli).eq("organization_id", alfa)
await wait(4000)
const cols = got.avisos.map((a) => a.collection)
console.log("estagiário recebeu avisos de:", cols.join(", ") || "nada", "| eventos de lançamentos:", got.lancamentos.length)
console.log(
  cols.includes("clients") && !cols.includes("invoices") && got.lancamentos.length === 0
    ? "OK  [Permissão] estagiário recebe o aviso do cliente excluído, não o do lançamento (nem eventos de lançamentos)"
    : "FALHOU [Permissão]",
)
process.exit(0)
