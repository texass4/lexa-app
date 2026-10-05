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
  noReload,
  cpf,
  cnj,
  RUN,
  today,
  userId,
  admin,
  DIR,
} from "./lib.mjs"
const A = await login("a@alfa.test", "A"),
  B = await login("b@alfa.test", "B"),
  C = await login("c@beta.test", "C")
const both = [A, B]
const idB = await userId("b@alfa.test")
let seq = (Number.parseInt(RUN, 36) % 100000) * 10 + 5

// Cliente com CPF para vincular processo, documento e lançamento.
const base = `RT Base ${RUN}`
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
await waitCount(B, base, 1).catch(() => {})

/* ================================ PROCESSO ================================ */
const number = cnj(Number.parseInt(RUN, 36) % 9000000)
await step(
  "Processo",
  "criar / editar / excluir",
  async () => {
    await go(B, "/processos")
    await go(A, "/processos")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo processo/ })
      .first()
      .click()
    await A.page.fill("#proc-number", number)
    await A.page.waitForTimeout(1500)
    await dialog(A).locator("#proc-client").selectOption(baseRow.id)
    await dialog(A).locator("#proc-type").fill(`RT Ação ${RUN}`)
    await clickDialog(A, /Cadastrar processo/)
    await A.page.waitForTimeout(1500)
    let ms = await waitCount(B, number, 1)
    check("Processo", "criar em A → aparece em B uma vez", ms >= 0, `${ms} ms`)
    const rows = await dbOne("processes", "number", number)
    check(
      "Processo",
      "gravado uma vez no banco, com código do banco",
      rows.length === 1 && /^#?\d+$/.test(String(rows[0]?.data.code).replace("#", "")),
      rows[0]?.data.code,
    )
    // Edição: o caminho de edição do app é o diálogo com o CNJ de um processo acompanhado (atualizado há pouco).
    await admin
      .from("processes")
      .update({ data: { ...rows[0].data, source: { provider: "datajud" }, lastSyncedAt: new Date().toISOString().slice(0, 19) } })
      .eq("id", rows[0].id)
      .eq("organization_id", rows[0].organization_id)
    await A.page.waitForTimeout(1500)
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo processo/ })
      .first()
      .click()
    await A.page.fill("#proc-number", number)
    await clickDialog(A, /Preencher/)
    await A.page.waitForTimeout(1500)
    await dialog(A).locator("#proc-type").fill(`RT Ação editada ${RUN}`)
    await clickDialog(A, /Salvar processo/)
    await A.page.waitForTimeout(800)
    await A.page.keyboard.press("Escape")
    await go(B, `/processos/${rows[0].id}`)
    ms = await waitText(B, `RT Ação editada ${RUN}`, 1)
    check("Processo", "editar em A → B vê a alteração", ms >= 0, `${ms} ms`)
    await go(B, "/processos")
    await go(A, `/processos/${rows[0].id}`)
    await A.page.locator("main").getByRole("button", { name: "Mais ações" }).first().click()
    await A.page.getByRole("menuitem", { name: /Excluir processo/ }).click()
    await confirm(A)
    ms = await waitCount(B, number, 0)
    check("Processo", "excluir em A → some em B", ms >= 0 && (await dbOne("processes", "number", number)).length === 0, `${ms} ms`)
  },
  both,
)

