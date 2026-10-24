// Verificação de ponta a ponta dos critérios de aceitação, num navegador de verdade.
//
// Uso: com a Mesa rodando (de preferência sobre um banco vazio),
//   E2E_BASE=http://localhost:3200 E2E_PASSWORD=... npm run test:e2e
// Requer o pacote `playwright` com o Chromium instalado (npx playwright install chromium).
// PLAYWRIGHT_MODULE permite apontar para uma instalação global do Playwright.

import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright")
const BASE = process.env.E2E_BASE ?? "http://localhost:3200"
const PASSWORD = process.env.E2E_PASSWORD
if (!PASSWORD) {
  console.error("Defina E2E_PASSWORD com a senha da Mesa (DESK_PASSWORD).")
  process.exit(1)
}

const results = []
const errors = []
async function scenario(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split("\n")[0]}`)
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message)
}

const stamp = Date.now().toString(36)
const T = (s) => `${s} ${stamp}`
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Sao_Paulo", locale: "pt-BR" })
const page = await context.newPage()
page.on("pageerror", (e) => errors.push(String(e)))
const saved = (p = page) => p.waitForSelector("[role=status]:has-text('Salvo')", { timeout: 20000 })
const go = (path, p = page) => p.goto(BASE + path, { waitUntil: "networkidle" })

console.log(`Mesa · verificação de ponta a ponta em ${BASE}\n`)

await scenario("0. Login protege as telas e entra com a senha", async () => {
  const anon = await browser.newContext()
  const res = await anon.request.get(BASE + "/api/search?q=x")
  expect(res.status() === 401, `API sem sessão devolveu ${res.status()}`)
  await anon.close()
  await go("/tasks")
  expect(page.url().includes("/login"), "sem sessão deveria ir para o login")
  await page.fill("input[name=password]", PASSWORD)
  await page.click("button[type=submit]")
  await page.waitForURL((u) => u.pathname === "/tasks")
})

let taskId
await scenario("1. Criar uma tarefa, recarregar e ela continua salva", async () => {
  await go("/tasks")
  await page.keyboard.press("n")
  await page.fill("#qt-title", T("Gravar os vocais"))
  await page.click("form button:has-text('Hoje')")
  await page.click("button:has-text('Criar tarefa')")
  await page.waitForSelector("#qt-title", { state: "detached" })
  await page.reload({ waitUntil: "networkidle" })
  const link = page.locator(`a:has-text("${T("Gravar os vocais")}")`).first()
  await link.waitFor()
  taskId = (await link.getAttribute("href")).split("/").pop()
})

await scenario("2. Editar e concluir a tarefa; as visualizações refletem", async () => {
  await go(`/tasks/${taskId}`)
  await page.selectOption("select >> nth=0", "high")
  await saved()
  await page.click("[role=radiogroup][aria-label=Status] >> text=Concluída")
  await saved()
  await go("/tasks?view=today")
  expect(await page.locator(`li:has-text("${T("Gravar os vocais")}") [aria-checked=true]`).count() === 1, "Hoje deveria mostrar a tarefa concluída")
  await go("/tasks")
  expect((await page.locator(`a:has-text("${T("Gravar os vocais")}")`).count()) === 0, "Lista de abertas não deveria mostrá-la")
  await go("/tasks?view=board")
  const doneColumn = page.locator("section[aria-label='Concluída']")
  expect((await doneColumn.locator(`text=${T("Gravar os vocais")}`).count()) === 1, "Kanban deveria mostrá-la em Concluída")
  // Reabrir pelo próprio círculo e conferir que a conclusão some.
  await go(`/tasks/${taskId}`)
  await page.click("[role=radiogroup][aria-label=Status] >> text=A fazer")
  await saved()
  await page.reload({ waitUntil: "networkidle" })
  expect((await page.locator("dt:has-text('Concluída')").count()) === 0, "a data de conclusão deveria sumir ao reabrir")
})

let projectId
await scenario("3. Criar projeto, associar tarefas e ver o progresso", async () => {
  await go("/projects?new=1")
  await page.fill("input[aria-label=Nome]", T("Disco novo"))
  await page.click("button:has-text('Criar projeto')")
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/)
  projectId = page.url().split("/").pop()
  expect((await page.locator("text=Sem tarefas").count()) >= 1, "sem tarefas deveria mostrar 'Sem tarefas'")
  for (const title of ["Compor a letra", "Arranjar"]) {
    await page.click("button:has-text('Tarefa') >> nth=0")
    await page.fill("#qt-title", T(title))
    await page.click("button:has-text('Criar tarefa')")
    await page.waitForSelector("#qt-title", { state: "detached" })
  }
  await page.waitForSelector(`text=${T("Arranjar")}`)
  await page.locator(`li:has-text("${T("Compor a letra")}") [role=checkbox]`).click()
  await page.waitForSelector("[role=progressbar][aria-valuenow='50']", { timeout: 10000 })
})

let pageId
await scenario("4/6. Criar página com blocos e referência a um registro real", async () => {
  await go("/pages")
  await page.click("button:has-text('Nova página')")
  await page.waitForURL(/\/pages\/[0-9a-f-]{36}$/)
  pageId = page.url().split("/").pop()
  await page.fill("textarea[aria-label='Título da página']", T("Produção musical"))
  await page.locator(".prose-mesa").click()
  await page.keyboard.type("/título")
  await page.waitForSelector("[role=option]")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Roteiro")
  await page.keyboard.press("Enter")
  await page.keyboard.type("- Ensaiar")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
  await page.keyboard.type("[] Afinar")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
  await page.keyboard.type(`Próximo: @${stamp}`)
  await page.waitForSelector(`[role=option]:has-text("${T("Gravar os vocais")}")`, { timeout: 15000 })
  await page.click(`[role=option]:has-text("${T("Gravar os vocais")}")`)
  await saved()
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForSelector(".prose-mesa h1:has-text('Roteiro')")
  expect((await page.locator(".prose-mesa ul li:has-text('Ensaiar')").count()) === 1, "lista não persistiu")
  expect((await page.locator(".prose-mesa ul[data-type=taskList] li:has-text('Afinar')").count()) === 1, "checklist não persistiu")
  expect((await page.locator(`.prose-mesa [data-ref-type=task]:has-text("${T("Gravar os vocais")}")`).count()) === 1, "referência não persistiu")
  await go(`/tasks/${taskId}`)
  expect((await page.locator(`aside a:has-text("${T("Produção musical")}")`).count()) === 1, "a tarefa deveria listar a página em 'Mencionado em'")
})

await scenario("5. Criar entrada no diário e recuperá-la pela data", async () => {
  await go("/journal/2026-03-14")
  await page.locator(".prose-mesa").click()
  await page.keyboard.type(T("Dia de estúdio."))
  await saved()
  await go("/journal/2026-03-15")
  await go("/journal/2026-03-14")
  expect((await page.locator(".prose-mesa").innerText()).includes(T("Dia de estúdio.")), "conteúdo do dia não voltou")
})

let boardUrl
await scenario("7/8. Criar quadro, desenhar elementos, conectar e vincular a tarefa", async () => {
  await go("/canvas")
  await page.click("button:has-text('Novo quadro')")
  await page.waitForURL(/\/canvas\/[0-9a-f-]{36}$/)
  boardUrl = new URL(page.url()).pathname
  await page.waitForSelector(".react-flow__pane")
  await page.fill("input[aria-label='Nome do quadro']", T("Fluxo do disco"))
  await page.keyboard.press("Enter")
  await page.click("button[aria-label^='Cartão']")
  await page.mouse.click(520, 360)
  await page.keyboard.type("Produção musical")
  await page.mouse.click(1100, 640)
  await page.keyboard.press("r")
  await page.mouse.click(900, 640)
  await page.keyboard.press("Escape")
  await page.keyboard.press("s")
  await page.mouse.click(520, 620)
  await page.keyboard.type("Ideia")
  await page.mouse.click(1150, 200)
  await page.click("button[aria-label^='Registro']")
  await page.fill("input[aria-label='Buscar registro']", T("Gravar os vocais"))
  await page.waitForSelector(`[role=option]:has-text("${T("Gravar os vocais")}")`)
  await page.click(`[role=option]:has-text("${T("Gravar os vocais")}") >> nth=0`)
  await page.waitForSelector(".react-flow__node-record")
  const card = page.locator(".react-flow__node-card")
  const rec = page.locator(".react-flow__node-record")
  await card.hover()
  const hb = await card.locator(".react-flow__handle-right").boundingBox()
  const rb = await rec.boundingBox()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(rb.x + 20, rb.y + rb.height / 2, { steps: 12 })
  await page.mouse.move(rb.x + 8, rb.y + rb.height / 2, { steps: 4 })
  await page.mouse.up()
  expect((await page.locator(".react-flow__edge").count()) === 1, "conexão não criada")
  await page.locator(".react-flow__edge").first().click({ force: true })
  await page.fill("input[aria-label='Rótulo da conexão'] >> nth=0", "depois")
  await page.keyboard.press("Enter")
  await saved()
  const kinds = await page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith("react-flow__node-"))))
  expect(kinds.length === 4, `esperava 4 elementos (cartão, forma, nota, registro), há: ${kinds.join(", ")}`)
})

await scenario("10. Reabrir o quadro: posições, conexões e zoom preservados", async () => {
  await page.click("button[aria-label='Aumentar zoom']")
  await page.waitForTimeout(400)
  await saved()
  const before = await page.locator(".react-flow__viewport").getAttribute("style")
  const recBefore = await page.locator(".react-flow__node-record").getAttribute("style")
  await go(boardUrl)
  await page.waitForSelector(".react-flow__node-record")
  expect((await page.locator(".react-flow__viewport").getAttribute("style")) === before, "zoom/posição da câmera mudou")
  expect((await page.locator(".react-flow__node-record").getAttribute("style")) === recBefore, "posição do elemento mudou")
  expect((await page.locator(".react-flow__edge").count()) === 1 && (await page.locator(".react-flow__edgelabel-renderer >> text=depois").count()) === 1, "conexão/rótulo não voltaram")
})

await scenario("11. Mover o elemento vinculado não altera o status da tarefa", async () => {
  const rec = page.locator(".react-flow__node-record")
  const b = await rec.boundingBox()
  await page.mouse.move(b.x + 120, b.y + 60)
  await page.mouse.down()
  await page.mouse.move(b.x + 320, b.y + 200, { steps: 12 })
  await page.mouse.up()
  await saved()
  await go(`/tasks/${taskId}`)
  const status = await page.locator("[role=radiogroup][aria-label=Status] [aria-checked=true]").innerText()
  expect(status === "A fazer", `status mudou para ${status}`)
})

await scenario("9. Alterar título e status da tarefa aparece no canvas", async () => {
  const title = page.locator("textarea[aria-label='Título da tarefa']")
  await title.fill(T("Gravar vocais e coros"))
  await title.press("Enter")
  await saved()
  await page.click("[role=radiogroup][aria-label=Status] >> text=Em andamento")
  await saved()
  await go(boardUrl)
  const text = await page.locator(".react-flow__node-record").innerText()
  expect(text.includes(T("Gravar vocais e coros")) && text.includes("Em andamento"), `canvas mostra: ${text.replace(/\n/g, " ")}`)
})

await scenario("Referência excluída aparece como indisponível, com opção de corrigir", async () => {
  await go("/tasks")
  await page.keyboard.press("n")
  await page.fill("#qt-title", T("Temporária"))
  await page.click("button:has-text('Criar tarefa')")
  await page.waitForSelector("#qt-title", { state: "detached" })
  await go(boardUrl)
  await page.keyboard.press("l")
  await page.fill("input[aria-label='Buscar registro']", T("Temporária"))
  await page.click(`[role=option]:has-text("${T("Temporária")}") >> nth=0`)
  await page.waitForSelector(`.react-flow__node-record:has-text("${T("Temporária")}")`)
  await saved()
  const href = await page.locator(`.react-flow__node-record:has-text("${T("Temporária")}") a[aria-label^='Abrir']`).getAttribute("href")
  await go(href)
  await page.click("button:has-text('Excluir')")
  await page.click("[role=alertdialog] button:has-text('Excluir')")
  await page.waitForURL((u) => u.pathname === "/tasks")
  await go(boardUrl)
  await page.waitForSelector(".react-flow__node-record:has-text('Referência indisponível')")
  expect((await page.locator(".react-flow__node-record button:has-text('Vincular')").count()) === 1, "falta a opção de vincular de novo")
})

await scenario("12. Busca global encontra registros e abre o resultado", async () => {
  await go("/")
  await page.keyboard.press("Control+k")
  await page.keyboard.type(stamp)
  await page.waitForSelector(`[cmdk-item]:has-text("${T("Produção musical")}")`, { timeout: 15000 })
  for (const label of ["Tarefas", "Projetos", "Páginas", "Diário", "Quadros"]) {
    expect((await page.locator(`[cmdk-group-heading]:has-text("${label}")`).count()) >= 1, `grupo ${label} ausente`)
  }
  await page.click(`[cmdk-group]:has([cmdk-group-heading]:text-is("Páginas")) [cmdk-item]:has-text("${T("Produção musical")}")`)
  await page.waitForURL((u) => u.pathname === `/pages/${pageId}`)
})

await scenario("Caixa de entrada: capturar e converter em tarefa sem duplicar", async () => {
  await go("/inbox")
  await page.fill("textarea[aria-label='Nova captura']", T("Ligar para o técnico"))
  await page.keyboard.press("Enter")
  const item = page.locator(`li:has-text("${T("Ligar para o técnico")}")`)
  await item.waitFor()
  await item.locator("button:has-text('Tarefa')").click()
  await item.waitFor({ state: "detached" })
  await go("/inbox?show=processed")
  expect((await page.locator(`li:has-text("${T("Ligar para o técnico")}") >> text=virou tarefa`).count()) === 1, "item convertido não registrou a tarefa criada")
})

await scenario("Exportação JSON e Markdown", async () => {
  const json = await context.request.get(BASE + "/api/export/json")
  expect(json.ok() && (await json.json()).format === "mesa-export", "JSON inválido")
  const zip = await context.request.get(BASE + "/api/export/markdown")
  expect(zip.ok() && (await zip.body()).subarray(0, 2).toString() === "PK", "zip inválido")
})

await scenario("Kanban: arrastar para outra coluna persiste", async () => {
  await go("/tasks?view=board")
  const card = page.locator("section[aria-label='A fazer'] [aria-roledescription='Cartão arrastável']").first()
  const title = await card.locator("a").innerText()
  const a = await card.boundingBox()
  const b = await page.locator("section[aria-label='Em andamento'] > div").first().boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.reload({ waitUntil: "networkidle" })
  expect((await page.locator(`section[aria-label='Em andamento'] >> text=${title}`).count()) === 1, "a mudança de coluna não persistiu")
})

await scenario("Falha de rede: o texto fica guardado no aparelho e é salvo ao voltar", async () => {
  await go(`/pages/${pageId}`)
  await page.route("**/api/pages/**", (route) => route.abort("internetdisconnected"))
  await page.locator(".prose-mesa").click()
  await page.keyboard.press("Control+End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Escrito sem rede")
  await page.waitForSelector("[role=status]:has-text('Sem conexão'), [role=alert]:has-text('Erro ao salvar')", { timeout: 15000 })
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("mesa:draft:page")))
  expect(drafts.length === 1, "rascunho local não foi guardado")
  await page.unroute("**/api/pages/**")
  await page.click("button:has-text('tentar')")
  await saved()
  await page.reload({ waitUntil: "networkidle" })
  expect((await page.locator(".prose-mesa").innerText()).includes("Escrito sem rede"), "texto escrito sem rede se perdeu")
})

await scenario("13. Principais telas em larguras de celular, tablet e desktop sem rolagem horizontal", async () => {
  const paths = ["/", "/tasks", "/tasks?view=board", "/planning", "/journal", `/pages/${pageId}`, `/projects/${projectId}`, "/inbox", "/areas", "/canvas", boardUrl, "/settings"]
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of paths) {
      await go(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow <= 1, `${path} em ${width}px rola na horizontal (${overflow}px)`)
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
})

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} cenários passaram.`)
if (errors.length) console.log(`Erros de página no navegador:\n${errors.map((e) => "  - " + e).join("\n")}`)
process.exit(failed.length || errors.length ? 1 : 0)
