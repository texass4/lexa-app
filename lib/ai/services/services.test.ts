import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ROLE_DEFAULTS } from "@/lib/auth/permissions"
import { createSupabaseRepository } from "../context/repository"
import { NO_PRAZOS, buildProcessContext, loadProcessData } from "../context/process"
import { loadClientData } from "../context/client"
import { createSupabaseRepository as repoFor } from "../context/repository"
import { computeOfficeMetrics, loadOfficeData } from "../context/office"
import { computeFinanceMetrics } from "../context/finance"
import { AIError } from "../errors"
import {
  ORG_A,
  NOW,
  SECRET_B,
  fakeSupabase,
  makeDeps,
  paymentActivityA,
  memoryMeter,
  processA,
  processB,
  promptText,
  seedTables,
  validSummary,
} from "../__fixtures__/data"
import { analyzeMovement, suggestNextActions, summarizeProcess } from "./process"
import { summarizeClient } from "./client"
import { officeOverview } from "./office"
import { financeAnalysis } from "./finance"
import { analyzeJurisprudence, analyzeRelatedJurisprudence } from "./jurisprudence"
import { chat, trimHistory } from "./chat"

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return (error as AIError).code
  }
  return "ok"
}

const nextActions = {
  pontos_atencao: [{ texto: "Remessa recente sem destino informado.", natureza: "verificacao", refs: ["M1"] }],
  sugestoes: [
    {
      titulo: "Verificar destino da remessa",
      descricao: "Consultar o tribunal.",
      prioridade: "media",
      justificativa: "Remessa em 24/09/2026.",
      refs: ["M1"],
    },
  ],
  informacoes_ausentes: [],
}

describe("repositório da IA (isolamento por escritório)", () => {
  it("só devolve registros do escritório de quem chama", async () => {
    const { supabase } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, () => true)
    assert.deepEqual(await repo.countClients(), { total: 1, active: 1, delinquent: 0 })
    assert.deepEqual([...(await repo.clientNames(["c_a1", "c_b1"])).keys()], ["c_a1"])
    assert.deepEqual(
      (await repo.listTasks()).map((t) => t.id),
      ["t_a1"],
    )
    assert.deepEqual(
      (await repo.listProcessOverviews()).map((p) => p.id),
      ["p_a1"],
    )
    assert.deepEqual(
      (await repo.listMembers()).map((m) => m.name),
      ["Ana Advogada"],
    )
  })

  it("processo de outro escritório não existe para quem pergunta", async () => {
    const { supabase } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, () => true)
    assert.equal(await repo.getProcess(processB.id), null)
    assert.equal(await repo.getClient("c_b1"), null)
  })

  it("toda consulta filtra organization_id", async () => {
    const { supabase, queries } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, () => true)
    await loadOfficeData(repo, NOW)
    await loadProcessData(repo, processA.id, NOW)
    await loadClientData(repo, "c_a1", NOW)
    assert.ok(queries.length > 5)
    for (const query of queries)
      assert.ok(
        query.filters.some(([col, value]) => col === "organization_id" && value === ORG_A),
        query.table,
      )
  })

  it("respeita as permissões do módulo", async () => {
    const { supabase } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, (p) => p === "processes.view")
    assert.deepEqual(await repo.listInvoices({ clientId: "c_a1" }), [])
    assert.deepEqual(await repo.listTasks(), [])
    assert.equal(await repo.getClient("c_a1"), null)
    assert.ok(await repo.getProcess(processA.id))
  })

  it("não lê tabelas inteiras: cada contexto pede ao banco só o seu recorte", async () => {
    const { supabase, queries } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, () => true)
    await loadProcessData(repo, processA.id, NOW)
    const of = (table: string) => queries.filter((q) => q.table === table)
    // Processo: tarefas, prazos, compromissos e documentos já filtrados pelo processo; documentos com limite.
    assert.ok(of("tasks").every((q) => q.filters.some(([col, value]) => col === "data->related->>id" && value === processA.id)))
    assert.ok(of("deadlines").every((q) => q.filters.some(([col]) => col === "process_id")))
    assert.ok(
      of("appointments").every((q) => q.filters.some(([col]) => col === "data->>processId") && q.filters.some(([col]) => col === "data->>end")),
    )
    assert.ok(of("documents").every((q) => q.limit === 10))

    queries.length = 0
    await loadOfficeData(repo, NOW)
    // Panorama: clientes e documentos só como contagem; tarefas pendentes; prazos abertos; agenda da semana.
    assert.ok(of("clients").every((q) => q.head || q.filters.some(([col]) => col === "id")))
    assert.ok(of("documents").every((q) => q.head))
    assert.ok(of("tasks").every((q) => q.filters.some(([col, value]) => col === "data->>status" && value === "pendente")))
    assert.ok(of("deadlines").every((q) => q.filters.some(([col, value]) => col === "data->>status" && value === "aberto")))
    assert.ok(of("appointments").every((q) => q.filters.some(([col]) => col === "data->>start")))
    assert.ok(of("invoices").every((q) => q.filters.some(([col]) => col === "or")))

    queries.length = 0
    await loadClientData(repo, "c_a1", NOW)
    assert.ok(of("invoices").every((q) => q.filters.some(([col, value]) => col === "data->>clientId" && value === "c_a1")))
    assert.ok(of("activities").every((q) => q.limit === 10))
    assert.ok(of("tasks").every((q) => q.filters.some(([col]) => col === "or")))
  })

  it("listas de processos não trazem o histórico completo", async () => {
    const { supabase } = fakeSupabase()
    const [overview] = await createSupabaseRepository(supabase, ORG_A, () => true).listProcessOverviews()
    assert.equal("movements" in overview, false)
    assert.equal(overview.lastMovement?.title, "Remessa")
  })
})