await step(
  "Processo",
  "conflito de edição",
  async () => {
    const n2 = cnj((Number.parseInt(RUN, 36) % 9000000) + 1)
    const id = `rt-proc-${RUN}`
    const { error } = await admin.from("processes").insert({
      organization_id: baseRow.organization_id,
      id,
      data: {
        id,
        organizationId: baseRow.organization_id,
        number: n2,
        cnj: n2.replace(/\D/g, ""),
        clientId: baseRow.id,
        area: "Cível",
        type: "RT Conflito",
        court: "",
        district: "",
        opposingParty: "",
        status: "em_andamento",
        ownerId: idB,
        claimValue: 0,
        movements: [],
        lastMovementAt: "",
        distributedAt: "2026-01-10",
        createdAt: new Date().toISOString().slice(0, 19),
        source: { provider: "datajud" },
        lastSyncedAt: new Date().toISOString().slice(0, 19),
      },
    })
    if (error) throw error
    await A.page.waitForTimeout(1500)
    for (const u of both) {
      await go(u, "/processos")
      await u.page
        .locator("main")
        .getByRole("button", { name: /Novo processo/ })
        .first()
        .click()
      await u.page.fill("#proc-number", n2)
      await clickDialog(u, /Preencher/)
      await u.page.waitForTimeout(1500)
    }
    await dialog(A).locator("#proc-type").fill("RT Conflito — versão A")
    await clickDialog(A, /Salvar processo/)
    await A.page.waitForTimeout(1500)
    await dialog(B).locator("#proc-type").fill("RT Conflito — versão B")
    const t = Date.now()
    await clickDialog(B, /Salvar processo/)
    const toast = await waitToast(B, /alterado por outra pessoa/i, t)
    const [row] = await dbOne("processes", "number", n2)
    check(
      "Processo",
      "conflito: B é avisado e não sobrescreve",
      !!toast && row.data.type === "RT Conflito — versão A",
      toast ?? `sem aviso; banco: ${row.data.type}`,
    )
    await shot(B, "conflito-processo")
    for (const u of both) await u.page.keyboard.press("Escape")
  },
  both,
)

await step(
  "Processo",
  "cadastro simultâneo: códigos diferentes",
  async () => {
    const [p1, p2] = [cnj((Number.parseInt(RUN, 36) % 9000000) + 2), cnj((Number.parseInt(RUN, 36) % 9000000) + 3)]
    const create = async (u, n) => {
      await go(u, "/processos")
      await u.page
        .locator("main")
        .getByRole("button", { name: /Novo processo/ })
        .first()
        .click()
      await u.page.fill("#proc-number", n)
      await u.page.waitForTimeout(1200)
      await dialog(u).locator("#proc-client").selectOption(baseRow.id)
      await dialog(u).locator("#proc-type").fill("RT Simultâneo")
      await clickDialog(u, /Cadastrar processo/)
    }
    await Promise.all([create(A, p1), create(B, p2)])
    await A.page.waitForTimeout(2500)
    const r1 = await dbOne("processes", "number", p1),
      r2 = await dbOne("processes", "number", p2)
    // Antes de trocar de tela: cada um já recebeu o processo do outro pelo tempo real.
    await waitCount(A, p2, 1)
    await waitCount(B, p1, 1)
    await go(A, "/processos")
    await go(B, "/processos")
    const vis = [await waitCount(A, p1, 1), await waitCount(A, p2, 1), await waitCount(B, p1, 1), await waitCount(B, p2, 1)]
    check(
      "Processo",
      "cadastro simultâneo: um registro cada, códigos diferentes, visíveis nos dois",
      r1.length === 1 && r2.length === 1 && r1[0].data.code !== r2[0].data.code && vis.every((x) => x >= 0),
      `${r1[0]?.data.code} / ${r2[0]?.data.code}`,
    )
  },
  both,
)

