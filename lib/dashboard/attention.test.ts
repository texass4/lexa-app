import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Activity, Client, Invoice, LegalDocument, Prazo, Process, Task } from "@/types"
import { changesSince, clientSignals, countByLevel, isStale, officeSignals, processSignals, type AttentionData } from "@/lib/dashboard/attention"

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

const prazo = (id: string, patch: Partial<Prazo> = {}): Prazo => ({
  ...base,
  id,
  processId: "p1",
  clientId: "c1",
  description: `Prazo ${id}`,
  fatalDate: "2026-10-10",
  internalDate: "2026-10-08",
  responsibleId: "u1",
  origin: "manual",
  status: "aberto",
  createdById: "u1",
  ...patch,
})

const empty = (patch: Partial<AttentionData> = {}): AttentionData => ({
  clients: [],
  processes: [],
  tasks: [],
  deadlines: [],
  appointments: [],
  documents: [],
  invoices: [],
  activities: [],
  ...patch,
})

describe("processSignals", () => {
  it("processo parado há mais de 60 dias pede verificação", () => {
    const p = process("p1", { lastMovementAt: "2026-06-01T10:00:00" })
    const [signal] = processSignals(empty({ processes: [p] }), p, NOW)
    assert.equal(signal.kind, "process-stale")
    assert.match(signal.title, /Sem movimentação há 115 dias/)
    assert.match(signal.detail ?? "", /sem consulta automática/)
  })

  it("consultado há pouco na fonte: sem movimentação não é processo abandonado", () => {
    const p = process("p1", {
      lastMovementAt: "2026-06-01T10:00:00",
      lastSyncedAt: "2026-09-23T03:10:00",
      source: { provider: "datajud" },
    })
    assert.deepEqual(processSignals(empty({ processes: [p] }), p, NOW), [])
    assert.equal(isStale(p, NOW), false)
  })

  it("acompanhado, mas sem consulta recente: alerta diferencia movimentação e consulta", () => {
    const old = process("p1", { lastMovementAt: "2026-06-01T10:00:00", lastSyncedAt: "2026-08-20T03:10:00", source: { provider: "datajud" } })
    const [signal] = processSignals(empty({ processes: [old] }), old, NOW)
    assert.equal(signal.kind, "process-stale")
    assert.match(signal.detail ?? "", /última consulta em 20\/08\/2026/)

    const never = process("p2", { lastMovementAt: "2026-06-01T10:00:00", source: { provider: "datajud" } })
    const [unchecked] = processSignals(empty({ processes: [never] }), never, NOW)
    assert.match(unchecked.detail ?? "", /ainda não consultado/)
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
    const p = process("p1", { status: "concluido", lastMovementAt: "2026-01-01T00:00:00" })
    const deadlines = [prazo("z", { fatalDate: "2026-09-24" })]
    assert.deepEqual(processSignals(empty({ processes: [p], deadlines }), p, NOW), [])
  })
})

