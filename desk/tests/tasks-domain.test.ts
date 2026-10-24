import { describe, expect, it } from "vitest"
import { completionForStatus, isOverdue, nextOccurrenceDates, positionBetween, projectProgress } from "@/lib/domain/tasks"

const today = "2026-10-24"

describe("regras de tarefa", () => {
  it("atrasada: aberta com prazo antes de hoje", () => {
    expect(isOverdue({ status: "todo", dueDate: "2026-10-23" }, today)).toBe(true)
    expect(isOverdue({ status: "in_progress", dueDate: "2026-10-01" }, today)).toBe(true)
  })

  it("não é atrasada: sem prazo, prazo hoje, concluída ou arquivada", () => {
    expect(isOverdue({ status: "todo", dueDate: null }, today)).toBe(false)
    expect(isOverdue({ status: "todo", dueDate: today }, today)).toBe(false)
    expect(isOverdue({ status: "done", dueDate: "2026-10-01" }, today)).toBe(false)
    expect(isOverdue({ status: "archived", dueDate: "2026-10-01" }, today)).toBe(false)
  })

  it("concluir registra a data; reabrir remove", () => {
    const now = new Date("2026-10-24T12:00:00Z")
    expect(completionForStatus("done", { status: "todo", completedAt: null }, now)).toEqual(now)
    expect(completionForStatus("todo", { status: "done", completedAt: now }, now)).toBeNull()
    expect(completionForStatus("in_progress", { status: "done", completedAt: now }, now)).toBeNull()
  })

  it("concluir de novo mantém a data original; arquivar preserva a conclusão", () => {
    const first = new Date("2026-10-20T10:00:00Z")
    const later = new Date("2026-10-24T12:00:00Z")
    expect(completionForStatus("done", { status: "done", completedAt: first }, later)).toEqual(first)
    expect(completionForStatus("archived", { status: "done", completedAt: first }, later)).toEqual(first)
  })

  it("progresso ignora arquivadas e não inventa porcentagem sem tarefas", () => {
    expect(projectProgress([])).toBeNull()
    expect(projectProgress([{ status: "archived" }])).toBeNull()
    expect(projectProgress([{ status: "done" }, { status: "todo" }, { status: "archived" }, { status: "in_progress" }])).toEqual({ total: 3, done: 1, percent: 33 })
  })

  it("recorrência avança o prazo e mantém a distância do início", () => {
    expect(nextOccurrenceDates({ startDate: "2026-10-20", dueDate: "2026-10-24" }, { freq: "weekly", interval: 1 }, today)).toEqual({
      startDate: "2026-10-27",
      dueDate: "2026-10-31",
    })
    expect(nextOccurrenceDates({ startDate: null, dueDate: "2026-01-31" }, { freq: "monthly", interval: 1 }, today)).toEqual({ startDate: null, dueDate: "2026-02-28" })
    expect(nextOccurrenceDates({ startDate: null, dueDate: null }, { freq: "daily", interval: 2 }, today)).toEqual({ startDate: null, dueDate: "2026-10-26" })
  })

  it("posição entre vizinhos no kanban", () => {
    expect(positionBetween(null, null)).toBe(1024)
    expect(positionBetween(10, 20)).toBe(15)
    expect(positionBetween(null, 20)).toBeLessThan(20)
    expect(positionBetween(10, null)).toBeGreaterThan(10)
  })
})
