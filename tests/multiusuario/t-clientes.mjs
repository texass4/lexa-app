import { login, go, waitCount, waitToast, check, dialog, clickDialog, confirm, shot, dbOne, save, close, noReload, cpf, RUN } from "./lib.mjs"
const A = await login("a@alfa.test", "A"),
  B = await login("b@alfa.test", "B"),
  C = await login("c@beta.test", "C")
await go(B, "/clientes")
await go(C, "/clientes")
let seq = (Number.parseInt(RUN, 36) % 100000) * 10

async function newClient(user, name) {
  await go(user, "/clientes")
  await user.page
    .locator("main")
    .getByRole("button", { name: /Novo cliente/ })
    .first()
    .click()
  await user.page.fill("#client-name", name)
  await user.page.fill("#client-document", cpf(++seq))
  await clickDialog(user, /Cadastrar cliente/)
  await user.page.waitForTimeout(800)
}
async function openEdit(user, id) {
  await go(user, `/clientes/${id}`)
  await user.page
    .locator("main")
    .getByRole("button", { name: /^Editar$/ })
    .click()
  await dialog(user).locator("#client-name").waitFor()
}

// ---- criar / editar / excluir
const name = `RT Cliente ${RUN}`
await newClient(A, name)
let ms = await waitCount(B, name, 1)
check("Cliente", "criar em A → aparece em B sem recarregar, uma vez", ms >= 0, `${ms} ms`)
const [row] = await dbOne("clients", "name", name)
check("Cliente", "gravado no banco uma vez", !!row)
await openEdit(A, row.id)
await dialog(A).locator("#client-name").fill(`${name} editado`)
await clickDialog(A, /Salvar alterações/)
ms = await waitCount(B, `${name} editado`, 1)
check("Cliente", "editar em A → B vê o novo nome", ms >= 0 && (await waitCount(B, name, 0)) >= 0, `${ms} ms`)
await A.page.locator("main").getByRole("button", { name: "Mais ações" }).click()
await A.page.getByRole("menuitem", { name: /Excluir cliente/ }).click()
await confirm(A)
ms = await waitCount(B, `${name} editado`, 0)
check("Cliente", "excluir em A → some em B", ms >= 0, `${ms} ms`)
check("Cliente", "excluído no banco", (await dbOne("clients", "name", `${name} editado`)).length === 0)

// ---- conflito: B edita versão antiga depois que A salvou
const n2 = `RT Conflito ${RUN}`
await newClient(A, n2)
await waitCount(B, n2, 1)
const [c2] = await dbOne("clients", "name", n2)
await openEdit(B, c2.id)
await openEdit(A, c2.id)
await dialog(A).locator("#client-name").fill(`${n2} versão A`)
await clickDialog(A, /Salvar alterações/)
await A.page.waitForTimeout(1500)
await dialog(B).locator("#client-name").fill(`${n2} versão B`)
let t = Date.now()
await clickDialog(B, /Salvar alterações/)
let toast = await waitToast(B, /alterado por outra pessoa/i, t)
const [after] = await dbOne("clients", "name", `${n2} versão A`)
check(
  "Cliente",
  "conflito: B é avisado e não sobrescreve",
  !!toast && !!after && (await dbOne("clients", "name", `${n2} versão B`)).length === 0,
  toast ?? "sem aviso",
)
await shot(B, "conflito-cliente")
await B.page.keyboard.press("Escape")

// ---- A exclui enquanto B edita
const n3 = `RT Exclusão ${RUN}`
await newClient(A, n3)
await waitCount(B, n3, 1)
const [c3] = await dbOne("clients", "name", n3)
await openEdit(B, c3.id)
await go(A, `/clientes/${c3.id}`)
const tDel = Date.now()
await A.page.locator("main").getByRole("button", { name: "Mais ações" }).click()
await A.page.getByRole("menuitem", { name: /Excluir cliente/ }).click()
await confirm(A)
await A.page.waitForTimeout(1500)
await dialog(B)
  .locator("#client-name")
  .fill(`${n3} editado por B`)
  .catch(() => {})
t = Date.now()
await clickDialog(B, /Salvar alterações/).catch(() => {})
toast = await waitToast(B, /excluído por outra pessoa/i, tDel)
check(
  "Cliente",
  "A exclui enquanto B edita: B é avisado e o registro não volta",
  !!toast && (await dbOne("clients", "name", `${n3} editado por B`)).length === 0 && (await dbOne("clients", "name", n3)).length === 0,
  toast ?? "sem aviso (diálogo pode ter fechado)",
)
await shot(B, "exclusao-cliente")
await B.page.keyboard.press("Escape")

// ---- criação simultânea e clique duplo
await Promise.all([go(A, "/clientes"), go(B, "/clientes")])
const [na, nb] = [`RT Simultâneo A ${RUN}`, `RT Simultâneo B ${RUN}`]
await Promise.all([newClient(A, na), newClient(B, nb)])
const both = [await waitCount(A, nb, 1), await waitCount(B, na, 1), await waitCount(A, na, 1), await waitCount(B, nb, 1)]
check(
  "Cliente",
  "criação simultânea: cada um aparece uma vez nos dois",
  both.every((x) => x >= 0),
  both.join("/"),
)
const nd = `RT Duplo ${RUN}`
await go(A, "/clientes")
await A.page
  .locator("main")
  .getByRole("button", { name: /Novo cliente/ })
  .first()
  .click()
await A.page.fill("#client-name", nd)
await A.page.fill("#client-document", cpf(++seq))
await dialog(A)
  .getByRole("button", { name: /Cadastrar cliente/ })
  .dblclick()
await A.page.waitForTimeout(2500)
check(
  "Cliente",
  "clique duplo em cadastrar: um registro só",
  (await dbOne("clients", "name", nd)).length === 1 && (await waitCount(B, nd, 1)) >= 0,
  `${(await dbOne("clients", "name", nd)).length} no banco`,
)

// ---- isolamento nos dois sentidos: C (Beta) cria e edita; A e B não recebem nada
const beta = `RT Beta ${RUN}`
const aBefore = A.frames.length,
  bBefore = B.frames.length
await newClient(C, beta)
await C.page.waitForTimeout(2500)
const [betaRow] = await dbOne("clients", "name", beta)
check(
  "Isolamento",
  "Beta cria cliente: A e B não recebem o evento nem veem o registro",
  ![...A.frames, ...B.frames].some((f) => f.org === betaRow.organization_id) && (await waitCount(B, beta, 0, 500)) >= 0,
  `${A.frames.length - aBefore + B.frames.length - bBefore} eventos novos em A/B, nenhum do Beta`,
)

// ---- isolamento e recarga
check(
  "Isolamento",
  "C (outro escritório) não recebeu nenhum evento do Alfa",
  !C.frames.some((f) => f.org === row.organization_id) && C.frames.every((f) => f.org === betaRow.organization_id),
  `${C.frames.length} eventos recebidos por C, todos do próprio Beta`,
)
check("Isolamento", "C não vê clientes do Alfa", (await waitCount(C, nd, 0, 1000)) >= 0)
for (const u of [A, B, C]) check("Sessão", `${u.label}: sem recarregar a página`, await noReload(u))
for (const u of [A, B, C]) check("Sessão", `${u.label}: sem erros não tratados`, u.errors.length === 0, u.errors.slice(0, 2).join(" | "))
console.log("eventos realtime recebidos por B:", B.frames.length)
save("r-clientes")
await close()