/* ================================= TAREFA ================================= */
for (const u of both) await u.page.evaluate(() => localStorage.setItem("lexa:tasks-view", "list"))
const task = `RT Tarefa ${RUN}`
async function newTask(u, title, assignee) {
  await go(u, "/tarefas")
  await u.page
    .locator("main")
    .getByRole("button", { name: /Nova tarefa/ })
    .first()
    .click()
  await u.page.fill("#task-title", title)
  await dialog(u).locator("#task-assignee").selectOption(assignee)
  await clickDialog(u, /Criar tarefa/)
  await u.page.waitForTimeout(1200)
}
async function openTaskEdit(u, id) {
  await go(u, `/tarefas?tarefa=${id}`)
  await u.page
    .locator("[role=dialog]")
    .getByRole("button", { name: /Editar/ })
    .click()
  await u.page.locator("#task-title").waitFor()
}
await step(
  "Tarefa",
  "criar / editar / concluir / excluir",
  async () => {
    await go(B, "/tarefas")
    await newTask(A, task, idB)
    let ms = await waitCount(B, task, 1)
    check("Tarefa", "criar em A (para B) → aparece na lista de B uma vez", ms >= 0, `${ms} ms`)
    const [row] = await dbOne("tasks", "title", task)
    await openTaskEdit(A, row.id)
    await A.page.fill("#task-title", `${task} editada`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(800)
    ms = await waitCount(B, `${task} editada`, 1)
    check("Tarefa", "editar em A → B vê o novo título (e o antigo some)", ms >= 0 && (await waitCount(B, task, 0)) >= 0, `${ms} ms`)
    // Alterações rápidas: concluir/reabrir 5 vezes seguidas em A.
    await go(A, "/tarefas")
    // Grupo "Concluídas" aberto: a tarefa continua na tela ao concluir e reabrir.
    await A.page
      .locator("main")
      .getByRole("button", { name: /Concluídas/ })
      .first()
      .click()
      .catch(() => {})
    for (let k = 0; k < 5; k++) {
      await A.page
        .getByRole("checkbox", { name: new RegExp(`(Concluir|Reabrir): ${task} editada`) })
        .first()
        .click()
      await A.page.waitForTimeout(150)
    }
    await A.page.waitForTimeout(3000)
    const [final] = await dbOne("tasks", "title", `${task} editada`)
    await go(B, "/tarefas?filtro=concluidas")
    const inB = await waitCount(B, `${task} editada`, final.data.status === "concluida" ? 1 : 0)
    check(
      "Tarefa",
      "5 alterações rápidas seguidas: banco e B terminam no mesmo estado",
      final.data.status === "concluida" && inB >= 0,
      `banco: ${final.data.status}`,
    )
    await go(B, "/tarefas")
    await go(A, `/tarefas?tarefa=${row.id}`)
    await A.page.locator("[role=dialog]").getByRole("button", { name: "Excluir tarefa" }).click()
    await confirm(A)
    await go(B, "/tarefas?filtro=concluidas")
    ms = await waitCount(B, `${task} editada`, 0)
    check("Tarefa", "excluir em A → some em B", ms >= 0 && (await dbOne("tasks", "title", `${task} editada`)).length === 0, `${ms} ms`)
  },
  both,
)

await step(
  "Tarefa",
  "conflito de edição",
  async () => {
    const t2 = `RT Tarefa conflito ${RUN}`
    await newTask(A, t2, idB)
    await A.page.waitForTimeout(800)
    const [row] = await dbOne("tasks", "title", t2)
    await openTaskEdit(B, row.id)
    await openTaskEdit(A, row.id)
    await A.page.fill("#task-title", `${t2} A`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1500)
    await B.page.fill("#task-title", `${t2} B`)
    const t = Date.now()
    await clickDialog(B, /Salvar alterações/)
    const toast = await waitToast(B, /alterado por outra pessoa/i, t)
    const [db] = await dbOne("tasks", "title", `${t2} A`)
    check(
      "Tarefa",
      "conflito: B é avisado e não sobrescreve",
      !!toast && !!db && (await dbOne("tasks", "title", `${t2} B`)).length === 0,
      toast ?? "sem aviso",
    )
    await B.page.keyboard.press("Escape")
  },
  both,
)

await step(
  "Tarefa",
  "A edita enquanto B exclui",
  async () => {
    const t3 = `RT Tarefa excluída ${RUN}`
    await newTask(A, t3, idB)
    await A.page.waitForTimeout(800)
    const [row] = await dbOne("tasks", "title", t3)
    await openTaskEdit(A, row.id)
    await go(B, `/tarefas?tarefa=${row.id}`)
    const tDel = Date.now()
    await B.page.locator("[role=dialog]").getByRole("button", { name: "Excluir tarefa" }).click()
    await confirm(B)
    await B.page.waitForTimeout(1500)
    await A.page.fill("#task-title", `${t3} editada por A`).catch(() => {})
    await clickDialog(A, /Salvar alterações/).catch(() => {})
    const toast = await waitToast(A, /excluíd[oa] por outra pessoa/i, tDel, 4000)
    await shot(A, "tarefa-excluida-durante-edicao")
    check(
      "Tarefa",
      "A edita enquanto B exclui: A é avisado e nada volta a existir",
      !!toast && (await dbOne("tasks", "title", `${t3} editada por A`)).length === 0 && (await dbOne("tasks", "title", t3)).length === 0,
      toast ?? "sem aviso para A",
    )
    await A.page.keyboard.press("Escape")
  },
  both,
)

/* =============================== COMPROMISSO ============================== */
const appt = `RT Reunião ${RUN}`
async function openAppt(u, title) {
  await go(u, "/agenda")
  await u.page.locator("main").getByText(title).first().click()
  await u.page
    .locator("[role=dialog]")
    .getByRole("button", { name: /Editar/ })
    .waitFor()
}
await step(
  "Compromisso",
  "criar / editar / excluir / conflito",
  async () => {
    await go(B, "/agenda")
    await go(A, "/agenda")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo compromisso/ })
      .first()
      .click()
    await A.page.fill("#appt-title", appt)
    await A.page.fill("#appt-date", today(1))
    await A.page.fill("#appt-time", "10:00")
    await A.page.fill("#appt-end", "11:00")
    await clickDialog(A, /Agendar/)
    await A.page.waitForTimeout(1200)
    let ms = await waitText(B, appt, 1)
    check("Compromisso", "criar em A → aparece na agenda de B uma vez", ms >= 0, `${ms} ms`)
    await openAppt(A, appt)
    await A.page
      .locator("[role=dialog]")
      .getByRole("button", { name: /Editar/ })
      .click()
    await A.page.fill("#appt-title", `${appt} editada`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1000)
    ms = await waitText(B, `${appt} editada`, 1)
    check("Compromisso", "editar em A → B vê a alteração", ms >= 0, `${ms} ms`)
    // conflito
    await openAppt(B, `${appt} editada`)
    await B.page
      .locator("[role=dialog]")
      .getByRole("button", { name: /Editar/ })
      .click()
    await B.page.locator("#appt-title").waitFor()
    await openAppt(A, `${appt} editada`)
    await A.page
      .locator("[role=dialog]")
      .getByRole("button", { name: /Editar/ })
      .click()
    await A.page.fill("#appt-title", `${appt} versão A`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1500)
    await B.page.fill("#appt-title", `${appt} versão B`)
    const t = Date.now()
    await clickDialog(B, /Salvar alterações/)
    const toast = await waitToast(B, /alterado por outra pessoa/i, t)
    check(
      "Compromisso",
      "conflito: B é avisado e não sobrescreve",
      !!toast &&
        (await dbOne("appointments", "title", `${appt} versão B`)).length === 0 &&
        (await dbOne("appointments", "title", `${appt} versão A`)).length === 1,
      toast ?? "sem aviso",
    )
    await B.page.keyboard.press("Escape")
    await B.page.keyboard.press("Escape")
    await go(B, "/agenda")
    await openAppt(A, `${appt} versão A`)
    await A.page.locator("[role=dialog]").getByRole("button", { name: "Excluir compromisso" }).click()
    await confirm(A)
    ms = await waitText(B, `${appt} versão A`, 0)
    check("Compromisso", "excluir em A → some em B", ms >= 0 && (await dbOne("appointments", "title", `${appt} versão A`)).length === 0, `${ms} ms`)
  },
  both,
)

