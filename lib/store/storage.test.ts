import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  appointmentsBetween,
  clientScopes,
  compareVersions,
  daysBefore,
  diffCollection,
  diffState,
  fetchManifest,
  initialScopes,
  loadPage,
  loadScopes,
  orderCollection,
  pgValue,
  searchFilter,
  windowBounds,
  processScopes,
  RECENT_ACTIVITIES,
  RECENT_NOTIFICATIONS,
  removeById,
  upsertById,
  versionValue,
  type PersistedState,
} from "./storage"

const empty = (): PersistedState => ({
  clients: [],
  processes: [],
  tasks: [],
  taskColumns: [],
  deadlines: [],
  appointments: [],
  appointmentCategories: [],
  documents: [],
  invoices: [],
  activities: [],
  notifications: [],
})

describe("sincronização com o banco", () => {
  it("grava só o que é novo ou mudou e apaga o que saiu", () => {
    const a = { id: "a", v: 1 }
    const b = { id: "b", v: 1 }
    const c = { id: "c", v: 1 }
    const b2 = { ...b, v: 2 }
    const d = { id: "d", v: 1 }
    const diff = diffCollection([a, b, c], [a, b2, d])
    assert.deepEqual(
      diff.upserts.map((x) => x.id),
      ["b", "d"],
    )
    assert.deepEqual(
      diff.deletes.map((x) => x.id),
      ["c"],
    )
  })

  it("não grava nada quando o estado não mudou", () => {
    const state = { ...empty(), clients: [{ id: "c1" }] as unknown as PersistedState["clients"] }
    assert.deepEqual(diffState(state, state), {})
    assert.deepEqual(diffState(state, { ...state }), {})
  })

  it("ignora coleção recriada com os mesmos objetos", () => {
    const client = { id: "c1" } as unknown as PersistedState["clients"][number]
    const prev = { ...empty(), clients: [client] }
    assert.deepEqual(diffState(prev, { ...prev, clients: [client] }), {})
  })

  it("aponta só as coleções alteradas", () => {
    const prev = empty()
    const task = { id: "t1" } as unknown as PersistedState["tasks"][number]
    const diff = diffState(prev, { ...prev, tasks: [task] })
    assert.deepEqual(Object.keys(diff), ["tasks"])
    assert.equal(diff.tasks?.upserts[0], task)
  })

  it("ordena como o store: mais novo no topo, ou cronológico", () => {
    const items = [
      { id: "1", createdAt: "2026-01-01T10:00:00" },
      { id: "2", createdAt: "2026-03-01T10:00:00" },
      { id: "3", createdAt: "2026-02-01T10:00:00" },
    ]
    assert.deepEqual(
      orderCollection("clients", items).map((x) => x.id),
      ["2", "3", "1"],
    )
    assert.deepEqual(
      orderCollection("appointments", items).map((x) => x.id),
      ["1", "3", "2"],
    )
  })
})

describe("versão dos registros (updated_at)", () => {
  it("entende o formato da API e o do Realtime como a mesma versão", () => {
    assert.equal(compareVersions("2026-09-29T10:00:00.123456+00:00", "2026-09-29 10:00:00.123456+00"), 0)
    assert.equal(compareVersions("2026-09-29T07:00:00.5-03:00", "2026-09-29T10:00:00.500000Z"), 0)
  })

  it("distingue microssegundos (o Date do JS só vê milissegundos)", () => {
    assert.ok(compareVersions("2026-09-29T10:00:00.123457+00:00", "2026-09-29T10:00:00.123456+00:00") > 0)
    assert.ok(compareVersions("2026-09-29T10:00:00.123456+00:00", "2026-09-29T10:00:00.123457+00:00") < 0)
  })

  it("não aceita data inválida como versão", () => {
    assert.ok(Number.isNaN(versionValue("ontem")))
  })
})

describe("aplicar registros do banco no store", () => {
  it("não duplica: o mesmo id é substituído no lugar", () => {
    const a = { id: "a", v: 1 }
    const b = { id: "b", v: 1 }
    const b2 = { id: "b", v: 2 }
    const list = upsertById("tasks", [a, b], b2)
    assert.deepEqual(list, [a, b2])
    // Aplicar de novo (eco do Realtime) não muda nada — nem a identidade da lista.
    assert.equal(upsertById("tasks", list, b2), list)
  })

  it("registro novo entra onde as ações colocariam", () => {
    const a = { id: "a" }
    const n = { id: "n" }
    assert.deepEqual(upsertById("tasks", [a], n), [n, a])
    assert.deepEqual(upsertById("appointments", [a], n), [a, n])
  })

  it("remove por id, e remover de novo não faz nada", () => {
    const a = { id: "a" }
    const list = removeById([a, { id: "b" }], "b")
    assert.deepEqual(list, [a])
    assert.equal(removeById(list, "b"), list)
  })
})

