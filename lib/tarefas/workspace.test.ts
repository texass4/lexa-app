import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  activeChips,
  applyKpi,
  columnForStatus,
  columnOfTask,
  dueGroup,
  EMPTY_FILTERS,
  isKpiActive,
  kpiCounts,
  matchesTask,
  monthWeeks,
  readWorkspace,
  removeChip,
  sortTasks,
  tasksByDay,
  workspaceParams,
  type MatchContext,
  type WorkspaceState,
} from "./workspace"
import type { Task, TaskColumn } from "@/types"

const now = new Date(2026, 9, 15, 10) // quinta, 15/10/2026

const col = (id: string, order: number, isDone = false): TaskColumn => ({
  id,
  order,
  isDone,
  name: id,
  color: "#000",
  organizationId: "o",
  createdAt: "",
})
const columns = [col("fazer", 0), col("andamento", 1), col("feito", 2, true)]

const task = (over: Partial<Task>): Task =>
  ({
    id: "t1",
    organizationId: "o",
    createdAt: "2026-10-01T09:00:00",
    title: "Protocolar manifestação",
    dueAt: "2026-10-15T18:00:00",
    priority: "media",
    assigneeId: "u1",
    status: "pendente",
    ...over,
  }) as Task

const ctx: MatchContext = { now, columns, clientOfProcess: (id) => (id === "p1" ? "c1" : undefined) }

describe("Tarefas: estado da área na URL", () => {
  it("lê e escreve o mesmo estado", () => {
    const state: WorkspaceState = {
      view: "lista",
      scope: "escritorio",
      filters: {
        columns: ["andamento"],
        priorities: ["alta"],
        assignees: ["u2"],
        due: "semana",
        clientId: "c1",
        processId: "p1",
        situation: "pendentes",
      },
    }
    assert.deepEqual(readWorkspace(workspaceParams(state)), state)
  })

  it("mantém os links antigos (?filtro= abre a lista filtrada; ?escopo=escritorio)", () => {
    const s = readWorkspace(new URLSearchParams("filtro=atrasadas&escopo=escritorio"))
    assert.equal(s.view, "lista")
    assert.equal(s.scope, "escritorio")
    assert.equal(s.filters.due, "atrasadas")
    assert.equal(s.filters.situation, "pendentes")
    assert.equal(readWorkspace(new URLSearchParams(""), "calendario").view, "calendario")
  })

  it("indicador vira filtro visível e removível", () => {
    const f = applyKpi(EMPTY_FILTERS, "alta")
    assert.equal(isKpiActive(f, "alta"), true)
    assert.equal(isKpiActive(f, "hoje"), false)
    const chips = activeChips(f)
    assert.deepEqual(chips, [{ key: "priorities", value: "alta" }, { key: "situation" }])
    assert.deepEqual(removeChip(f, chips[0]).priorities, [])
    assert.equal(removeChip(f, chips[1]).situation, "todas")
  })
})

describe("Tarefas: coluna e situação", () => {
  it("coluna inexistente (excluída) não some: vai para a primeira da situação", () => {
    assert.equal(columnOfTask(task({ columnId: "andamento" }), columns)?.id, "andamento")
    assert.equal(columnOfTask(task({ columnId: "apagada" }), columns)?.id, "fazer")
    assert.equal(columnOfTask(task({ columnId: "apagada", status: "concluida" }), columns)?.id, "feito")
    assert.equal(columnOfTask(task({}), columns)?.id, "fazer")
  })

  it("concluir leva à coluna que conclui; reabrir, à primeira aberta", () => {
    assert.equal(columnForStatus(columns, true)?.id, "feito")
    assert.equal(columnForStatus(columns, false)?.id, "fazer")
  })
})