/* ================================ DOCUMENTO =============================== */
const docName = `RT Contrato ${RUN}.pdf`
fs.writeFileSync(`${DIR}/${docName}`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
await step(
  "Documento",
  "criar / editar / excluir / conflito",
  async () => {
    await go(B, "/documentos")
    await go(A, "/documentos")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo documento/ })
      .first()
      .click()
    await dialog(A).locator("input[type=file]").setInputFiles(`${DIR}/${docName}`)
    await dialog(A).locator("#doc-client").selectOption(baseRow.id)
    await clickDialog(A, /Adicionar documento/)
    await A.page.waitForTimeout(2500)
    let ms = await waitCount(B, docName, 1)
    check("Documento", "enviar em A → aparece em B uma vez", ms >= 0, `${ms} ms`)
    const edit = async (u, name) => {
      await go(u, "/documentos")
      await u.page
        .locator("main")
        .getByRole("button", { name: `Ações para ${name}` })
        .locator("visible=true")
        .first()
        .click()
      await u.page.getByRole("menuitem", { name: /Editar/ }).click()
      await u.page.locator("#doc-edit-name").waitFor()
    }
    await edit(A, docName)
    await A.page.fill("#doc-edit-name", `RT Contrato editado ${RUN}`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1000)
    const newName = (await dbOne("documents", "clientId", baseRow.id))[0]?.data.name
    ms = await waitCount(B, newName, 1)
    check("Documento", "renomear em A → B vê o novo nome", ms >= 0 && (await waitCount(B, docName, 0)) >= 0, `${newName} · ${ms} ms`)
    await edit(B, newName)
    await edit(A, newName)
    await A.page.fill("#doc-edit-name", `RT Contrato A ${RUN}`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1500)
    await B.page.fill("#doc-edit-name", `RT Contrato B ${RUN}`)
    const t = Date.now()
    await clickDialog(B, /Salvar alterações/)
    const toast = await waitToast(B, /alterado por outra pessoa/i, t)
    const final = (await dbOne("documents", "clientId", baseRow.id))[0]?.data.name
    check("Documento", "conflito: B é avisado e não sobrescreve", !!toast && /RT Contrato A/.test(final), toast ?? `sem aviso; banco: ${final}`)
    await B.page.keyboard.press("Escape")
    await go(B, "/documentos")
    await go(A, "/documentos")
    await A.page
      .locator("main")
      .getByRole("button", { name: `Ações para ${final}` })
      .locator("visible=true")
      .first()
      .click()
    await A.page.getByRole("menuitem", { name: /Excluir/ }).click()
    await confirm(A)
    ms = await waitCount(B, final, 0)
    check("Documento", "excluir em A → some em B", ms >= 0 && (await dbOne("documents", "clientId", baseRow.id)).length === 0, `${ms} ms`)
  },
  both,
)