describe("carga inicial e sob demanda", () => {
  const now = new Date(2026, 9, 5, 10)

  /** Cliente falso: guarda as chamadas de cada leitura e devolve as linhas da tabela. */
  function fakeSupabase(tables: Record<string, { id: string; data: Record<string, unknown>; updated_at: string; created_at: string }[]>) {
    const calls: { source: string; columns: string; ops: string[] }[] = []
    const supabase = {
      from(source: string) {
        const call = { source, columns: "", ops: [] as string[] }
        calls.push(call)
        const builder = {
          select(columns: string) {
            call.columns = columns
            return builder
          },
          or: (value: string) => (call.ops.push(`or ${value}`), builder),
          eq: (column: string, value: string) => (call.ops.push(`eq ${column} ${value}`), builder),
          gte: (column: string, value: string) => (call.ops.push(`gte ${column} ${value}`), builder),
          lt: (column: string, value: string) => (call.ops.push(`lt ${column} ${value}`), builder),
          in: (column: string, values: string[]) => (call.ops.push(`in ${column} ${values.join(",")}`), builder),
          order: (column: string, options?: { ascending: boolean }) => (call.ops.push(`order ${column}${options?.ascending === false ? " desc" : ""}`), builder),
          limit: (n: number) => (call.ops.push(`limit ${n}`), builder),
          range: (from: number, to: number) => (call.ops.push(`range ${from}-${to}`), builder),
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            resolve({ data: (tables[source] ?? []).slice(0, 1000), error: null })
          },
        }
        return builder
      },
    }
    return { supabase: supabase as unknown as Parameters<typeof loadScopes>[0], calls }
  }

  it("a abertura lê cada coleção uma vez, com recorte nas que guardam histórico", () => {
    const scopes = initialScopes(now)
    assert.deepEqual(
      [...new Set(scopes.map((s) => s.key))].sort(),
      ["activities", "appointmentCategories", "appointments", "clients", "deadlines", "documents", "invoices", "notifications", "processes", "taskColumns", "tasks"],
    )
    const by = (key: string) => scopes.find((s) => s.key === key)!
    assert.equal(by("processes").view, "processes_summary")
    assert.equal(by("tasks").filter?.or, "data->>status.eq.pendente,data->>completedAt.gte.2026-09-05")
    assert.equal(by("deadlines").filter?.or, "data->>status.eq.aberto,data->>closedAt.gte.2026-09-05")
    assert.deepEqual(by("appointments").filter?.gte, [["data->>start", "2026-08-21"]])
    assert.deepEqual(by("documents").filter?.gte, [["data->>uploadedAt", "2026-09-21"]])
    // Receita do ano e dos últimos 6 meses: de 1º de janeiro (mais antigo que maio).
    assert.match(by("invoices").filter!.or!, /status\.in\.\(pendente,atrasado\).*dueDate\.gte\.2026-01-01.*paidAt\.gte\.2026-01-01/)
    assert.equal(by("activities").latest, RECENT_ACTIVITIES)
    assert.equal(by("notifications").latest, RECENT_NOTIFICATIONS)
    // Em fevereiro, os 6 meses começam no ano anterior.
    assert.match(initialScopes(new Date(2026, 1, 10)).find((s) => s.key === "invoices")!.filter!.or!, /dueDate\.gte\.2025-09-01/)
  })

  it("datas locais, sem fuso", () => {
    assert.equal(daysBefore(new Date(2026, 0, 2, 23, 30), 3), "2025-12-30")
  })

  it("processo e cliente pedem só o que é deles", () => {
    const process = processScopes("p1")
    assert.ok(process.every((s) => s.entity))
    assert.deepEqual(process.find((s) => s.key === "deadlines")!.filter?.eq, [["process_id", "p1"]])
    const client = clientScopes("c1", ["p1", "p2"])
    assert.equal(client.find((s) => s.key === "tasks")!.filter?.or, "data->related->>id.eq.c1,data->related->>id.in.(p1,p2)")
    assert.equal(clientScopes("c1", []).find((s) => s.key === "tasks")!.filter?.or, "data->related->>id.eq.c1")
    // Um processo novo do cliente muda a identidade do recorte (nova leitura).
    assert.notEqual(client.find((s) => s.key === "tasks")!.id, clientScopes("c1", ["p1"]).find((s) => s.key === "tasks")!.id)
    assert.deepEqual(appointmentsBetween("2026-09-24", "2026-11-09").filter, { gte: [["data->>start", "2026-09-24"]], lt: [["data->>start", "2026-11-09"]] })
  })

  it("aplica o filtro na consulta (sem select *) e junta recortes que se sobrepõem", async () => {
    const row = (id: string, createdAt: string) => ({ id, data: { id, createdAt }, updated_at: `2026-10-0${id.length}T00:00:00Z`, created_at: createdAt })
    const { supabase, calls } = fakeSupabase({ tasks: [row("t1", "2026-01-01"), row("t2", "2026-02-01")], activities: [row("a1", "2026-01-01")] })
    const snapshot = await loadScopes(supabase, [
      { key: "tasks", id: "tasks:abertas", filter: { or: "data->>status.eq.pendente" } },
      { key: "tasks", id: "tasks:processo:p1", entity: true, filter: { eq: [["data->related->>id", "p1"]] } },
      { key: "activities", id: "activities:recentes", latest: 300 },
    ])
    // Os dois recortes trazem as mesmas tarefas: entram uma vez, mais nova no topo.
    assert.deepEqual(snapshot.state.tasks.map((t) => t.id), ["t2", "t1"])
    assert.equal(snapshot.versions.tasks.size, 2)
    assert.ok(calls.every((c) => c.columns === "id, data, updated_at"))
    assert.deepEqual(calls[0].ops, ["or data->>status.eq.pendente", "order created_at", "order id", "range 0-999"])
    assert.deepEqual(calls[1].ops, ["eq data->related->>id p1", "order created_at", "order id", "range 0-999"])
    assert.deepEqual(calls[2].ops, ["order created_at desc", "order id desc", "range 0-299"])
  })

  it("a revalidação lê só id e versão, com o mesmo filtro, sempre da tabela", async () => {
    const { supabase, calls } = fakeSupabase({ processes: [{ id: "p1", data: {}, updated_at: "v1", created_at: "x" }] })
    const manifest = await fetchManifest(supabase, { key: "processes", id: "processes:resumo", view: "processes_summary" })
    assert.deepEqual([...manifest], [["p1", "v1"]])
    assert.equal(calls[0].source, "processes")
    assert.equal(calls[0].columns, "id, updated_at")
  })
})

