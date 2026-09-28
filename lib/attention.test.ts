import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Activity, Client, Invoice, LegalDocument, Process, Task } from "@/types"
import { changesSince, clientSignals, countByLevel, officeSignals, processSignals, type AttentionData } from "./attention"

const NOW = new Date(2026, 8, 24, 10, 0) // qui, 24/09/2026 10:00

const base = { organizationId: "org", createdAt: "2026-01-01T00:00:00" }

const process = (id: string, patch: Partial<Process> = {}): Process => ({
  ...base,
  id,
  number: `0000000-00.2026.8.26.000${id.length}`,
  code: id.toUpperCase(),
  clientId: "c1",
  area: "Cível",
  type: "Procedimento comum",
  court: "1ª Vara",
  district: "São Paulo",
  opposingParty: "Parte",
  status: "em_andamento",
  ownerId: "u1",
  claimValue: 0,
  distributedAt: "2026-01-01",
  lastMovementAt: "2026-08-01T10:00:00",
  movements: [],
  ...patch,
})

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  ...base,
  id,
  title: `Tarefa ${id}`,
  dueAt: "2026-09-30T18:00:00",
  priority: "media",
  assigneeId: "u1",
  status: "pendente",
  ...patch,
})

const empty = (patch: Partial<AttentionData> = {}): AttentionData => ({
  clients: [],
  processes: [],
  tasks: [],
  appointments: [],
  documents: [],
  invoices: [],
  activities: [],
  ...patch,
})

describe("processSignals", () => {
  it("prazo amanhã sem tarefa aberta é crítico e oferece criar tarefa", () => {
    const p = process("p1", { nextDeadline: { date: "2026-09-25", title: "Contestação" } })
    const [signal] = processSignals(empty({ processes: [p] }), p, NOW)
    assert.equal(signal.level, "critical")
    assert.equal(signal.title, "Prazo vence amanhã")
    assert.match(signal.detail ?? "", /sem tarefa vinculada/)
    assert.equal(signal.action?.type, "create-task")
  })

  it("prazo com tarefa aberta não sugere criar outra", () => {
    const p = process("p1", { nextDeadline: { date: "2026-09-29", title: "Réplica" } })
    const t = task("t1", { related: { type: "process", id: "p1" } })
    const signals = processSignals(empty({ processes: [p], tasks: [t] }), p, NOW)
    assert.equal(signals.length, 1)
    assert.equal(signals[0].level, "warning")
    assert.equal(signals[0].action, undefined)
  })

  it("prazo distante não gera sinal", () => {
    const p = process("p1", { nextDeadline: { date: "2026-11-20", title: "Audiência" } })
    assert.deepEqual(processSignals(empty({ processes: [p] }), p, NOW), [])
  })

  it("processo parado há mais de 60 dias pede verificação", () => {
    const p = process("p1", { lastMovementAt: "2026-06-01T10:00:00" })
    const [signal] = processSignals(empty({ processes: [p] }), p, NOW)
    assert.equal(signal.kind, "process-stale")
    assert.match(signal.title, /Sem movimentação há 115 dias/)
  })

  it("movimentação recente de julgamento pede revisão; de tramitação só informa", () => {
    const judged = process("p1", {
      lastMovementAt: "2026-09-22T10:00:00",
      movements: [{ id: "m1", at: "2026-09-22T10:00:00", title: "Julgado procedente o pedido", kind: "decision" }],
    })
    const [review] = processSignals(empty({ processes: [judged] }), judged, NOW)
    assert.equal(review.kind, "process-moved")
    assert.equal(review.level, "warning")
    assert.equal(review.action?.type, "create-task")

    const moved = process("p2", {
      lastMovementAt: "2026-09-22T10:00:00",
      movements: [{ id: "m2", at: "2026-09-22T10:00:00", title: "Remetidos os Autos", kind: "other" }],
    })
    const [info] = processSignals(empty({ processes: [moved] }), moved, NOW)
    assert.equal(info.level, "info")
  })

  it("processo concluído não gera sinais", () => {
    const p = process("p1", { status: "concluido", nextDeadline: { date: "2026-09-24", title: "Prazo" }, lastMovementAt: "2026-01-01T00:00:00" })
    assert.deepEqual(processSignals(empty({ processes: [p] }), p, NOW), [])
  })
})