/* =============================== LANÇAMENTO =============================== */
const inv = `RT Honorários ${RUN}`
async function invMenu(u, description, item) {
  await u.page
    .locator("main")
    .getByRole("button", { name: `Ações para ${description}` })
    .first()
    .click()
  await u.page.getByRole("menuitem", { name: item }).click()
}
await step(
  "Lançamento",
  "criar / editar / receber / excluir / conflito",
  async () => {
    await go(B, "/financeiro")
    await go(A, "/financeiro")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo lançamento/ })
      .first()
      .click()
    await dialog(A).locator("#inv-client").selectOption(baseRow.id)
    await A.page.fill("#inv-description", inv)
    await A.page.fill("#inv-amount", "1500")
    await A.page.fill("#inv-due", today(10))
    await clickDialog(A, /Criar lançamento/)
    await A.page.waitForTimeout(1200)
    let ms = await waitText(B, inv, 1)
    check("Lançamento", "criar em A → aparece em B uma vez", ms >= 0, `${ms} ms`)
    await invMenu(A, inv, /Editar lançamento/)
    await A.page.fill("#inv-description", `${inv} editado`)
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1000)
    ms = await waitText(B, `${inv} editado`, 1)
    check("Lançamento", "editar em A → B vê a alteração", ms >= 0, `${ms} ms`)
    // conflito
    await invMenu(B, `${inv} editado`, /Editar lançamento/)
    await B.page.locator("#inv-description").waitFor()
    await invMenu(A, `${inv} editado`, /Editar lançamento/)
    await A.page.fill("#inv-amount", "2000")
    await clickDialog(A, /Salvar alterações/)
    await A.page.waitForTimeout(1500)
    await B.page.fill("#inv-amount", "999")
    const t = Date.now()
    await clickDialog(B, /Salvar alterações/)
    const toast = await waitToast(B, /alterado por outra pessoa/i, t)
    const [row] = await dbOne("invoices", "description", `${inv} editado`)
    check(
      "Lançamento",
      "conflito: B é avisado e não sobrescreve o valor",
      !!toast && Number(row.data.amount) === 2000,
      toast ?? `sem aviso; valor no banco: ${row.data.amount}`,
    )
    await B.page.keyboard.press("Escape")
    // excluir
    await invMenu(A, `${inv} editado`, /Excluir lançamento/)
    await confirm(A)
    ms = await waitText(B, `${inv} editado`, 0)
    check("Lançamento", "excluir em A → some em B", ms >= 0 && (await dbOne("invoices", "description", `${inv} editado`)).length === 0, `${ms} ms`)
  },
  both,
)

