import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createArea, deleteArea, moveArea, listAreas } from "@/lib/services/areas"
import { createBoard, getBoard, saveBoardSnapshot } from "@/lib/services/boards"
import { capture, convertToPage, convertToTask, listInbox, moveToJournal } from "@/lib/services/inbox"
import { adjacentEntries, getEntry, listEntries, saveEntry } from "@/lib/services/journal"
import { createPage, getPage, savePageContent } from "@/lib/services/pages"
import { createProject, deleteProject, getProject } from "@/lib/services/projects"
import { backlinks, resolveRefs } from "@/lib/services/refs"
import { globalSearch } from "@/lib/services/search"
import { addSubtask, createTask, deleteTask, getTask, listTasks, moveTask, updateSubtask, updateTask } from "@/lib/services/tasks"
import type { BoardSnapshotInput } from "@/lib/validation"
import { useTestDb } from "./helpers/db"

useTestDb()
const today = "2026-10-24"
const ctx = { today }

describe("tarefas", () => {
  it("cria com os campos opcionais e persiste", async () => {
    const task = await createTask({ title: "  Gravar os vocais  ", dueDate: "2026-10-30", priority: "high", tags: ["Música", "música", "estúdio"], subtasks: ["Aquecer", "Gravar"] })
    expect(task.title).toBe("Gravar os vocais")
    expect(task.number).toBe(1)
    expect(task.tags.map((t) => t.name).sort()).toEqual(["estúdio", "Música"].sort())
    expect(task.subtaskTotal).toBe(2)
    const again = await getTask(task.id)
    expect(again?.dueDate).toBe("2026-10-30")
    expect(again?.subtasks.map((s) => s.title)).toEqual(["Aquecer", "Gravar"])
  })

  it("recusa título vazio e datas fora de ordem", async () => {
    await expect(createTask({ title: "   " })).rejects.toThrow("Informe um título.")
    await expect(createTask({ title: "x", startDate: "2026-10-30", dueDate: "2026-10-01" })).rejects.toThrow(/início/)
  })

  it("concluir registra a data, reabrir remove — e todas as listas refletem", async () => {
    const task = await createTask({ title: "Revisar mix", dueDate: today })
    const now = new Date("2026-10-24T15:00:00Z")
    const { task: done } = await updateTask(task.id, { status: "done" }, { today, now })
    expect(done.completedAt?.toISOString()).toBe(now.toISOString())
    expect((await listTasks({ status: ["todo", "in_progress"], dueFrom: today, dueTo: today })).map((t) => t.id)).not.toContain(task.id)
    expect((await listTasks({ status: ["done"] })).map((t) => t.id)).toContain(task.id)
    const { task: reopened } = await updateTask(task.id, { status: "todo" }, ctx)
    expect(reopened.completedAt).toBeNull()
  })

  it("concluir uma recorrente cria a próxima ocorrência com a regra", async () => {
    const task = await createTask({ title: "Backup", dueDate: "2026-10-24", recurrence: { freq: "weekly", interval: 1 }, tags: ["rotina"], subtasks: ["Fotos"] })
    const { task: done, spawned } = await updateTask(task.id, { status: "done" }, ctx)
    expect(done.recurrence).toBeNull()
    expect(spawned?.dueDate).toBe("2026-10-31")
    expect(spawned?.status).toBe("todo")
    expect(spawned?.recurrence).toEqual({ freq: "weekly", interval: 1 })
    expect(spawned?.tags.map((t) => t.name)).toEqual(["rotina"])
    expect(spawned?.subtasks.map((s) => [s.title, s.done])).toEqual([["Fotos", false]])
  })

  it("filtros: atrasadas, sem prazo, tag, busca sem acento", async () => {
    await createTask({ title: "Pagar conta de luz", dueDate: "2026-10-20" })
    await createTask({ title: "Ler sobre harmonia", tags: ["estudos"] })
    await createTask({ title: "Reunião de produção", dueDate: "2026-11-02" })
    expect((await listTasks({ status: ["todo", "in_progress"], dueTo: "2026-10-23" })).map((t) => t.title)).toEqual(["Pagar conta de luz"])
    expect((await listTasks({ noDueDate: true })).map((t) => t.title)).toEqual(["Ler sobre harmonia"])
    expect((await listTasks({ tag: "ESTUDOS" })).map((t) => t.title)).toEqual(["Ler sobre harmonia"])
    expect((await listTasks({ query: "reuniao" })).map((t) => t.title)).toEqual(["Reunião de produção"])
  })

  it("kanban persiste coluna e ordem", async () => {
    const a = await createTask({ title: "A" })
    const b = await createTask({ title: "B" })
    const c = await createTask({ title: "C" })
    await moveTask(c.id, { status: "in_progress" }, ctx)
    await moveTask(a.id, { status: "in_progress", beforeId: null, afterId: c.id }, ctx)
    const column = (await listTasks({ status: ["in_progress"] })).sort((x, y) => x.position - y.position)
    expect(column.map((t) => t.title)).toEqual(["A", "C"])
    const { task } = await moveTask(b.id, { status: "done", beforeId: null, afterId: null }, ctx)
    expect(task.completedAt).not.toBeNull()
  })

  it("subtarefas", async () => {
    const task = await createTask({ title: "Mudar de casa" })
    const sub = await addSubtask(task.id, { title: "Caixas" })
    await updateSubtask(sub.id, { done: true })
    const t = await getTask(task.id)
    expect([t?.subtaskDone, t?.subtaskTotal]).toEqual([1, 1])
  })
})

