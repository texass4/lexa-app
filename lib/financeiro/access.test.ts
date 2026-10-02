import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import type { Activity, Invoice } from "@/types"
import { ROLE_DEFAULTS } from "@/lib/auth/permissions"
import { FINANCIAL_ACTIVITY_TYPES, isFinancialActivity, visibleActivities, withoutFinance } from "./access"

const base = { organizationId: "org", createdAt: "2026-09-01T00:00:00" }
const activity = (id: string, type: Activity["type"], detail?: string): Activity => ({ ...base, id, type, at: "2026-09-20T10:00:00", message: id, detail })
const invoice: Invoice = { ...base, id: "i1", clientId: "c1", description: "Honorários", amount: 8500, dueDate: "2026-09-13", status: "pendente" }

const activities = [
  activity("pagamento", "payment", "Honorários · R$ 8.500,00 · pago em 10/09/2026"),
  activity("cadastro", "client"),
  activity("tarefa", "task"),
]

/** Nenhum valor em reais nem descrição de lançamento em lugar nenhum do objeto. */
const leaksMoney = (value: unknown) => /R\$|8\.?500|Honorários/.test(JSON.stringify(value))

describe("Financeiro só para quem tem permissão", () => {
  it("atividade de pagamento é financeira; as outras não", () => {
    assert.equal(isFinancialActivity({ type: "payment" }), true)
    for (const type of ["client", "task", "document", "petition", "movement", "deadline", "appointment"] as const) {
      assert.equal(isFinancialActivity({ type }), false, type)
    }
  })

  it("com Financeiro: tudo continua visível", () => {
    assert.equal(visibleActivities(activities, true).length, 3)
    const state = { invoices: [invoice], activities, clients: [] }
    assert.equal(withoutFinance(state, true), state)
  })

  it("sem Financeiro: nem lançamentos nem atividades com valor", () => {
    const state = withoutFinance({ invoices: [invoice], activities, clients: [{ id: "c1" }] }, false)
    assert.deepEqual(state.invoices, [])
    assert.deepEqual(state.activities.map((a) => a.id), ["cadastro", "tarefa"])
    assert.deepEqual(state.clients, [{ id: "c1" }])
    assert.equal(leaksMoney(state), false)
  })

  it("papéis padrão: colaborador não vê o Financeiro; sócio e advogado veem", () => {
    assert.equal(ROLE_DEFAULTS.staff.includes("finance.view"), false)
    assert.equal(ROLE_DEFAULTS.lawyer.includes("finance.view"), true)
    assert.equal(ROLE_DEFAULTS.owner.includes("finance.view"), true)
  })

  it("a RLS do banco usa a mesma lista de atividades financeiras (0014)", () => {
    const sql = readFileSync(path.join(import.meta.dirname, "..", "..", "supabase", "migrations", "0014_financeiro_privacidade.sql"), "utf8")
    const fn = sql.slice(sql.indexOf("function public.is_financial_activity"), sql.indexOf("$$;", sql.indexOf("function public.is_financial_activity")))
    for (const type of FINANCIAL_ACTIVITY_TYPES) assert.match(fn, new RegExp(`'${type}'`), type)
    assert.match(sql, /activities_select[\s\S]*has_perm\('finance\.view'\)/)
    assert.match(sql, /activities_insert[\s\S]*has_perm\('finance\.edit'\)/)
  })
})