describe("resumo do processo", () => {
  it("usa dados reais, valida o schema e descarta fontes inventadas", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    const result = await summarizeProcess(deps, processA.id)

    assert.equal(calls.length, 1)
    assert.equal(result.data.nivel_confianca, "medio")
    assert.deepEqual(
      result.data.movimentacoes_relevantes.map((n) => n.ref),
      ["M1"],
    )
    assert.deepEqual(result.data.pontos_atencao[0].refs, ["T1"])
    // A fonte exibida vem do banco, não do modelo.
    assert.equal(result.sources.M1.label, "Remessa")
    assert.equal(result.sources.M1.date, "2026-09-24T14:03:00")
    assert.equal(result.cached, false)
    assert.deepEqual(result.warnings, [])
  })

  it("envia só o necessário: sem senha, token, e-mail, CPF, caminho de arquivo ou dado bruto", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    await summarizeProcess(deps, processA.id)
    const sent = promptText(calls[0])
    assert.match(sent, /0801234-56\.2024\.8\.10\.0001/)
    assert.match(sent, /outros motivos/)
    assert.match(sent, /Motivo da remessa/)
    for (const forbidden of ["maria@example.com", "123.456.789-09", "org-a/d_a1", "nao-deve-sair", "hash-secreto", ORG_A, "Rua das Flores"]) {
      assert.equal(sent.includes(forbidden), false, forbidden)
    }
  })

  it("nunca envia dados de outro escritório", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    await summarizeProcess(deps, processA.id)
    const sent = promptText(calls[0])
    for (const forbidden of [SECRET_B, processB.number, "Tarefa sigilosa B", "Sentença sigilosa B", "Bruno do Escritório B"]) {
      assert.equal(sent.includes(forbidden), false, forbidden)
    }
  })

  it("processo de outro escritório → NOT_FOUND, sem chamar o modelo", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    assert.equal(await failure(summarizeProcess(deps, processB.id)), "NOT_FOUND")
    assert.equal(calls.length, 0)
  })

  it("processo inexistente → NOT_FOUND", async () => {
    const { deps } = makeDeps(() => validSummary)
    assert.equal(await failure(summarizeProcess(deps, "p_nao_existe")), "NOT_FOUND")
  })

  it("sem permissão de processos → FORBIDDEN", async () => {
    const { deps, calls } = makeDeps(() => validSummary, { permissions: ["clients.view"] })
    assert.equal(await failure(summarizeProcess(deps, processA.id)), "FORBIDDEN")
    assert.equal(calls.length, 0)
  })

  it("sem dados para analisar → INSUFFICIENT_DATA, sem gastar chamada", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    const empty = { ...processA, id: "p_vazio", movements: [] }
    const { supabase } = fakeSupabase({ ...seedTables(), processes: [{ organization_id: ORG_A, id: empty.id, data: empty }] })
    deps.repo = createSupabaseRepository(supabase, ORG_A, () => true)
    assert.equal(await failure(summarizeProcess(deps, empty.id)), "INSUFFICIENT_DATA")
    assert.equal(calls.length, 0)
  })

  it("resposta fora do schema → INVALID_RESPONSE", async () => {
    const { deps } = makeDeps(() => ({ resumo: 42 }))
    assert.equal(await failure(summarizeProcess(deps, processA.id)), "INVALID_RESPONSE")
  })

  it("erro do provedor chega com o código certo; erro desconhecido vira UNEXPECTED", async () => {
    const empty = makeDeps(() => {
      throw new AIError("EMPTY_RESPONSE")
    })
    assert.equal(await failure(summarizeProcess(empty.deps, processA.id)), "EMPTY_RESPONSE")
    const unknown = makeDeps(() => {
      throw new Error("stack interno com segredo")
    })
    assert.equal(await failure(summarizeProcess(unknown.deps, processA.id)), "UNEXPECTED")
  })

  it("dois pedidos iguais = uma chamada; o segundo vem do cache e não conta no plano", async () => {
    const { deps, calls, usage } = makeDeps(() => validSummary)
    const [first, second] = await Promise.all([summarizeProcess(deps, processA.id), summarizeProcess(deps, processA.id)])
    assert.equal(calls.length, 1)
    assert.deepEqual(first.data, second.data)
    const third = await summarizeProcess(deps, processA.id)
    assert.equal(third.cached, true)
    assert.equal(calls.length, 1)
    assert.deepEqual(
      usage.map((e) => [e.status, e.context.operation, e.context.userId]),
      [
        ["ok", "process.summary", "u_a1"],
        ["cache", "process.summary", "u_a1"],
      ],
    )
  })

  it("dado novo no processo = análise nova (o cache é pelo contexto inteiro)", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    await summarizeProcess(deps, processA.id)
    deps.now = new Date(NOW.getTime() + 86_400_000) // "data de hoje" faz parte do contexto
    await summarizeProcess(deps, processA.id)
    assert.equal(calls.length, 2)
  })

  it("limite de ritmo → RATE_LIMITED antes de chamar o modelo", async () => {
    const meter = memoryMeter({ perUserMinute: 3 })
    const { deps, calls } = makeDeps(() => nextActions, { meter })
    for (let i = 0; i < 3; i++) {
      // Contexto muda a cada pedido (sem cache) para forçar chamadas reais.
      deps.now = new Date(NOW.getTime() + i * 86_400_000)
      await suggestNextActions(deps, processA.id)
    }
    deps.now = new Date(NOW.getTime() + 9 * 86_400_000)
    assert.equal(await failure(suggestNextActions(deps, processA.id)), "RATE_LIMITED")
    assert.equal(calls.length, 3)
  })

  it("limite do plano → PLAN_LIMIT, sem chamar o modelo; erro do provedor é registrado", async () => {
    const meter = memoryMeter({ monthlyLimit: 1 })
    const failing = makeDeps(
      () => {
        throw new AIError("UNAVAILABLE")
      },
      { meter },
    )
    assert.equal(await failure(summarizeProcess(failing.deps, processA.id)), "UNAVAILABLE")
    assert.equal(meter.events[0].status, "erro") // erro não conta no plano
    const { deps, calls } = makeDeps(() => validSummary, { meter })
    await summarizeProcess(deps, processA.id)
    deps.now = new Date(NOW.getTime() + 86_400_000)
    assert.equal(await failure(summarizeProcess(deps, processA.id)), "PLAN_LIMIT")
    assert.equal(calls.length, 1)
  })

  it("análise de uma movimentação usa o modelo leve", async () => {
    const { deps, calls, usage } = makeDeps(() => ({
      o_que_aconteceu: "Remessa.",
      o_que_o_registro_informa: [],
      o_que_nao_e_possivel_concluir: [],
      pontos_atencao: [],
      sugestoes_tarefa: [],
      nivel_confianca: "Médio",
    }))
    await analyzeMovement(deps, processA.id, processA.movements[0].id)
    assert.equal(calls[0].tier, "light")
    assert.equal(usage[0].model, "fake-flash-lite")
  })
})