/* ================================= PRAZO ================================== */
await step(
  "Prazo",
  "criar / cumprir",
  async () => {
    const procs = await dbOne("processes", "clientId", baseRow.id)
    await go(B, "/tarefas/prazos")
    await go(A, "/tarefas/prazos")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo prazo/ })
      .first()
      .click()
    await dialog(A).locator("#prazo-process").selectOption(procs[0].id)
    await A.page.fill("#prazo-description", `RT Prazo ${RUN}`)
    await A.page.fill("#prazo-fatal", today(5))
    await A.page.fill("#prazo-internal", today(3))
    await clickDialog(A, /Cadastrar prazo/)
    await A.page.waitForTimeout(1500)
    let ms = await waitText(B, `RT Prazo ${RUN}`, 1)
    check("Prazo", "criar em A → aparece em B uma vez", ms >= 0, `${ms} ms`)
    const rows = await dbOne("deadlines", "description", `RT Prazo ${RUN}`)
    const linked = await dbOne("tasks", "title", `RT Prazo ${RUN}`)
    check(
      "Prazo",
      "um prazo e uma tarefa vinculada no banco",
      rows.length === 1 && linked.length === 1,
      `${rows.length} prazo, ${linked.length} tarefa`,
    )
    await A.page
      .locator("main li")
      .filter({ hasText: `RT Prazo ${RUN}` })
      .getByRole("button", { name: /Cumprir prazo/ })
      .click()
    await A.page.waitForTimeout(1500)
    await B.page
      .locator("main")
      .getByRole("tab", { name: /Cumpridos/ })
      .click()
    ms = await waitText(B, `RT Prazo ${RUN}`, 1)
    const [closed] = await dbOne("deadlines", "description", `RT Prazo ${RUN}`)
    check("Prazo", "cumprir em A → B vê em Cumpridos", ms >= 0 && closed.data.status === "cumprido", `${ms} ms`)
  },
  both,
)

/* =========================== ATIVIDADES (PAINEL) ========================== */
await step(
  "Atividade",
  "B vê no Painel o que A fez",
  async () => {
    await go(B, "/dashboard")
    const before = B.frames.filter((f) => f.table === "activities").length
    const c = `RT Atividade ${RUN}`
    await go(A, "/clientes")
    await A.page
      .locator("main")
      .getByRole("button", { name: /Novo cliente/ })
      .first()
      .click()
    await A.page.fill("#client-name", c)
    await A.page.fill("#client-document", cpf(++seq))
    await clickDialog(A, /Cadastrar cliente/)
    await A.page.waitForTimeout(3000)
    check("Atividade", "atividade criada por A chega a B pelo tempo real", B.frames.filter((f) => f.table === "activities").length > before)
  },
  both,
)

/* ================================ ISOLAMENTO ============================== */
const foreign = C.frames.filter((f) => f.org !== undefined && f.org !== C.frames[0]?.org)
const alfaOrg = baseRow.organization_id
check(
  "Isolamento",
  "C (Escritório Beta) não recebeu nenhum evento do Alfa",
  !C.frames.some((f) => f.org === alfaOrg),
  `${C.frames.length} eventos de dados recebidos por C`,
)
check(
  "Isolamento",
  "A e B só receberam eventos do próprio escritório",
  [...A.frames, ...B.frames].every((f) => f.org === undefined || f.org === alfaOrg),
  `${A.frames.length + B.frames.length} eventos`,
)
// Por canal: o mesmo aviso de exclusão chega ao canal do escritório e ao da Triagem (cada um trata a sua coleção).
const ids = B.frames.filter((f) => f.type === "INSERT").map((f) => `${f.topic.split(":").slice(0, 2).join(":")}|${f.table}:${f.id}`)
check("Realtime", "nenhum INSERT entregue duas vezes ao mesmo canal de B", ids.length === new Set(ids).size, `${ids.length} inserções recebidas`)
const dbDuplicates = await Promise.all(
  ["clients", "processes", "tasks", "appointments", "documents", "invoices", "deadlines"].map(async (t) => {
    const { data } = await admin.from(t).select("id").eq("organization_id", baseRow.organization_id)
    return data.length - new Set(data.map((r) => r.id)).size
  }),
)
check(
  "Realtime",
  "nenhum registro duplicado no banco",
  dbDuplicates.every((n) => n === 0),
)
for (const u of [A, B, C]) check("Sessão", `${u.label}: sem recarregar a página`, await noReload(u))
for (const u of [A, B, C]) check("Sessão", `${u.label}: sem erros não tratados`, u.errors.length === 0, u.errors.slice(0, 3).join(" | "))
console.log("eventos realtime: A", A.frames.length, "B", B.frames.length, "C", C.frames.length, foreign.length)
save("r-entidades")
await close()
