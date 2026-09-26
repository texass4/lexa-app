import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Activity, Client, Invoice, Process, Task } from "@/types"
import type { PersistedState } from "@/lib/store/storage"
import {
  clientFinance,
  clientHub,
  delinquentClientIds,
  financeSummary,
  invoiceStatus,
  lastActivityByClient,
  monthlyRevenue,
  nextClientDeadline,
  relatedClientId,
  revenueByArea,
} from "./selectors"

const NOW = new Date(2026, 8, 24, 10, 0) // 24/09/2026

const invoice = (id: string, patch: Partial<Invoice>): Invoice => ({
  id,
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  clientId: "c1",
  description: "Honorários",
  amount: 1000,
  dueDate: "2026-09-10",
  status: "pendente",
  ...patch,
})

const client = (id: string, area: Client["area"]): Client => ({
  id,
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  name: id,
  kind: "PF",
  document: "",
  email: "",
  phone: "",
  address: "",
  area,
  ownerId: "u",
  status: "ativo",
  clientSince: "2026-01-01",
  lastActivityAt: "2026-01-01T00:00:00",
})

describe("financeiro calculado das faturas", () => {
  it("sem faturas, tudo zerado — nada de número inventado", () => {
    const series = monthlyRevenue([], NOW)
    assert.equal(series.length, 6)
    assert.ok(series.every((m) => m.prevista === 0 && m.recebida === 0))
    const summary = financeSummary([], NOW)
    assert.equal(summary.expected, 0)
    assert.equal(summary.received, 0)
    assert.equal(summary.growth, undefined)
    assert.equal(summary.defaultRate, 0)
    assert.deepEqual(revenueByArea([], []), [])
  })

  it("monta os meses até o atual, com rótulos reais", () => {
    const series = monthlyRevenue([], NOW)
    assert.equal(series[0].key, "2026-04")
    assert.equal(series[5].key, "2026-09")
    assert.equal(series[5].month, "Set")
    assert.equal(series[5].label, "Setembro de 2026")
  })

  it("previsto pelo vencimento, recebido pelo pagamento", () => {
    const invoices = [
      invoice("a", { dueDate: "2026-09-05", amount: 2000 }),
      invoice("b", { dueDate: "2026-08-20", amount: 500, status: "pago", paidAt: "2026-09-02" }),
      invoice("c", { dueDate: "2026-08-10", amount: 800, status: "pago", paidAt: "2026-08-11" }),
    ]
    const [aug, sep] = monthlyRevenue(invoices, NOW, 2)
    assert.equal(sep.prevista, 2000)
    assert.equal(sep.recebida, 500)
    assert.equal(aug.prevista, 1300)
    assert.equal(aug.recebida, 800)

    const summary = financeSummary(invoices, NOW)
    assert.equal(summary.month, "Setembro de 2026")
    assert.equal(summary.growth, ((500 - 800) / 800) * 100)
  })

  it("inadimplência é o vencido sobre o faturado", () => {
    const invoices = [invoice("a", { amount: 750, status: "atrasado" }), invoice("b", { amount: 250, status: "pago", paidAt: "2026-09-01" })]
    assert.equal(financeSummary(invoices, NOW).defaultRate, 75)
  })

  it("receita por área usa só o recebido no ano, da maior para a menor", () => {
    const clients = [client("c1", "Cível"), client("c2", "Trabalhista")]
    const invoices = [
      invoice("a", { clientId: "c1", amount: 300, status: "pago", paidAt: "2026-03-01" }),
      invoice("b", { clientId: "c2", amount: 900, status: "pago", paidAt: "2026-05-01" }),
      invoice("c", { clientId: "c2", amount: 5000, status: "pendente" }),
      invoice("d", { clientId: "c1", amount: 7000, status: "pago", paidAt: "2025-12-01" }),
    ]
    const byArea = revenueByArea(invoices, clients, 2026)
    assert.deepEqual(
      byArea.map((a) => [a.area, a.amount, a.pct]),
      [
        ["Trabalhista", 900, 75],
        ["Cível", 300, 25],
      ],
    )
  })
})

