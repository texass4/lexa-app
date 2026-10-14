/**
 * Íntegra IA de ponta a ponta: o texto que a rota `/api/ai/chat` entrega ao navegador
 * não tem marcador interno — com a aplicação de verdade, o Supabase de verdade, a sessão
 * de uma pessoa e o modelo reserva. Só o Gemini é falso (`fake-gemini.mjs`), para a
 * resposta conter de propósito os marcadores vistos nas telas.
 *
 *   # servidor de teste (mesmo Supabase), com o Gemini falso:
 *   GEMINI_API_KEY=teste AI_MODEL=gemini-principal-teste AI_MODEL_LIGHT=gemini-reserva-teste \
 *   FAKE_GEMINI_FAIL_MODEL=gemini-principal-teste JURISPRUDENCIA_FONTES=stj \
 *   NODE_OPTIONS="--import ./tests/integration/fake-gemini.mjs" npx next start -p 3100
 *
 *   IA_E2E_BASE_URL=http://localhost:3100 SUPABASE_URL=… SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
 *
 * Cria um escritório e uma pessoa FICTÍCIOS e apaga tudo no fim.
 */

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const BASE = process.env.IA_E2E_BASE_URL?.replace(/\/$/, "")
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skip = !BASE || !URL || !ANON || !SERVICE ? "defina IA_E2E_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (e rode o app com fake-gemini.mjs)" : false

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = `Teste-${run}-senha!`
const ORG = crypto.randomUUID()
const EMAIL = `ia-marcadores-${run}@teste.local`
let admin: SupabaseClient
let userId = ""
let cookie = ""

function assertClean(text: string, where: string) {
  assert.ok(!/\[[\p{Ll}\d]*_/u.test(text), `${where}: colchete com identificador → ${text}`)
  assert.ok(!/\p{Ll}_\p{Ll}/u.test(text), `${where}: identificador com sublinhado → ${text}`)
  assert.ok(!/lexa/i.test(text), `${where}: nome antigo → ${text}`)
}

async function ask(messages: { role: "user" | "assistant"; content: string }[], mode: string) {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE!, Cookie: cookie },
    body: JSON.stringify({ scope: { type: "office" }, messages, mode }),
  })
  const body = (await res.json()) as { data?: { text: string }; error?: unknown }
  assert.equal(res.status, 200, JSON.stringify(body))
  return body.data!.text
}

describe("Íntegra IA de ponta a ponta: nenhum marcador interno chega ao navegador", { skip }, () => {
  before(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    const { error } = await admin.from("organizations").insert({ id: ORG, name: `Teste IA ${run}`, status: "active" })
    if (error) throw error
    const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id
    const profile = await admin.from("profiles").insert({ id: userId, organization_id: ORG, role: "owner", name: "Pessoa Fictícia", email: EMAIL })
    if (profile.error) throw profile.error
    const jar = new Map<string, string>()
    const client = createServerClient(URL!, ANON!, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    })
    const signIn = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (signIn.error) throw signIn.error
    cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
  })

  after(async () => {
    if (!admin) return
    await admin.from("usage_events").delete().eq("organization_id", ORG)
    await admin.from("organizations").delete().eq("id", ORG)
    if (userId) await admin.auth.admin.deleteUser(userId)
  })

  for (const mode of ["all", "office", "jurisprudence"]) {
    it(`modo ${mode}: resposta do modelo reserva chega limpa, com CNJ, data, tribunal e citação preservados`, async () => {
      const text = await ask([{ role: "user", content: "Como está o cliente Maria? Há jurisprudência sobre negativação indevida?" }], mode)
      assertClean(text, mode)
      assert.match(text, /0000832-35\.2018\.4\.01\.3202 \(TRF1\)/)
      assert.match(text, /05\/02\/2018/)
      assert.match(text, /art\. 186 do Código Civil e a Súmula 385\/STJ/)
      assert.match(text, /\[sic\]/)
      assert.match(text, /métricas calculadas pela Íntegra/)
    })
  }

  it("histórico com mensagem antiga cheia de marcadores: a resposta nova continua limpa", async () => {
    const text = await ask(
      [
        { role: "user", content: "Valores em atraso?" },
        { role: "assistant", content: "Há R$ 3.000 [clientes_com_valores_em_atraso] [metricas_calculadas_pelo_lexa]." },
        { role: "user", content: "E o cliente Maria?" },
      ],
      "all",
    )
    assertClean(text, "histórico")
  })
})