describe("Tarefas: filtros e prazos", () => {
  it("grupos de prazo pelo dia (sem inventar horário)", () => {
    assert.equal(dueGroup(task({ dueAt: "2026-10-14T23:00:00" }), now), "atrasadas")
    assert.equal(dueGroup(task({ dueAt: "2026-10-15T08:00:00" }), now), "hoje")
    assert.equal(dueGroup(task({ dueAt: "2026-10-16T08:00:00" }), now), "amanha")
    assert.equal(dueGroup(task({ dueAt: "2026-10-18T08:00:00" }), now), "semana")
    assert.equal(dueGroup(task({ dueAt: "2026-10-19T08:00:00" }), now), "proximas")
  })

  it("concluída nunca conta como atrasada", () => {
    const f = { ...EMPTY_FILTERS, due: "atrasadas" as const }
    assert.equal(matchesTask(task({ dueAt: "2026-10-01T18:00:00" }), f, ctx), true)
    assert.equal(matchesTask(task({ dueAt: "2026-10-01T18:00:00", status: "concluida" }), f, ctx), false)
    assert.deepEqual(kpiCounts([task({ dueAt: "2026-10-01T18:00:00", status: "concluida", priority: "alta" })], now), {
      atrasadas: 0,
      hoje: 0,
      alta: 0,
      concluidas: 1,
    })
  })

  it("filtros combinam: coluna, prioridade, responsável, cliente (inclusive pelo processo) e busca", () => {
    const t = task({ columnId: "andamento", priority: "alta", assigneeId: "u2", related: { type: "process", id: "p1" } })
    assert.equal(matchesTask(t, { ...EMPTY_FILTERS, columns: ["andamento"], priorities: ["alta"], assignees: ["u2"], clientId: "c1" }, ctx), true)
    assert.equal(matchesTask(t, { ...EMPTY_FILTERS, clientId: "c9" }, ctx), false)
    assert.equal(matchesTask(t, { ...EMPTY_FILTERS, processId: "p1" }, ctx), true)
    assert.equal(matchesTask(t, { ...EMPTY_FILTERS, columns: ["fazer"] }, ctx), false)
    assert.equal(matchesTask(t, EMPTY_FILTERS, ctx, "manifestacao"), true)
    assert.equal(matchesTask(t, EMPTY_FILTERS, ctx, "recurso"), false)
  })

  it("indicadores contam só pendentes nos prazos e na prioridade", () => {
    const tasks = [
      task({ id: "a", dueAt: "2026-10-10T18:00:00", priority: "alta" }),
      task({ id: "b", dueAt: "2026-10-15T18:00:00" }),
      task({ id: "c", status: "concluida" }),
    ]
    assert.deepEqual(kpiCounts(tasks, now), { atrasadas: 1, hoje: 1, alta: 1, concluidas: 1 })
  })
})

describe("Tarefas: ordem e calendário", () => {
  it("ordena por prioridade, status (ordem das colunas) e título; empate pelo prazo", () => {
    const a = task({ id: "a", title: "Ação 10", priority: "baixa", columnId: "feito", dueAt: "2026-10-20T18:00:00" })
    const b = task({ id: "b", title: "ação 2", priority: "alta", columnId: "fazer", dueAt: "2026-10-18T18:00:00" })
    const opts = { columns, assigneeName: () => "" }
    assert.deepEqual(
      sortTasks([a, b], "prioridade", "asc", opts).map((t) => t.id),
      ["b", "a"],
    )
    assert.deepEqual(
      sortTasks([a, b], "status", "asc", opts).map((t) => t.id),
      ["b", "a"],
    )
    assert.deepEqual(
      sortTasks([a, b], "titulo", "asc", opts).map((t) => t.id),
      ["b", "a"],
    )
    assert.deepEqual(
      sortTasks([a, b], "prazo", "desc", opts).map((t) => t.id),
      ["a", "b"],
    )
  })

  it("mês em semanas de segunda a domingo; tarefas pelo dia do prazo", () => {
    const weeks = monthWeeks(2026, 9)
    assert.equal(weeks[0][0].getDay(), 1)
    assert.ok(weeks.some((w) => w.some((d) => d.getMonth() === 9 && d.getDate() === 31)))
    const byDay = tasksByDay([task({ id: "x", dueAt: "2026-10-20T09:00:00" }), task({ id: "y", dueAt: "2026-10-20T18:00:00" })])
    assert.deepEqual(
      byDay.get("2026-10-20")?.map((t) => t.id),
      ["x", "y"],
    )
  })
})
