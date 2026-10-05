import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { activitiesOf, closedPrazos, completedTasks, olderDocuments, olderInvoices, taskSearch } from "./history-lists"
import { initialScopes, searchFilter, windowBounds } from "./storage"

const now = new Date(2026, 9, 5, 10)
const bounds = windowBounds(now)
const windowOf = (key: string) => initialScopes(now).find((s) => s.key === key)!

describe("listas do histórico: o complemento exato da janela da abertura", () => {
  it("tarefas: concluídas antes dos 30 dias (ou sem data), da pessoa ou do escritório", () => {
    assert.equal(windowOf("tasks").filter?.or, `data->>status.eq.pendente,data->>completedAt.gte.${bounds.month}`)
    const mine = completedTasks(bounds, "u1")
    assert.deepEqual(mine.scope.filter, {
      neq: [["data->>status", "pendente"]],
      or: `data->>completedAt.lt.${bounds.month},data->>completedAt.is.null`,
      eq: [["data->>assigneeId", "u1"]],
    })
    assert.equal(mine.scope.order, "data->>completedAt")
    assert.notEqual(completedTasks(bounds).id, mine.id)
    assert.equal(mine.cursor({ completedAt: "2026-01-02" } as never), "2026-01-02")
    assert.equal(mine.cursor({} as never), "")
  })

  it("busca de tarefas procura em tudo (janela e histórico)", () => {
    const list = taskSearch("minuta", searchFilter("minuta")!, "u1")
    assert.equal(list.scope.filter?.or, "search.ilike.*minuta*")
    assert.deepEqual(list.scope.filter?.eq, [["data->>assigneeId", "u1"]])
    assert.equal(list.scope.filter?.neq, undefined)
  })

  it("prazos encerrados antes da janela, por situação e responsável", () => {
    assert.equal(windowOf("deadlines").filter?.or, `data->>status.eq.aberto,data->>closedAt.gte.${bounds.month}`)
    assert.deepEqual(closedPrazos(bounds, "perdido", "u2").scope.filter, {
      eq: [
        ["data->>status", "perdido"],
        ["data->>responsibleId", "u2"],
      ],
      or: `data->>closedAt.lt.${bounds.month},data->>closedAt.is.null`,
    })
  })

  it("documentos anteriores à janela, por tipo e cliente", () => {
    assert.deepEqual(windowOf("documents").filter?.gte, [["data->>uploadedAt", bounds.documents]])
    assert.deepEqual(olderDocuments(bounds, { kind: "Laudo" }, "c1").scope.filter, {
      lt: [["data->>uploadedAt", bounds.documents]],
      eq: [
        ["data->>kind", "Laudo"],
        ["data->>clientId", "c1"],
      ],
    })
    assert.deepEqual(olderDocuments(bounds, { notIn: ["Contrato"] }).scope.filter?.notIn, [["data->>kind", ["Contrato"]]])
  })

  it("lançamentos: recebidos e cancelados fora da janela do Financeiro", () => {
    assert.match(
      windowOf("invoices").filter!.or!,
      new RegExp(`status\\.in\\.\\(pendente,atrasado\\),data->>dueDate\\.gte\\.${bounds.finance},data->>paidAt\\.gte\\.${bounds.finance}`),
    )
    const paid = olderInvoices(bounds, "recebidos")
    assert.deepEqual(paid.scope.filter, {
      eq: [["data->>status", "pago"]],
      lt: [["data->>dueDate", bounds.finance]],
      or: `data->>paidAt.lt.${bounds.finance},data->>paidAt.is.null`,
    })
    assert.equal(paid.scope.order, "data->>paidAt")
    assert.equal(olderInvoices(bounds, "cancelados").scope.order, "data->>dueDate")
  })

  it("atividades de um cliente ou processo, opcionalmente por tipo", () => {
    assert.deepEqual(activitiesOf({ processId: "p1" }).scope.filter, { eq: [["data->>processId", "p1"]] })
    assert.deepEqual(activitiesOf({ clientId: "c1" }, ["task"]).scope.filter, { eq: [["data->>clientId", "c1"]], in: [["data->>type", ["task"]]] })
  })
})