describe("hub do cliente", () => {
  const base = { organizationId: "org", createdAt: "2026-01-01T00:00:00" }
  const process = (id: string, clientId: string, patch: Partial<Process> = {}): Process => ({
    ...base,
    id,
    number: id,
    code: `#${id}`,
    clientId,
    area: "Cível",
    type: "Ação",
    court: "",
    district: "",
    opposingParty: "",
    status: "em_andamento",
    ownerId: "u",
    claimValue: 0,
    distributedAt: "2026-01-01",
    lastMovementAt: "2026-01-01T00:00:00",
    movements: [],
    ...patch,
  })
  const task = (id: string, related: Task["related"], patch: Partial<Task> = {}): Task => ({
    ...base,
    id,
    title: id,
    dueAt: "2026-10-01T18:00:00",
    priority: "media",
    assigneeId: "u",
    status: "pendente",
    related,
    ...patch,
  })
  const activity = (id: string, at: string, patch: Partial<Activity>): Activity => ({ ...base, id, at, type: "task", message: id, ...patch })
  const empty: PersistedState = {
    clients: [client("c1", "Cível"), client("c2", "Cível")],
    processes: [],
    tasks: [],
    taskColumns: [],
    appointments: [],
    appointmentCategories: [],
    documents: [],
    invoices: [],
    activities: [],
    notifications: [],
  }

  it("sem vínculos, tudo vazio", () => {
    const hub = clientHub(empty, "c1")
    assert.deepEqual([hub.processes, hub.tasks, hub.documents, hub.appointments, hub.activities], [[], [], [], [], []])
    const f = clientFinance(empty, "c1", NOW)
    assert.deepEqual([f.contracted, f.paid, f.open, f.overdue, f.upcoming.length], [0, 0, 0, 0, 0])
  })

  it("itens vinculados só ao processo também são do cliente", () => {
    const s: PersistedState = {
      ...empty,
      processes: [process("p1", "c1"), process("p2", "c2"), process("p3", "c1", { status: "concluido" })],
      tasks: [task("t1", { type: "client", id: "c1" }), task("t2", { type: "process", id: "p1" }), task("t3", { type: "process", id: "p2" })],
      documents: [
        {
          ...base,
          id: "d1",
          name: "d1",
          kind: "Contrato",
          extension: "pdf",
          sizeBytes: 1,
          processId: "p1",
          uploadedById: "u",
          uploadedAt: "2026-09-01T10:00:00",
        },
        {
          ...base,
          id: "d2",
          name: "d2",
          kind: "Contrato",
          extension: "pdf",
          sizeBytes: 1,
          clientId: "c2",
          uploadedById: "u",
          uploadedAt: "2026-09-02T10:00:00",
        },
      ],
      appointments: [{ ...base, id: "a1", title: "a1", start: "2026-10-01T10:00:00", end: "2026-10-01T11:00:00", ownerId: "u", processId: "p1" }],
      activities: [activity("x1", "2026-09-01T10:00:00", { processId: "p1" }), activity("x2", "2026-09-03T10:00:00", { clientId: "c2" })],
    }
    const hub = clientHub(s, "c1")
    assert.deepEqual(
      hub.processes.map((p) => p.id),
      ["p1", "p3"],
    )
    assert.deepEqual(
      hub.activeProcesses.map((p) => p.id),
      ["p1"],
    )
    assert.deepEqual(hub.tasks.map((t) => t.id).sort(), ["t1", "t2"])
    assert.deepEqual(
      hub.documents.map((d) => d.id),
      ["d1"],
    )
    assert.deepEqual(
      hub.appointments.map((a) => a.id),
      ["a1"],
    )
    assert.deepEqual(
      hub.activities.map((a) => a.id),
      ["x1"],
    )
    assert.equal(relatedClientId(s, { type: "process", id: "p2" }), "c2")
    assert.equal(lastActivityByClient(s).get("c1"), "2026-09-01T10:00:00")
  })

  it("parcela a vencer com vencimento passado conta como atrasada", () => {
    const invoices = [
      invoice("a", { dueDate: "2026-09-10", amount: 300 }),
      invoice("b", { dueDate: "2026-10-10", amount: 200 }),
      invoice("c", { dueDate: "2026-09-01", amount: 100, status: "pago", paidAt: "2026-09-01" }),
      invoice("d", { clientId: "c2", dueDate: "2026-11-01", amount: 999 }),
    ]
    assert.equal(invoiceStatus(invoices[0], NOW), "atrasado")
    assert.equal(invoiceStatus(invoices[1], NOW), "pendente")
    // Vence hoje ainda não está atrasada.
    assert.equal(invoiceStatus(invoice("e", { dueDate: "2026-09-24" }), NOW), "pendente")
    const f = clientFinance({ invoices }, "c1", NOW)
    assert.deepEqual([f.contracted, f.paid, f.open, f.overdue, f.overdueCount], [600, 100, 500, 300, 1])
    assert.deepEqual(
      f.upcoming.map((i) => i.id),
      ["b"],
    )
    assert.deepEqual([...delinquentClientIds(invoices, NOW)], ["c1"])
  })

  it("próximo prazo ignora processos concluídos e mostra primeiro o que já venceu", () => {
    const processes = [
      process("p1", "c1", { nextDeadline: { date: "2026-09-20", title: "vencido" } }),
      process("p2", "c1", { nextDeadline: { date: "2026-10-05", title: "depois" } }),
      process("p3", "c1", { nextDeadline: { date: "2026-09-30", title: "antes" } }),
      process("p4", "c1", { status: "concluido", nextDeadline: { date: "2026-09-25", title: "concluído" } }),
    ]
    assert.equal(nextClientDeadline(processes)?.id, "p1")
    assert.equal(nextClientDeadline(processes.slice(1))?.id, "p3")
    assert.equal(nextClientDeadline([]), undefined)
  })
})