describe("prazos (sinais)", () => {
  // Hoje é qui, 24/09/2026. Todos com tarefa vinculada, salvo quando o teste diz o contrário.
  const t = task("t1", { related: { type: "process", id: "p1" } })
  const withTask = (id: string, patch: Partial<Prazo>) => prazo(id, { taskId: "t1", ...patch })
  const signalsOf = (deadlines: Prazo[], tasks: Task[] = [t]) => {
    const p = process("p1")
    return processSignals(empty({ processes: [p], deadlines, tasks }), p, NOW).filter((s) => s.kind.startsWith("deadline"))
  }

  it("5 dias: alerta de verificação", () => {
    const [s] = signalsOf([withTask("a", { fatalDate: "2026-09-29" })])
    assert.equal(s.kind, "deadline-week")
    assert.equal(s.level, "warning")
    assert.equal(s.title, "Prazo vence em 5 dias")
    assert.equal(s.href, "/processos/p1")
  })

  it("6 dias ainda não gera alerta", () => {
    assert.deepEqual(signalsOf([withTask("a", { fatalDate: "2026-09-30" })]), [])
  })

  it("2 dias: alerta crítico", () => {
    const [s] = signalsOf([withTask("a", { fatalDate: "2026-09-26" })])
    assert.equal(s.kind, "deadline-soon")
    assert.equal(s.level, "critical")
    assert.equal(s.title, "Prazo vence em 2 dias")
  })

  it("hoje: alerta crítico do dia", () => {
    const [s] = signalsOf([withTask("a", { fatalDate: "2026-09-24" })])
    assert.equal(s.kind, "deadline-today")
    assert.equal(s.level, "critical")
    assert.equal(s.title, "Prazo vence hoje")
  })

  it("aberto e vencido continua crítico", () => {
    const [s] = signalsOf([withTask("a", { fatalDate: "2026-09-22" })])
    assert.equal(s.kind, "deadline-overdue")
    assert.equal(s.title, "Prazo venceu há 2 dias")
  })

  it("cumprido não gera sinal", () => {
    assert.deepEqual(signalsOf([prazo("a", { fatalDate: "2026-09-24", status: "cumprido" })]), [])
  })

  it("perdido não gera sinal", () => {
    assert.deepEqual(signalsOf([prazo("a", { fatalDate: "2026-09-26", status: "perdido" })]), [])
  })

  it("sem tarefa: 'Prazo sem tarefa', mesmo longe da data, com ação que vincula a tarefa ao prazo", () => {
    const [s] = signalsOf([prazo("a", { fatalDate: "2026-11-20", internalDate: "2026-11-18", responsibleId: "u2" })], [])
    assert.equal(s.kind, "deadline-no-task")
    assert.equal(s.title, "Prazo sem tarefa")
    assert.deepEqual(s.action, {
      type: "create-task",
      label: "Criar tarefa",
      processId: "p1",
      title: "Prazo a",
      prazoId: "a",
      date: "2026-11-18",
      assigneeId: "u2",
    })
  })

  it("tarefa vinculada que foi excluída conta como sem tarefa", () => {
    const [s] = signalsOf([prazo("a", { fatalDate: "2026-11-20", taskId: "apagada" })])
    assert.equal(s.kind, "deadline-no-task")
  })

  it("com tarefa vinculada: sem 'Prazo sem tarefa'", () => {
    assert.deepEqual(signalsOf([withTask("a", { fatalDate: "2026-11-20" })]), [])
  })

  it("múltiplos prazos: um sinal por prazo; o escritório agrupa acima de dois", () => {
    const deadlines = [
      withTask("hoje", { fatalDate: "2026-09-24" }),
      withTask("dois", { fatalDate: "2026-09-26" }),
      prazo("cinco", { fatalDate: "2026-09-29" }),
      withTask("longe", { fatalDate: "2026-12-01" }),
    ]
    assert.deepEqual(
      signalsOf(deadlines)
        .map((s) => s.id)
        .sort(),
      ["deadline-no-task:cinco", "deadline-soon:dois", "deadline-today:hoje", "deadline-week:cinco"],
    )

    const p = process("p1")
    const many = ["a", "b", "c"].map((id) => prazo(id, { fatalDate: "2026-11-20" }))
    const grouped = officeSignals(empty({ processes: [p], deadlines: many }), { now: NOW }).filter((s) => s.kind === "deadline-no-task")
    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].title, "3 prazos sem tarefa")
  })

  it("sem prazo: nenhum sinal de prazo", () => {
    assert.deepEqual(signalsOf([]), [])
  })

  it("prazo de outro processo não entra", () => {
    assert.deepEqual(signalsOf([withTask("a", { processId: "p2", fatalDate: "2026-09-24" })]), [])
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
      process("p2"),
    ]
    const deadlines = [prazo("hoje", { processId: "p2", fatalDate: "2026-09-24", taskId: "t1" })]
    const tasks = [task("t1", { related: { type: "process", id: "p2" } })]
    const levels = officeSignals(empty({ processes, deadlines, tasks }), { now: NOW }).map((s) => s.level)
    assert.deepEqual(levels, ["critical", "info"])
    assert.deepEqual(countByLevel(officeSignals(empty({ processes, deadlines, tasks }), { now: NOW })), { critical: 1, warning: 0, info: 1, done: 0 })
  })
})

describe("clientSignals", () => {
  it("junta processos, tarefas e valores em atraso do cliente", () => {
    const client = { ...base, id: "c1", name: "Ana" } as Client
    const data = empty({
      processes: [process("p1"), process("p2", { clientId: "outro" })],
      deadlines: [
        prazo("recurso", { fatalDate: "2026-09-26", taskId: "t1" }),
        prazo("x", { processId: "p2", clientId: "outro", fatalDate: "2026-09-24", taskId: "t1" }),
      ],
      tasks: [task("t1", { related: { type: "process", id: "p1" }, dueAt: "2026-09-25T18:00:00" })],
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

  it("sem Financeiro, pagamentos não aparecem em \"desde sua última visita\"", () => {
    const since = new Date(2026, 8, 22, 9, 0)
    const payment: Activity = {
      ...activity("pay", "2026-09-23T12:00:00", "u2"),
      type: "payment",
      message: "registrou um pagamento recebido.",
      detail: "Honorários · R$ 8.500,00",
    }
    const data = empty({ activities: [activity("a1", "2026-09-23T10:00:00", "u2"), payment] })
    const without = changesSince(data, since, { now: NOW, userId: "u1", can: (p) => p !== "finance.view" })
    assert.deepEqual(without.map((c) => c.id), ["activity:a1"])
    assert.ok(without.every((c) => !`${c.text} ${c.detail ?? ""}`.includes("R$")))
    const withFinance = changesSince(data, since, { now: NOW, userId: "u1", can: () => true })
    assert.ok(withFinance.some((c) => c.id === "activity:pay"))
  })

  it("agrupa as tarefas vencidas no intervalo numa linha só", () => {
    const since = new Date(2026, 8, 20, 9, 0)
    const data = empty({ tasks: [task("t1", { dueAt: "2026-09-23T18:00:00" }), task("t2", { dueAt: "2026-09-21T18:00:00" })] })
    const [change] = changesSince(data, since, { now: NOW, userId: "u1" })
    assert.equal(change.text, "2 tarefas venceram")
    assert.equal(change.href, "/tarefas?filtro=atrasadas")
  })
})