describe("projetos e áreas", () => {
  it("progresso considera só tarefas não arquivadas e mostra 'sem tarefas' sem inventar", async () => {
    const project = await createProject({ title: "Disco novo" })
    expect((await getProject(project.id))?.progress).toBeNull()
    const t1 = await createTask({ title: "Compor", projectId: project.id })
    await createTask({ title: "Gravar", projectId: project.id })
    const t3 = await createTask({ title: "Ideia descartada", projectId: project.id })
    await updateTask(t1.id, { status: "done" }, ctx)
    await updateTask(t3.id, { status: "archived" }, ctx)
    expect((await getProject(project.id))?.progress).toEqual({ total: 2, done: 1, percent: 50 })
  })

  it("excluir projeto não apaga as tarefas", async () => {
    const project = await createProject({ title: "Temporário" })
    const task = await createTask({ title: "Sobrevive", projectId: project.id })
    const counts = await deleteProject(project.id)
    expect(counts.tasks).toBe(1)
    const after = await getTask(task.id)
    expect(after).not.toBeNull()
    expect(after?.projectId).toBeNull()
  })

  it("tarefas aparecem na área diretamente ou pelo projeto; excluir área não apaga nada", async () => {
    const area = await createArea({ name: "Música" })
    const project = await createProject({ title: "EP", areaId: area.id })
    await createTask({ title: "Direto", areaId: area.id })
    await createTask({ title: "Pelo projeto", projectId: project.id })
    await createTask({ title: "Fora" })
    expect((await listTasks({ areaId: area.id })).map((t) => t.title).sort()).toEqual(["Direto", "Pelo projeto"])
    await deleteArea(area.id)
    expect((await listTasks()).length).toBe(3)
    expect((await getProject(project.id))?.areaId).toBeNull()
  })

  it("organiza a ordem das áreas", async () => {
    const a = await createArea({ name: "Saúde" })
    await createArea({ name: "Estudos" })
    await moveArea(a.id, "down")
    expect((await listAreas()).map((x) => x.name)).toEqual(["Estudos", "Saúde"])
  })
})