describe("prazos", () => {
  it("sem prazo nos dados, o contexto diz isso e não traz data inventada", async () => {
    const { deps } = makeDeps(() => validSummary)
    const data = await loadProcessData(deps.repo, processA.id)
    const { context } = buildProcessContext(data, NOW)
    assert.equal(context.prazos_do_processo, NO_PRAZOS)
    assert.doesNotMatch(JSON.stringify(context), /prazo_cadastrado_no_lexa/)
  })

  it("com prazo cadastrado, a IA recebe o prazo real (e só os do próprio escritório e processo)", async () => {
    const prazo = (organizationId: string, id: string, processId: string, patch: Record<string, unknown> = {}) => ({
      organization_id: organizationId,
      id,
      // Coluna derivada pelo banco (`deadlines_sync_links`), usada no filtro.
      process_id: processId,
      data: {
        id,
        organizationId,
        processId,
        description: `Prazo ${id}`,
        fatalDate: "2026-10-02",
        internalDate: "2026-09-30",
        responsibleId: "u_a1",
        origin: "intimacao",
        status: "aberto",
        taskId: "t_a1",
        createdById: "u_a1",
        createdAt: "2026-09-20T10:00:00",
        ...patch,
      },
    })
    const { supabase } = fakeSupabase({
      ...seedTables(),
      deadlines: [
        prazo(ORG_A, "pz_a1", processA.id),
        prazo(ORG_A, "pz_a2", processA.id, { status: "cumprido", fatalDate: "2026-09-01", internalDate: "2026-08-30" }),
        prazo(ORG_A, "pz_outro", "p_outro"),
        prazo("org-b", "pz_b1", processA.id, { description: SECRET_B }),
      ],
    })
    const repo = repoFor(supabase, ORG_A, () => true)
    const data = await loadProcessData(repo, processA.id)
    const { context, sources } = buildProcessContext(data, NOW)
    const prazos = context.prazos_do_processo as Record<string, unknown>[]
    assert.deepEqual(
      prazos.map((p) => [p.descricao, p.situacao, p.data_fatal]),
      [
        ["Prazo pz_a1", "Aberto", "02/10/2026"],
        ["Prazo pz_a2", "Cumprido", "01/09/2026"],
      ],
    )
    assert.equal(prazos[0].dias_ate_a_data_fatal, 6)
    assert.equal(prazos[0].origem, "Intimação")
    assert.equal(prazos[0].responsavel, "Ana Advogada")
    assert.equal(sources[prazos[0].ref as string].kind, "deadline")
    assert.doesNotMatch(JSON.stringify(context), new RegExp(SECRET_B))

    // Sem permissão de processos, nenhum prazo chega à IA.
    assert.deepEqual(await repoFor(supabase, ORG_A, () => false).listPrazos(), [])
  })

  it("resposta com prazo inventado recebe aviso visível", async () => {
    const { deps } = makeDeps(() => ({
      ...validSummary,
      proximas_acoes: ["Você tem 5 dias para responder.", "O prazo termina em 01/10/2026."],
    }))
    const result = await summarizeProcess(deps, processA.id)
    assert.equal(result.warnings.length, 2)
    assert.match(result.warnings.join(" "), /01\/10\/2026/)
  })
})