describe("officeSignals", () => {
  it("considera só as tarefas de quem olha e agrupa acima de dois", () => {
    const tasks = [
      task("a", { dueAt: "2026-09-20T18:00:00" }),
      task("b", { dueAt: "2026-09-21T18:00:00" }),
      task("c", { dueAt: "2026-09-22T18:00:00" }),
      task("d", { dueAt: "2026-09-20T18:00:00", assigneeId: "u2" }),
    ]
    const signals = officeSignals(empty({ tasks }), { now: NOW, userId: "u1" })
    const overdue = signals.filter((s) => s.kind === "task-overdue")
    assert.equal(overdue.length, 1)
    assert.equal(overdue[0].count, 3)
    assert.equal(overdue[0].title, "3 tarefas atrasadas")
    assert.equal(overdue[0].href, "/tarefas?filtro=atrasadas")
  })

  it("respeita permissões: sem financeiro, nada de faturas", () => {
    const invoices: Invoice[] = [
      { ...base, id: "i1", clientId: "c1", description: "Honorários", amount: 500, dueDate: "2026-09-01", status: "atrasado" },
    ]
    assert.equal(officeSignals(empty({ invoices }), { now: NOW }).length, 1)
    assert.equal(officeSignals(empty({ invoices }), { now: NOW, can: (p) => p !== "finance.view" }).length, 0)
  })

  it("documento novo enviado pela própria pessoa não vira sinal", () => {
    const doc = (id: string, by: string): LegalDocument => ({
      ...base,
      id,
      name: `${id}.pdf`,
      kind: "Contrato",
      extension: "pdf",
      sizeBytes: 1,
      uploadedById: by,
      uploadedAt: "2026-09-23T10:00:00",
    })
    const signals = officeSignals(empty({ documents: [doc("d1", "u1"), doc("d2", "u2")] }), { now: NOW, userId: "u1" })
    assert.equal(signals.length, 1)
    assert.equal(signals[0].detail, "d2.pdf")
  })

  it("ordena do crítico ao informativo", () => {
    const processes = [
      process("p1", { lastMovementAt: "2026-09-23T10:00:00", movements: [{ id: "m", at: "2026-09-23T10:00:00", title: "Remetidos os Autos" }] }),
      process("p2", { nextDeadline: { date: "2026-09-24", title: "Prazo" } }),
    ]
    const levels = officeSignals(empty({ processes }), { now: NOW }).map((s) => s.level)
    assert.deepEqual(levels, ["critical", "info"])
    assert.deepEqual(countByLevel(officeSignals(empty({ processes }), { now: NOW })), { critical: 1, warning: 0, info: 1, done: 0 })
  })
})

describe("clientSignals", () => {
  it("junta processos, tarefas e valores em atraso do cliente", () => {
    const client = { ...base, id: "c1", name: "Ana" } as Client
    const data = empty({
      processes: [
        process("p1", { nextDeadline: { date: "2026-09-26", title: "Recurso" } }),
        process("p2", { clientId: "outro", nextDeadline: { date: "2026-09-24", title: "X" } }),
      ],
      invoices: [{ ...base, id: "i1", clientId: "c1", description: "Honorários", amount: 800, dueDate: "2026-09-01", status: "atrasado" }],
    })
    const signals = clientSignals(data, client, NOW)
    assert.deepEqual(signals.map((s) => s.kind).sort(), ["deadline-soon", "invoice-overdue"])
  })
})

describe("changesSince", () => {
  const activity = (id: string, at: string, actorUserId: string): Activity => ({
    ...base,
    id,
    at,
    type: "document",
    message: "adicionou um documento.",
    actor: "Bia",
    actorUserId,
  })

  it("mostra o que outras pessoas fizeram e as tarefas que venceram no intervalo", () => {
    const since = new Date(2026, 8, 22, 9, 0)
    const data = empty({
      activities: [
        activity("a1", "2026-09-23T10:00:00", "u2"),
        activity("a2", "2026-09-23T11:00:00", "u1"),
        activity("a3", "2026-09-20T10:00:00", "u2"),
      ],
      tasks: [
        task("t1", { dueAt: "2026-09-23T18:00:00" }),
        task("t2", { dueAt: "2026-09-21T18:00:00" }),
        task("t3", { dueAt: "2026-09-23T18:00:00", status: "concluida" }),
      ],
    })
    const changes = changesSince(data, since, { now: NOW, userId: "u1" })
    assert.deepEqual(
      changes.map((c) => c.id),
      ["due:t1", "activity:a1"],
    )
  })

  it("agrupa as tarefas vencidas no intervalo numa linha só", () => {
    const since = new Date(2026, 8, 20, 9, 0)
    const data = empty({ tasks: [task("t1", { dueAt: "2026-09-23T18:00:00" }), task("t2", { dueAt: "2026-09-21T18:00:00" })] })
    const [change] = changesSince(data, since, { now: NOW, userId: "u1" })
    assert.equal(change.text, "2 tarefas venceram")
    assert.equal(change.href, "/tarefas?filtro=atrasadas")
  })
})