describe("busca e histórico no banco", () => {
  it("valores com vírgula, ponto, parênteses ou espaço vão entre aspas", () => {
    assert.equal(pgValue("2026-09-05"), "2026-09-05")
    assert.equal(pgValue("Documento pessoal"), '"Documento pessoal"')
    assert.equal(pgValue('a,b.(c)"'), '"a,b.(c)\\""')
  })

  it("busca sem acento e em minúsculas, como a da tela; vínculos por id", () => {
    assert.equal(searchFilter("a"), null, "termo curto demais não vai ao banco")
    assert.deepEqual(searchFilter("  Petição  "), { or: "search.ilike.*peticao*" })
    assert.deepEqual(searchFilter("ação 50%"), { or: 'search.ilike."*acao 50*"' })
    assert.deepEqual(searchFilter("cliente", [{ column: "data->>clientId", ids: ["c1", "c2"] }, { column: "x", ids: [] }]), {
      or: "search.ilike.*cliente*,data->>clientId.in.(c1,c2)",
    })
    const many = Array.from({ length: 80 }, (_, i) => `c${i}`)
    const filter = searchFilter("cliente", [{ column: "data->>clientId", ids: many }])!
    assert.equal(filter.or!.split(",").length, 1 + 50, "no máximo 50 ids por vínculo")
  })

  it("janelas da abertura", () => {
    assert.deepEqual(windowBounds(new Date(2026, 9, 5, 10)), {
      month: "2026-09-05",
      appointments: "2026-08-21",
      documents: "2026-09-21",
      finance: "2026-01-01",
    })
  })

  it("página do histórico: ordem pela coluna da lista (vazios por último) e deslocamento", async () => {
    const calls: string[][] = []
    const builder = (ops: string[]) => {
      const b = {
        select: () => b,
        neq: (c: string, v: string) => (ops.push(`neq ${c} ${v}`), b),
        or: (v: string) => (ops.push(`or ${v}`), b),
        eq: (c: string, v: string) => (ops.push(`eq ${c} ${v}`), b),
        lt: (c: string, v: string) => (ops.push(`lt ${c} ${v}`), b),
        not: (c: string, op: string, v: string) => (ops.push(`not ${c} ${op} ${v}`), b),
        order: (c: string, o?: { ascending: boolean; nullsFirst?: boolean }) => (ops.push(`order ${c}${o?.ascending === false ? " desc" : ""}${o?.nullsFirst === false ? " nullslast" : ""}`), b),
        range: (from: number, to: number) => (ops.push(`range ${from}-${to}`), b),
        then: (resolve: (v: { data: unknown[]; error: null; count: number }) => void) => resolve({ data: [], error: null, count: 7 }),
      }
      return b
    }
    const supabase = { from: () => { const ops: string[] = []; calls.push(ops); return builder(ops) } } as unknown as Parameters<typeof loadPage>[0]
    const { total } = await loadPage(
      supabase,
      { key: "tasks", id: "x", latest: 50, offset: 100, order: "data->>completedAt", filter: { neq: [["data->>status", "pendente"]], notIn: [["data->>kind", ["Contrato", "Documento pessoal"]]] } },
      true,
    )
    assert.equal(total, 7)
    assert.deepEqual(calls[0], [
      "neq data->>status pendente",
      'not data->>kind in (Contrato,"Documento pessoal")',
      "order data->>completedAt desc nullslast",
      "order id desc",
      "range 100-149",
    ])
  })
})