describe("análise de movimentação", () => {
  it("envia a movimentação com complementos e cita a origem", async () => {
    const { deps, calls } = makeDeps(() => ({
      o_que_aconteceu: "Foi registrada uma remessa.",
      o_que_o_registro_informa: ["Motivo: outros motivos."],
      o_que_nao_e_possivel_concluir: ["O destino da remessa não pode ser determinado por este registro."],
      pontos_atencao: [],
      sugestoes_tarefa: [],
      nivel_confianca: "alto",
    }))
    const result = await analyzeMovement(deps, processA.id, "m_a3")
    const sent = promptText(calls[0])
    assert.match(sent, /movimentacao_analisada/)
    assert.match(sent, /"valor":"outros motivos"/)
    assert.match(sent, /Complementos de movimentação dizem apenas o que está escrito/)
    assert.equal(result.sources.M1.id, "m_a3")
  })

  it("movimentação de outro processo → NOT_FOUND", async () => {
    const { deps } = makeDeps(() => ({}))
    assert.equal(await failure(analyzeMovement(deps, processA.id, "m_b1")), "NOT_FOUND")
  })
})

describe("sugestão de tarefas", () => {
  it("devolve sugestões e não grava nada no banco", async () => {
    const { deps, db } = makeDeps(() => nextActions)
    const result = await suggestNextActions(deps, processA.id)
    assert.equal(result.data.sugestoes.length, 1)
    assert.equal(result.data.sugestoes[0].prioridade, "media")
    assert.deepEqual(result.data.sugestoes[0].refs, ["M1"])
    assert.deepEqual(db.writes, [])
  })
})

