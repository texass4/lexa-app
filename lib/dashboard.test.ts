import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Invoice, Prazo, Process, Task } from "@/types"
import { dashboardKpis, officeDigest, openTasksByTab, overdueInvoices, recentProcesses, shortAgo } from "./dashboard"

const NOW = new Date(2026, 9, 15, 12, 0) // 15/10/2026, quinta-feira, 12:00

const process = (id: string, patch: Partial<Process> = {}): Process =>
  ({
    id,
    organizationId: "o",
    createdAt: "2026-01-10T09:00:00",
    status: "em_andamento",
    lastMovementAt: "2026-01-10T09:00:00",
    movements: [],
    ...patch,
  }) as Process
const task = (id: string, dueAt: string, status: Task["status"] = "pendente"): Task =>
  ({ id, organizationId: "o", createdAt: "2026-10-01T09:00:00", title: id, dueAt, priority: "media", assigneeId: "u", status }) as Task
const invoice = (id: string, dueDate: string, status: Invoice["status"], amount = 1000, paidAt?: string): Invoice =>
  ({ id, organizationId: "o", createdAt: "2026-01-01T00:00:00", clientId: "c", description: id, amount, dueDate, status, paidAt }) as Invoice
const prazo = (id: string, processId: string, fatalDate: string, status: Prazo["status"] = "aberto"): Prazo =>
  ({
    id,
    organizationId: "o",
    createdAt: "2026-10-01T00:00:00",
    processId,
    description: id,
    fatalDate,
    internalDate: fatalDate,
    responsibleId: "u",
    origin: "manual",
    status,
    createdById: "u",
  }) as Prazo

describe("dashboardKpis", () => {
  it("conta totais e o que entrou no mês, sem processos concluídos", () => {
    const k = dashboardKpis(
      {
        clients: [{ createdAt: "2026-10-02T10:00:00" }, { createdAt: "2026-09-30T10:00:00" }, { createdAt: "2026-10-14T10:00:00" }],
        processes: [
          process("a", { createdAt: "2026-10-03T10:00:00" }),
          process("b"),
          process("c", { status: "concluido", createdAt: "2026-10-05T10:00:00" }),
        ],
        tasks: [
          task("t1", "2026-10-14T17:00:00"),
          task("t2", "2026-10-15T17:00:00"),
          task("t3", "2026-10-30T17:00:00"),
          task("t4", "2026-10-15T17:00:00", "concluida"),
        ],
        invoices: [
          invoice("i1", "2026-10-05", "pago", 3000, "2026-10-06T10:00:00"),
          invoice("i2", "2026-09-05", "pago", 2000, "2026-09-06T10:00:00"),
        ],
        deadlines: [],
      },
      NOW,
    )
    assert.deepEqual(k.clients, { total: 3, newThisMonth: 2 })
    assert.deepEqual(k.processes, { active: 2, newThisMonth: 2 })
    assert.deepEqual(k.tasks, { pending: 3, overdue: 1, thisWeek: 1 })
    assert.equal(k.finance.received, 3000)
    assert.equal(k.finance.growth, 50)
  })
})

describe("recentProcesses", () => {
  it("ordena pela movimentação mais recente e dá prioridade ao prazo próximo", () => {
    const list = recentProcesses(
      {
        processes: [
          process("velho", { lastMovementAt: "2026-08-01T10:00:00" }),
          process("ontem", { lastMovementAt: "2026-10-14T16:00:00" }),
          process("semana", { lastMovementAt: "2026-10-10T10:00:00" }),
          process("com-prazo", { lastMovementAt: "2026-09-20T10:00:00" }),
          process("concluido", { lastMovementAt: "2026-10-15T11:00:00", status: "concluido" }),
        ],
        deadlines: [prazo("p1", "com-prazo", "2026-10-17"), prazo("p2", "velho", "2026-10-16", "cumprido")],
      },
      NOW,
    )
    assert.deepEqual(
      list.map((r) => [r.process.id, r.state]),
      [
        ["ontem", "nova"],
        ["semana", "movimentacao"],
        ["com-prazo", "prazo"],
        ["velho", "sem-novidades"],
      ],
    )
  })
})

describe("shortAgo", () => {
  it("formata o tempo de forma compacta", () => {
    assert.equal(shortAgo("2026-10-15T11:46:00", NOW), "14 min")
    assert.equal(shortAgo("2026-10-15T09:00:00", NOW), "3 h")
    assert.equal(shortAgo("2026-10-12T09:00:00", NOW), "3 d")
    assert.equal(shortAgo("2026-08-01T09:00:00", NOW), "01/08")
    assert.equal(shortAgo(undefined, NOW), "—")
  })
})

describe("officeDigest", () => {
  it("resume processos ativos, movimentações, prazos e parcelas em atraso", () => {
    const d = officeDigest(
      {
        processes: [process("a", { lastMovementAt: "2026-10-14T10:00:00" }), process("b"), process("c", { status: "concluido" })],
        deadlines: [prazo("p1", "a", "2026-10-18"), prazo("p2", "a", "2026-11-30"), prazo("p3", "b", "2026-10-16", "cumprido")],
        invoices: [invoice("i1", "2026-10-01", "pendente"), invoice("i2", "2026-10-30", "pendente")],
      },
      NOW,
    )
    assert.deepEqual(d, { activeProcesses: 2, recentMovements: 1, upcomingPrazos: 1, overdueInvoices: 1 })
  })
})

describe("openTasksByTab e overdueInvoices", () => {
  it("separa as tarefas abertas por prazo", () => {
    const tabs = openTasksByTab(
      [
        task("atrasada", "2026-10-13T17:00:00"),
        task("hoje", "2026-10-15T18:00:00"),
        task("amanha", "2026-10-16T09:00:00"),
        task("feita", "2026-10-15T09:00:00", "concluida"),
      ],
      NOW,
    )
    assert.deepEqual(
      tabs.todas.map((t) => t.id),
      ["atrasada", "hoje", "amanha"],
    )
    assert.deepEqual([tabs.atrasadas.length, tabs.hoje.length, tabs.amanha.length], [1, 1, 1])
  })

  it("lista parcelas vencidas da mais antiga para a mais nova", () => {
    const list = overdueInvoices(
      [invoice("a", "2026-10-10", "pendente"), invoice("b", "2026-09-25", "pendente"), invoice("c", "2026-10-01", "pago")],
      NOW,
    )
    assert.deepEqual(
      list.map((x) => [x.invoice.id, x.daysLate]),
      [
        ["b", 20],
        ["a", 5],
      ],
    )
  })
})