describe("páginas, diário e referências", () => {
  const docWith = (refs: { type: string; id: string; label: string }[], text = "x") => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }, ...refs.map((r) => ({ type: "reference", attrs: { refType: r.type, refId: r.id, label: r.label } }))] }],
  })

  it("salvamento com versão: resposta atrasada não sobrescreve a mais nova", async () => {
    const page = await createPage({ title: "Notas" })
    const first = await savePageContent(page.id, { content: docWith([], "primeira"), baseVersion: page.version })
    expect(first.ok).toBe(true)
    // Uma segunda gravação baseada na versão antiga (atrasada) é recusada como conflito.
    const stale = await savePageContent(page.id, { content: docWith([], "atrasada"), baseVersion: page.version })
    expect(stale.ok).toBe(false)
    expect((await getPage(page.id))?.content).toEqual(docWith([], "primeira"))
  })

  it("referências mostram o estado atual do registro e listam onde ele é citado", async () => {
    const task = await createTask({ title: "Gravar os vocais" })
    const page = await createPage({ title: "Produção" })
    await savePageContent(page.id, { content: docWith([{ type: "task", id: task.id, label: "título antigo" }]), baseVersion: page.version })
    await updateTask(task.id, { title: "Gravar vocais e coros", status: "in_progress" }, ctx)
    const refs = await resolveRefs([{ type: "task", id: task.id }], today)
    expect(refs[`task:${task.id}`]?.title).toBe("Gravar vocais e coros")
    expect(refs[`task:${task.id}`]?.status).toBe("Em andamento")
    expect((await backlinks({ type: "task", id: task.id })).map((b) => b.title)).toEqual(["Produção"])
    await deleteTask(task.id)
    expect(await resolveRefs([{ type: "task", id: task.id }], today)).toEqual({})
  })

  it("diário: uma entrada por data, criada no primeiro salvamento, recuperável pela data", async () => {
    expect(await getEntry("2026-10-24")).toBeNull()
    const saved = await saveEntry("2026-10-24", { content: docWith([], "Hoje gravei a guia."), baseVersion: 0 })
    expect(saved.ok).toBe(true)
    await saveEntry("2026-10-20", { content: docWith([], "Dia de estudo."), baseVersion: 0 })
    const entry = await getEntry("2026-10-24")
    expect(entry?.version).toBe(1)
    // Segunda tentativa de "criar" a mesma data vira conflito, não duplicata.
    expect((await saveEntry("2026-10-24", { content: docWith([], "outra"), baseVersion: 0 })).ok).toBe(false)
    expect(await adjacentEntries("2026-10-24")).toEqual({ previous: "2026-10-20", next: null })
    expect((await listEntries({ query: "guia" })).map((e) => e.entryDate)).toEqual(["2026-10-24"])
  })
})

describe("caixa de entrada", () => {
  it("converte em tarefa, página ou diário sem duplicar e preserva a referência", async () => {
    const a = await capture({ content: "Ligar para o técnico\ndepois das 14h" })
    const b = await capture({ content: "Ideia de letra" })
    const c = await capture({ content: "Sonhei com o show" })
    const task = await convertToTask(a.id)
    expect([task.title, task.description]).toEqual(["Ligar para o técnico", "depois das 14h"])
    const page = await convertToPage(b.id)
    expect(page.title).toBe("Ideia de letra")
    await moveToJournal(c.id, today)
    expect(await listInbox()).toHaveLength(0)
    const processed = await listInbox({ processed: true })
    expect(processed.find((i) => i.id === a.id)).toMatchObject({ convertedType: "task", convertedId: task.id })
    await expect(convertToTask(a.id)).rejects.toThrow("já foi organizado")
    expect((await getEntry(today))?.content.content?.length).toBe(1)
  })
})