describe("cliente e escritório", () => {
  it("panorama do cliente sem financeiro para quem não tem permissão", async () => {
    const summary = {
      resumo: "Cliente com um processo ativo.",
      processos: [{ ref: "P1", comentario: "Em andamento." }],
      pontos_atencao: [],
      atividades_recentes: [],
      pendencias: [],
      proximas_acoes: [],
      informacoes_ausentes: [],
      nivel_confianca: "medio",
    }
    const staff = ROLE_DEFAULTS.staff
    const { deps, calls } = makeDeps(() => summary, { permissions: staff })
    const result = await summarizeClient(deps, "c_a1")
    const sent = promptText(calls[0])
    assert.equal(result.sources.P1.id, processA.id)
    assert.doesNotMatch(sent, /Honorários iniciais|total_faturado/)
    assert.match(sent, /financeiro/)
  })

  it("sem Financeiro, nenhuma atividade financeira chega ao contexto do cliente", async () => {
    const summary = {
      resumo: "Cliente com um processo ativo.",
      processos: [],
      pontos_atencao: [],
      atividades_recentes: [],
      pendencias: [],
      proximas_acoes: [],
      informacoes_ausentes: [],
      nivel_confianca: "medio",
    }
    // Com Financeiro: o pagamento entra (é dado que a pessoa já pode ver).
    const owner = makeDeps(() => summary)
    await summarizeClient(owner.deps, "c_a1")
    assert.match(promptText(owner.calls[0]), /registrou um pagamento recebido/)
    assert.match(promptText(owner.calls[0]), /total_faturado/)

    // Sem Financeiro: nem o lançamento, nem a atividade com o valor.
    const staff = makeDeps(() => summary, { permissions: ROLE_DEFAULTS.staff })
    await summarizeClient(staff.deps, "c_a1")
    const sent = promptText(staff.calls[0])
    assert.doesNotMatch(sent, /pagamento recebido|R\$ 3\.000|Honorários iniciais|total_faturado/)
    assert.match(sent, /atualizou o cadastro do cliente/)
  })

  it("o filtro das atividades financeiras vai para o banco, não só para a tela", async () => {
    const db = fakeSupabase()
    const repo = createSupabaseRepository(db.supabase, ORG_A, (p) => ROLE_DEFAULTS.staff.includes(p))
    const activities = await repo.listActivities({ clientId: "c_a1", limit: 10 })
    assert.ok(activities.every((a) => a.type !== "payment"))
    assert.ok(activities.length > 0)
    const query = db.queries.find((q) => q.table === "activities")
    assert.deepEqual(
      query?.filters.find(([column]) => column === "data->>type"),
      ["data->>type", "payment"],
    )

    const finance = createSupabaseRepository(fakeSupabase().supabase, ORG_A, (p) => ROLE_DEFAULTS.lawyer.includes(p))
    assert.ok((await finance.listActivities({ clientId: "c_a1", limit: 10 })).some((a) => a.id === paymentActivityA.id))
  })

  it("métricas do escritório vêm dos dados, por permissão", async () => {
    const { deps } = makeDeps(() => ({}))
    const metrics = computeOfficeMetrics(await loadOfficeData(deps.repo), NOW)
    assert.equal(metrics.processes?.active, 1)
    assert.equal(metrics.processes?.movedLast7Days, 1)
    assert.equal(metrics.tasks?.overdue, 1)
    assert.equal(metrics.finance?.overdueAmount, 3000)
    assert.equal(metrics.clients?.total, 1)

    const restricted = makeDeps(() => ({}), { permissions: ["processes.view"] })
    const limited = computeOfficeMetrics(await loadOfficeData(restricted.deps.repo), NOW)
    assert.equal(limited.finance, undefined)
    assert.equal(limited.tasks, undefined)
  })

  it("panorama devolve as métricas calculadas, não as do modelo", async () => {
    const { deps } = makeDeps(() => ({
      visao_geral: "Escritório com 999 processos.",
      pontos_atencao: [],
      processos_para_analise: [],
      pendencias: [],
      tarefas_atrasadas: "",
      situacao_financeira: "",
      sugestoes_organizacao: [],
      perguntas_para_verificar: [],
    }))
    const result = await officeOverview(deps)
    assert.equal(result.metrics.processes?.active, 1)
  })
})

