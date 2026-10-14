// Assinaturas maliciosas: C (Escritório Beta) e um cliente anônimo pedem eventos do Alfa
// (com o filtro do Alfa, sem filtro, nos avisos de exclusão). A RLS não pode entregar nada.
import { createClient } from "@supabase/supabase-js"
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL,
  ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const session = async (email) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: "Rt#2026senha-forte" })
  if (error) throw error
  await c.realtime.setAuth()
  return c
}
const { data: orgs } = await admin.from("organizations").select("id, name")
const alfa = orgs.find((o) => o.name === "Escritório Alfa").id
const C = await session("c@beta.test"),
  B = await session("b@alfa.test"),
  anon = createClient(URL, ANON, { auth: { persistSession: false } })
const got = {}
const sub = (client, name, opts) =>
  new Promise((resolve) => {
    got[name] = []
    client
      .channel(`${name}-${Math.random()}`)
      .on("postgres_changes", opts, (p) => got[name].push(p))
      .subscribe((s) => s === "SUBSCRIBED" && resolve())
  })
await Promise.all([
  sub(C, "C: clientes com filtro do Alfa", { event: "*", schema: "public", table: "clients", filter: `organization_id=eq.${alfa}` }),
  sub(C, "C: clientes sem filtro", { event: "*", schema: "public", table: "clients" }),
  sub(C, "C: avisos de exclusão sem filtro", { event: "*", schema: "public", table: "realtime_deletions" }),
  sub(C, "C: lançamentos sem filtro", { event: "*", schema: "public", table: "invoices" }),
  sub(anon, "anônimo: clientes", { event: "*", schema: "public", table: "clients" }),
  sub(anon, "anônimo: avisos de exclusão", { event: "*", schema: "public", table: "realtime_deletions" }),
  sub(B, "B (Alfa): clientes", { event: "*", schema: "public", table: "clients", filter: `organization_id=eq.${alfa}` }),
  sub(B, "B (Alfa): avisos de exclusão", { event: "INSERT", schema: "public", table: "realtime_deletions", filter: `organization_id=eq.${alfa}` }),
])
await wait(5000)
const id = `rt-rls-${Date.now()}`,
  now = new Date().toISOString().slice(0, 19)
const data = (name) => ({
  id,
  organizationId: alfa,
  name,
  kind: "PF",
  document: "",
  status: "contato",
  area: "Cível",
  createdAt: now,
  clientSince: now.slice(0, 10),
})
let r = await admin.from("clients").insert({ organization_id: alfa, id, data: data("RT Segredo do Alfa") })
if (r.error) throw r.error
await wait(2000)
r = await admin
  .from("clients")
  .update({ data: data("RT Segredo do Alfa 2") })
  .eq("id", id)
  .eq("organization_id", alfa)
if (r.error) throw r.error
await wait(2000)
r = await admin.from("clients").delete().eq("id", id).eq("organization_id", alfa)
if (r.error) throw r.error
await wait(4000)
let leak = 0
for (const [k, v] of Object.entries(got)) {
  const withData = v.filter((p) => Object.keys(p.new ?? {}).length || Object.keys(p.old ?? {}).length)
  console.log(k.padEnd(36), v.map((p) => p.eventType + (p.errors ? `(${p.errors})` : "")).join(", ") || "nada")
  if (!k.startsWith("B ")) leak += withData.length + v.filter((p) => !p.errors).length
}
const b = got["B (Alfa): clientes"].map((p) => p.eventType),
  bDel = got["B (Alfa): avisos de exclusão"]
const ok = leak === 0 && b.includes("INSERT") && b.includes("UPDATE") && bDel.some((p) => p.new.record_id === id && p.new.collection === "clients")
console.log(
  ok
    ? "OK  [Isolamento] nenhuma assinatura de fora do Alfa recebe dado ou evento; B recebe inserção, alteração e o aviso de exclusão"
    : `FALHOU [Isolamento] vazamento: ${leak}`,
)
process.exit(0)