describe("canvas", () => {
  const snapshot = (baseVersion: number, taskId: string, x = 100): BoardSnapshotInput => {
    const frame = "11111111-1111-4111-8111-111111111111"
    const card = "22222222-2222-4222-8222-222222222222"
    const record = "33333333-3333-4333-8333-333333333333"
    return {
      baseVersion,
      viewport: { x: -120, y: 40, zoom: 1.25 },
      elements: [
        { id: frame, kind: "frame", x: 0, y: 0, width: 800, height: 500, zIndex: -1, parentId: null, data: { title: "Produção musical" }, ref: null },
        { id: card, kind: "card", x: 40, y: 60, width: 220, height: 120, zIndex: 1, parentId: frame, data: { title: "Produção musical", body: "Fluxo" }, ref: null },
        { id: record, kind: "record", x, y: 260, width: 260, height: 110, zIndex: 2, parentId: frame, data: {}, ref: { type: "task", id: taskId } },
      ],
      connections: [{ id: randomUUID(), sourceId: card, targetId: record, sourceHandle: "right", targetHandle: "left", label: "depois", style: { arrowEnd: true } }],
    }
  }

  it("salva e reabre com posições, conexões, frame e câmera", async () => {
    const task = await createTask({ title: "Gravar os vocais" })
    const board = await createBoard({ title: "Produção" })
    const result = await saveBoardSnapshot(board.id, snapshot(board.version, task.id))
    expect(result.ok).toBe(true)
    const reopened = await getBoard(board.id)
    expect(reopened?.viewport).toEqual({ x: -120, y: 40, zoom: 1.25 })
    expect(reopened?.elements).toHaveLength(3)
    expect(reopened?.connections[0]).toMatchObject({ label: "depois", style: { arrowEnd: true } })
    expect(reopened?.elements.find((e) => e.kind === "record")?.ref).toEqual({ type: "task", id: task.id })
    expect((await globalSearch("fluxo")).map((r) => r.type)).toContain("board")
  })

  it("mover um elemento vinculado não altera a tarefa", async () => {
    const task = await createTask({ title: "Gravar os vocais", status: "in_progress" })
    const before = await getTask(task.id)
    const board = await createBoard({ title: "Produção" })
    const first = await saveBoardSnapshot(board.id, snapshot(board.version, task.id, 100))
    if (!first.ok) throw new Error("falhou")
    await saveBoardSnapshot(board.id, snapshot(first.version, task.id, 900))
    const after = await getTask(task.id)
    expect(after?.status).toBe("in_progress")
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime())
    expect((await getBoard(board.id))?.elements.find((e) => e.kind === "record")?.x).toBe(900)
  })

  it("recusa versão antiga e retrato inconsistente", async () => {
    const task = await createTask({ title: "x" })
    const board = await createBoard({})
    await saveBoardSnapshot(board.id, snapshot(board.version, task.id))
    expect((await saveBoardSnapshot(board.id, snapshot(board.version, task.id))).ok).toBe(false)
    const broken = snapshot(2, task.id)
    broken.connections[0]!.targetId = randomUUID()
    await expect(saveBoardSnapshot(board.id, broken)).rejects.toThrow(/conexão/)
  })

  it("excluir a tarefa deixa a referência indisponível em vez de sumir com o elemento", async () => {
    const task = await createTask({ title: "x" })
    const board = await createBoard({})
    await saveBoardSnapshot(board.id, snapshot(board.version, task.id))
    await deleteTask(task.id)
    const reopened = await getBoard(board.id)
    const record = reopened!.elements.find((e) => e.kind === "record")!
    expect(record.ref).toEqual({ type: "task", id: task.id })
    expect(await resolveRefs([record.ref!], today)).toEqual({})
  })
})

describe("busca global", () => {
  it("encontra por título e conteúdo em todos os tipos", async () => {
    await createTask({ title: "Comprar cordas" })
    await createProject({ title: "Turnê de cordas" })
    await createArea({ name: "Cordas e sopros" })
    const page = await createPage({ title: "Notas" })
    await savePageContent(page.id, { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "trocar as cordas do violão" }] }] }, baseVersion: page.version })
    await saveEntry(today, { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "As cordas chegaram" }] }] }, baseVersion: 0 })
    const results = await globalSearch("CORDAS")
    expect(new Set(results.map((r) => r.type))).toEqual(new Set(["task", "project", "area", "page", "journal"]))
    expect(results.find((r) => r.type === "page")?.snippet).toContain("cordas do violão")
    expect(await globalSearch("   ")).toEqual([])
  })
})
