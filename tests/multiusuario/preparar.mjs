// Prepara o teste multiusuário: dois escritórios num Supabase de testes (nunca o de produção):
// Alfa (usuários A e B, sócios) e Beta (usuário C). `node tests/multiusuario/preparar.mjs`
import { createClient } from "@supabase/supabase-js"
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PASSWORD = "Rt#2026senha-forte"
const orgs = { alfa: crypto.randomUUID(), beta: crypto.randomUUID() }
for (const [key, id] of Object.entries(orgs)) {
  const { error } = await admin.from("organizations").insert({
    id,
    name: key === "alfa" ? "Escritório Alfa" : "Escritório Beta",
    plan: "Profissional",
    status: "active",
    approved_at: new Date().toISOString(),
  })
  if (error) throw error
}
const people = [
  ["a@alfa.test", "Ana Alfa", "owner", "alfa"],
  ["b@alfa.test", "Bruno Alfa", "owner", "alfa"],
  ["c@beta.test", "Carla Beta", "owner", "beta"],
]
for (const [email, name, role, org] of people) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name } })
  if (error) throw error
  const { error: e2 } = await admin.from("profiles").insert({ id: data.user.id, organization_id: orgs[org], role, name, email, active: true })
  if (e2) throw e2
  console.log(email, org, data.user.id)
}
console.log(JSON.stringify(orgs))