describe("chat", () => {
  it("contexto do processo pedido, e só dele", async () => {
    const { deps, calls } = makeDeps(() => "A última movimentação foi uma remessa [M1] em 24/09/2026. [M77]")
    const result = await chat(deps, { type: "process", id: processA.id }, [
      { role: "user", content: "Resuma o processo." },
      { role: "assistant", content: "Resumo…" },
      { role: "user", content: "E essa última movimentação?" },
    ])
    const sent = calls[0]
    assert.match(sent.system, /0801234-56/)
    assert.equal(sent.system.includes(processB.number), false)
    assert.equal(sent.messages.length, 3)
    assert.equal(result.data.text.includes("[M77]"), false)
    assert.deepEqual(Object.keys(result.sources), ["M1"])
  })

  it("processo de outro escritório no escopo → NOT_FOUND", async () => {
    const { deps, calls } = makeDeps(() => "x")
    assert.equal(await failure(chat(deps, { type: "process", id: processB.id }, [{ role: "user", content: "oi" }])), "NOT_FOUND")
    assert.equal(calls.length, 0)
  })

  it("histórico limitado e sempre terminando numa pergunta", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}` }))
    long.push({ role: "user", content: "última" })
    const trimmed = trimHistory(long)
    assert.ok(trimmed.length <= 10)
    assert.equal(trimmed[0].role, "user")
    assert.equal(trimmed[trimmed.length - 1].content, "última")
    assert.throws(() => trimHistory([{ role: "assistant", content: "oi" }]))
  })

  it("escritório: métricas + listas, sem dados de outro escritório", async () => {
    const { deps, calls } = makeDeps(() => "Há 1 processo ativo.")
    await chat(deps, { type: "office" }, [{ role: "user", content: "Quantos processos estão ativos?" }])
    const sent = calls[0].system
    assert.match(sent, /metricas_calculadas_pelo_lexa/)
    assert.match(sent, /processos_ativos/)
    assert.equal(sent.includes(SECRET_B), false)
  })
})

describe("análise do financeiro", () => {
  const analysis = {
    leitura: "Há R$ 999.999,00 em atraso.",
    pontos_atencao: [{ texto: "Atraso concentrado.", natureza: "fato", refs: ["C1", "C9"] }],
    sugestoes: ["Cobrar o cliente com atraso."],
    perguntas_para_verificar: [],
  }

  it("números das faturas, não do modelo; só o escritório de quem pergunta", async () => {
    const { deps, calls } = makeDeps(() => analysis)
    const result = await financeAnalysis(deps)
    assert.equal(result.metrics.overdueAmount, 3000)
    assert.equal(result.metrics.overdueInvoices, 1)
    assert.equal(result.metrics.clientsWithOverdue, 1)
    // Referência inventada pelo modelo não chega à tela.
    assert.deepEqual(result.data.pontos_atencao[0].refs, ["C1"])
    assert.equal(result.sources.C1.href, "/clientes/c_a1?tab=financeiro")
    const sent = promptText(calls[0])
    assert.match(sent, /"em_atraso":"R\$\s3\.000"/)
    assert.equal(sent.includes(SECRET_B), false)
    assert.match(sent, /recebido_no_mesmo_periodo_do_mes_anterior/)
  })

  it("sem permissão do financeiro → FORBIDDEN, sem chamar o modelo", async () => {
    const { deps, calls } = makeDeps(() => analysis, { permissions: ["processes.view", "clients.view"] })
    assert.equal(await failure(financeAnalysis(deps)), "FORBIDDEN")
    assert.equal(calls.length, 0)
  })

  it("sem lançamentos → INSUFFICIENT_DATA, sem chamar o modelo", async () => {
    const { deps, calls, db } = makeDeps(() => analysis)
    db.tables.invoices = []
    assert.equal(await failure(financeAnalysis(deps)), "INSUFFICIENT_DATA")
    assert.equal(calls.length, 0)
  })

  it("próximos 30 dias: só previstas ainda não vencidas", () => {
    const base = { organizationId: ORG_A, createdAt: "2026-01-01T00:00:00", clientId: "c1", description: "x" }
    const metrics = computeFinanceMetrics(
      [
        { ...base, id: "a", amount: 100, dueDate: "2026-10-10", status: "pendente" },
        { ...base, id: "b", amount: 200, dueDate: "2026-11-30", status: "pendente" },
        { ...base, id: "c", amount: 400, dueDate: "2026-09-20", status: "pendente" },
        { ...base, id: "d", amount: 800, dueDate: "2026-10-01", status: "cancelado" },
      ],
      NOW,
    )
    assert.equal(metrics.dueNext30Days, 100)
    assert.equal(metrics.dueNext30DaysInvoices, 1)
    assert.equal(metrics.overdueAmount, 400)
  })
})

describe("Análise da Íntegra — jurisprudência", () => {
  const J1 = "11111111-1111-4111-8111-111111111111"
  const J2 = "22222222-2222-4222-8222-222222222222"
  // Decisões da base de TESTE (linhas no formato da tabela `jurisprudence`).
  const decisionRow = (id: string, patch: Record<string, unknown> = {}) => ({
    id,
    provider: "stj",
    tribunal: "STJ",
    external_id: id.slice(0, 8),
    process_number: id === J1 ? "2100001" : "2100002",
    registry_number: "202501234567",
    class_code: "REsp",
    class_name: "RECURSO ESPECIAL",
    court: "TERCEIRA TURMA",
    rapporteur: "MINISTRA TESTE",
    judgment_date: "2025-09-16",
    publication_date: null,
    publication: null,
    decision_type: "ACÓRDÃO",
    subject: "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA",
    ementa: "CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. Texto de teste da ementa.",
    decision_text: null,
    thesis: null,
    keywords: null,
    legislation: [],
    cited_precedents: null,
    notes: null,
    area: "Direito Privado",
    degree: "Superior",
    source_url: "https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=202501234567",
    raw_reference: { file_url: "https://dadosabertos.web.stj.jus.br/x.json" },
    updated_at: "2025-10-01T00:00:00Z",
    ...patch,
  })
  const analysis = {
    resumo: "Decisão sobre negativação indevida.",
    tese_principal: "",
    resultado: "",
    pontos_relevantes: [],
    fundamentos_mencionados: [],
    relevancia_para_pesquisa: "Trata do mesmo tema.",
    comparacao_com_processo: "Comparação que não deveria existir.",
    informacoes_ausentes: ["texto da decisão"],
  }
  const withDecisions = (deps: ReturnType<typeof makeDeps>) => {
    deps.db.tables.jurisprudence = [decisionRow(J1), decisionRow(J2, { ementa: "PENAL. Outro tema de teste." })] as never
    return deps
  }

  it("usa só a decisão da base; sem processo, não há comparação; ausências declaradas", async () => {
    const { deps, calls } = withDecisions(makeDeps(() => analysis))
    const result = await analyzeJurisprudence(deps, { jurisprudenceId: J1, query: "negativação sem notificação" })
    const sent = promptText(calls[0])
    assert.match(sent, /Texto de teste da ementa/)
    assert.match(sent, /negativação sem notificação/)
    assert.match(sent, /campos_ausentes[^\]]*texto da decisão/)
    assert.equal(sent.includes("Outro tema de teste"), false)
    assert.equal(sent.includes(SECRET_B), false)
    assert.equal(result.data.comparacao_com_processo, "")
    assert.equal(result.sources.J1.id, J1)
  })

  it("com processo: o processo do escritório entra no contexto", async () => {
    const { deps, calls } = withDecisions(makeDeps(() => analysis))
    const result = await analyzeJurisprudence(deps, { jurisprudenceId: J1, processId: processA.id })
    assert.match(promptText(calls[0]), new RegExp(processA.number))
    assert.equal(result.data.comparacao_com_processo, "Comparação que não deveria existir.")
  })

  it("decisão inexistente ou processo de outro escritório → NOT_FOUND, sem chamar o modelo", async () => {
    const missing = withDecisions(makeDeps(() => analysis))
    assert.equal(await failure(analyzeJurisprudence(missing.deps, { jurisprudenceId: "33333333-3333-4333-8333-333333333333" })), "NOT_FOUND")
    assert.equal(await failure(analyzeJurisprudence(missing.deps, { jurisprudenceId: J1, processId: processB.id })), "NOT_FOUND")
    assert.equal(missing.calls.length, 0)
  })

  it("sem acesso a processos → FORBIDDEN", async () => {
    const { deps, calls } = withDecisions(makeDeps(() => analysis, { permissions: ["clients.view"] }))
    assert.equal(await failure(analyzeJurisprudence(deps, { jurisprudenceId: J1 })), "FORBIDDEN")
    assert.equal(calls.length, 0)
  })

  it("IA indisponível: o erro chega como erro (nada de análise simulada)", async () => {
    const { deps } = withDecisions(
      makeDeps(() => {
        throw new AIError("MODEL_UNAVAILABLE")
      }),
    )
    assert.equal(await failure(analyzeJurisprudence(deps, { jurisprudenceId: J1 })), "MODEL_UNAVAILABLE")
  })

  it("comparação com o processo: referência inventada é descartada; contagem vem das válidas", async () => {
    const { deps } = withDecisions(
      makeDeps(() => ({
        visao_geral: "Uma decisão é muito parecida.",
        decisoes: [
          { ref: "J1", semelhanca: "alta", motivo: "Mesmo tema." },
          { ref: "[j2]", semelhanca: "baixa", motivo: "Outro tema." },
          { ref: "J9", semelhanca: "alta", motivo: "Decisão inventada." },
          { ref: "J1", semelhanca: "alta", motivo: "Repetida." },
        ],
        cuidados: [],
      })),
    )
    const result = await analyzeRelatedJurisprudence(deps, { processId: processA.id, ids: [J1, J2] })
    assert.deepEqual(
      result.data.decisoes.map((d) => d.ref),
      ["J1", "J2"],
    )
    assert.deepEqual(result.counts, { alta: 1, media: 0, baixa: 1 })
    assert.equal(result.analyzed, 2)
  })

  it("sem nenhuma decisão válida → INSUFFICIENT_DATA", async () => {
    const { deps, calls } = withDecisions(makeDeps(() => ({})))
    assert.equal(await failure(analyzeRelatedJurisprudence(deps, { processId: processA.id, ids: ["44444444-4444-4444-8444-444444444444"] })), "INSUFFICIENT_DATA")
    assert.equal(calls.length, 0)
  })
})
