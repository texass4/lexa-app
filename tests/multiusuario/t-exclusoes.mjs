import fs from "node:fs"
import {
  login,
  go,
  waitCount,
  waitText,
  waitToast,
  check,
  step,
  dialog,
  clickDialog,
  confirm,
  shot,
  dbOne,
  save,
  close,
  cpf,
  RUN,
  today,
  DIR,
} from "./lib.mjs"
const A = await login("a@alfa.test", "A"),
  B = await login("b@alfa.test", "B")
const both = [A, B]
let seq = (Number.parseInt(RUN, 36) % 100000) * 10 + 7
const base = `RT Base X ${RUN}`
await go(A, "/clientes")
await A.page
  .locator("main")
  .getByRole("button", { name: /Novo cliente/ })
  .first()
  .click()
await A.page.fill("#client-name", base)
await A.page.fill("#client-document", cpf(++seq))
await clickDialog(A, /Cadastrar cliente/)
await A.page.waitForTimeout(1500)
const [baseRow] = await dbOne("clients", "name", base)

// Cliente: A exclui enquanto B edita
await step(
  "Exclusão",
  "cliente excluído enquanto B edita",
  async () => {
    await go(B, `/clientes/${baseRow.id}`)
    await B.page
      .locator("main")
      .getByRole("button", { name: /^Editar$/ })
      .click()
    await B.page.locator("#client-name").fill(`${base} mudando`)
    await go(A, `/clientes/${baseRow.id}`)
    const t = Date.now()
    await A.page.locator("main").getByRole("button", { name: "Mais ações" }).click()
    await A.page.getByRole("menuitem", { name: /Excluir cliente/ }).click()
    await confirm(A)
    const toast = await waitToast(B, /excluído por outra pessoa/i, t, 6000)
    await shot(B, "excl-cliente-B")
    check(
      "Exclusão",
      "cliente: B é avisado de que o registro foi excluído (sem perder a edição em silêncio)",
      !!toast,
      toast ?? "formulário fechou sem aviso",
    )
  },
  both,
)

// Documento: A exclui enquanto B renomeia
const doc = `RT Excl ${RUN}.pdf`
fs.writeFileSync(`${DIR}/${doc}`, "%PDF-1.4\n%%EOF\n")
const base2 = `RT Base Y ${RUN}`
await go(A, "/clientes")
await A.page
  .locator("main")
  .getByRole("button", { name: /Novo cliente/ })
  .first()
  .click()
await A.page.fill("#client-name", base2)
await A.page.fill("#client-document", cpf(++seq))
await clickDialog(A, /Cadastrar cliente/)
await A.page.waitForTimeout(1500)
const [b2] = await dbOne("clients", "name", base2)
await step(
  "Exclusão",
  "documento excluído enquanto B renomeia",
  async () => {
    await go(A, "/documentos")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo documento/ })
      .first()
      .click()
    await dialog(A).locator("input[type=file]").setInputFiles(`${DIR}/${doc}`)
    await dialog(A).locator("#doc-client").selectOption(b2.id)
    await clickDialog(A, /Adicionar documento/)
    await A.page.waitForTimeout(2000)
    await go(B, "/documentos")
    await waitCount(B, doc, 1)
    await B.page
      .locator("main")
      .getByRole("button", { name: `Ações para ${doc}` })
      .locator("visible=true")
      .first()
      .click()
    await B.page.getByRole("menuitem", { name: /Editar/ }).click()
    await B.page.fill("#doc-edit-name", "RT nome novo")
    await go(A, "/documentos")
    const t = Date.now()
    await A.page
      .locator("main")
      .getByRole("button", { name: `Ações para ${doc}` })
      .locator("visible=true")
      .first()
      .click()
    await A.page.getByRole("menuitem", { name: /Excluir/ }).click()
    await confirm(A)
    const toast = await waitToast(B, /excluído por outra pessoa/i, t, 6000)
    await shot(B, "excl-doc-B")
    check("Exclusão", "documento: B é avisado de que o registro foi excluído", !!toast, toast ?? "formulário fechou sem aviso")
    check("Exclusão", "documento não volta a existir", (await dbOne("documents", "clientId", b2.id)).length === 0)
  },
  both,
)

// Lançamento: B exclui enquanto A edita (A salva depois)
await step(
  "Exclusão",
  "lançamento excluído enquanto A edita",
  async () => {
    const inv = `RT Excl lanc ${RUN}`
    await go(A, "/financeiro")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo lançamento/ })
      .first()
      .click()
    await dialog(A).locator("#inv-client").selectOption(b2.id)
    await A.page.fill("#inv-description", inv)
    await A.page.fill("#inv-amount", "700")
    await A.page.fill("#inv-due", today(9))
    await clickDialog(A, /Criar lançamento/)
    await A.page.waitForTimeout(1500)
    await A.page
      .locator("main")
      .getByRole("button", { name: `Ações para ${inv}` })
      .first()
      .click()
    await A.page.getByRole("menuitem", { name: /Editar lançamento/ }).click()
    await A.page.fill("#inv-amount", "800")
    await go(B, "/financeiro")
    await waitText(B, inv, 1)
    await B.page
      .locator("main")
      .getByRole("button", { name: `Ações para ${inv}` })
      .first()
      .click()
    await B.page.getByRole("menuitem", { name: /Excluir lançamento/ }).click()
    await confirm(B)
    await A.page.waitForTimeout(1500)
    const t = Date.now()
    await clickDialog(A, /Salvar alterações/).catch(() => {})
    const toast = await waitToast(A, /excluído por outra pessoa/i, t - 3000, 5000)
    check(
      "Exclusão",
      "lançamento: A é avisado e o registro não volta",
      !!toast && (await dbOne("invoices", "description", inv)).length === 0,
      toast ?? "sem aviso",
    )
    await A.page.keyboard.press("Escape")
  },
  both,
)

// Ações repetidas: excluir duas vezes o mesmo registro (A e B ao mesmo tempo)
await step(
  "Concorrência",
  "A e B excluem a mesma tarefa ao mesmo tempo",
  async () => {
    const title = `RT Dupla exclusão ${RUN}`
    await go(A, "/tarefas")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Nova tarefa/ })
      .first()
      .click()
    await A.page.fill("#task-title", title)
    await clickDialog(A, /Criar tarefa/)
    await A.page.waitForTimeout(1500)
    const [row] = await dbOne("tasks", "title", title)
    await Promise.all(both.map((u) => go(u, `/tarefas?tarefa=${row.id}`)))
    await Promise.all(both.map((u) => u.page.locator("[role=dialog]").getByRole("button", { name: "Excluir tarefa" }).click()))
    await Promise.all(both.map((u) => confirm(u)))
    await A.page.waitForTimeout(2500)
    const errs = [...A.toasts, ...B.toasts].filter((t) => /Não foi possível/i.test(t.text))
    check(
      "Concorrência",
      "exclusão dupla: some dos dois, sem erro na tela",
      (await dbOne("tasks", "title", title)).length === 0 && errs.length === 0,
      errs.map((e) => e.text).join(" | "),
    )
  },
  both,
)

for (const u of both) check("Sessão", `${u.label}: sem erros não tratados`, u.errors.length === 0, (u.stacks ?? []).slice(0, 1).join(""))
save("r-exclusoes")
await close()
