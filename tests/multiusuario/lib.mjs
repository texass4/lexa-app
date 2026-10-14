// Teste real com dois usuários do mesmo escritório (A e B) e um de outro escritório (C),
// em navegadores independentes, contra um Supabase de verdade (Auth, PostgREST, Realtime,
// Storage). Ver docs/TESTES_MULTIUSUARIO.md — nada aqui é simulado.
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
/** Pasta das fotos e do relatório (`RT_OUT`). */
export const DIR = process.env.RT_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), "integra-multiusuario-"))
export const APP = process.env.RT_APP_URL ?? "http://localhost:3100"
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
export const PASSWORD = "Rt#2026senha-forte"
export const results = []
export const RUN = Date.now().toString(36).slice(-4)

export function cpf(n) {
  const d = String(100000000 + n)
    .slice(0, 9)
    .split("")
    .map(Number)
  for (const len of [9, 10]) {
    let s = 0
    for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i)
    const r = (s * 10) % 11
    d.push(r === 10 ? 0 : r)
  }
  const x = d.join("")
  return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`
}
export function cnj(seq) {
  const n = String(seq).padStart(7, "0"),
    year = "2026",
    j = "8",
    tr = "24",
    o = "0001"
  const dd = 98n - (BigInt(`${n}${year}${j}${tr}${o}00`) % 97n)
  return `${n}-${String(dd).padStart(2, "0")}.${year}.${j}.${tr}.${o}`
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
export async function login(email, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  const user = { label, email, page, frames: [], errors: [], toasts: [] }
  page.on("pageerror", (e) => {
    user.errors.push(e.message)
    user.stacks = [...(user.stacks ?? []), `${new Date().toISOString()} ${e.stack}`]
  })
  page.on("console", (m) => {
    if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) user.errors.push(m.text().slice(0, 200))
  })
  // Só eventos de dados do Realtime (não as confirmações de assinatura).
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      if (typeof f.payload !== "string" || !f.payload.includes('"postgres_changes",{"data"')) return
      try {
        const [, , topic, , body] = JSON.parse(f.payload)
        const rec = body.data.record ?? {},
          old = body.data.old_record ?? {}
        user.frames.push({
          t: Date.now(),
          topic,
          table: body.data.table,
          type: body.data.type,
          org: rec.organization_id ?? old.organization_id,
          id: rec.id ?? old.id,
          payload: f.payload,
        })
      } catch {}
    }),
  )
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" })
  await page.fill("input[type=email]", email)
  await page.fill("input[type=password]", PASSWORD)
  await page.click("button[type=submit]")
  await page.waitForURL("**/dashboard", { timeout: 60000 })
  await page.waitForTimeout(2500)
  // Marca a página: se ela recarregar, a marca some (prova de que não houve refresh).
  await page.evaluate((m) => {
    window.__rtMark = m
  }, `${label}-${Date.now()}`)
  user.mark = await page.evaluate(() => window.__rtMark)
  // Avisos (toasts) que aparecem na tela.
  await page.exposeFunction("__rtToast", (t) => user.toasts.push({ t: Date.now(), text: t }))
  await page.evaluate(() =>
    new MutationObserver(() =>
      document.querySelectorAll("[data-sonner-toast]").forEach((n) => {
        if (!n.__seen) {
          n.__seen = true
          window.__rtToast(n.textContent)
        }
      }),
    ).observe(document.body, { childList: true, subtree: true }),
  )
  return user
}
export async function go(user, href) {
  await user.page.evaluate((h) => window.next.router.push(h), href)
  await user.page.waitForURL(`**${href.split("?")[0]}*`)
  await user.page.waitForFunction(() => !document.querySelector("main [data-slot=skeleton]"), null, { timeout: 20000 }).catch(() => {})
  await user.page.waitForTimeout(600)
}
export const noReload = async (user) => (await user.page.evaluate(() => window.__rtMark).catch(() => null)) === user.mark
export async function count(user, text) {
  return user.page.locator("main").getByText(text, { exact: true }).locator("visible=true").count()
}
/** Espera até `text` aparecer `n` vezes (ou sumir, n = 0) na tela; devolve ms. */
export async function waitCount(user, text, n, timeout = 10000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    if ((await count(user, text)) === n) return Date.now() - t
    await user.page.waitForTimeout(100)
  }
  return -1
}
export async function waitToast(user, re, since, timeout = 8000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    const hit = user.toasts.find((x) => x.t >= since && re.test(x.text))
    if (hit) return hit.text
    await user.page.waitForTimeout(100)
  }
  return null
}
export function check(area, test, ok, detail = "") {
  results.push({ area, test, ok: !!ok, detail })
  console.log(`${ok ? "OK " : "FALHOU"} [${area}] ${test}${detail ? ` — ${detail}` : ""}`)
}
export const dialog = (user) => user.page.locator("[role=dialog]").last()
export async function clickDialog(user, name) {
  await dialog(user).getByRole("button", { name }).click()
}
export async function confirm(user, name = /^Excluir/) {
  await user.page.locator("[role=alertdialog], [role=dialog]").last().getByRole("button", { name }).last().click()
}
export async function shot(user, name) {
  await user.page.screenshot({ path: `${DIR}/${name}.png` }).catch(() => {})
}
export async function dbOne(table, field, value) {
  const { data, error } = await admin.from(table).select("id, data, updated_at, organization_id").eq(`data->>${field}`, value)
  if (error) throw error
  return data
}
export function save(name) {
  fs.writeFileSync(`${DIR}/${name}.json`, JSON.stringify(results, null, 1))
}
export async function close() {
  await browser.close()
}
/** Executa um teste; uma falha não interrompe os seguintes (registra e tira foto). */
export async function step(area, name, fn, users = []) {
  try {
    await fn()
  } catch (error) {
    check(area, name, false, `erro do roteiro: ${String(error.message).split("\n")[0].slice(0, 160)}`)
    for (const u of users) await shot(u, `falha-${area}-${name}`.replace(/[^\w-]+/g, "_").slice(0, 80) + `-${u.label}`)
    for (const u of users) await u.page.keyboard.press("Escape").catch(() => {})
  }
}
export async function countText(user, text) {
  return user.page.locator("main").getByText(text).locator("visible=true").count()
}
export async function waitText(user, text, n, timeout = 10000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    if ((await countText(user, text)) === n) return Date.now() - t
    await user.page.waitForTimeout(100)
  }
  return -1
}
export const today = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export async function userId(email) {
  const { data } = await admin.from("profiles").select("id").eq("email", email).single()
  return data.id
}
