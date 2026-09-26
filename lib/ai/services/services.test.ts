import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { RateLimiter, ResultCache } from "../guard"
import { ROLE_DEFAULTS } from "@/lib/auth/permissions"
import { createSupabaseRepository } from "../context/repository"
import { buildProcessContext, loadProcessData } from "../context/process"
import { computeOfficeMetrics, loadOfficeData } from "../context/office"
import { AIError } from "../errors"
import { ORG_A, NOW, SECRET_B, fakeSupabase, makeDeps, processA, processB, promptText, seedTables, validSummary } from "../__fixtures__/data"
import { analyzeMovement, suggestNextActions, summarizeProcess } from "./process"
import { summarizeClient } from "./client"
import { officeOverview } from "./office"
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
    { titulo: "Verificar destino da remessa", descricao: "Consultar o tribunal.", prioridade: "media", justificativa: "Remessa em 24/09/2026.", refs: ["M1"] },
  ],
  informacoes_ausentes: [],
}

describe("repositório da IA (isolamento por escritório)", () => {
  it("só devolve registros do escritório de quem chama", async () => {
    const { supabase } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, () => true)
    assert.deepEqual((await repo.listClients()).map((c) => c.id), ["c_a1"])
    assert.deepEqual((await repo.listTasks()).map((t) => t.id), ["t_a1"])
    assert.deepEqual((await repo.listProcessOverviews()).map((p) => p.id), ["p_a1"])
    assert.deepEqual((await repo.listMembers()).map((m) => m.name), ["Ana Advogada"])
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
    await loadOfficeData(repo)
    await repo.getProcess(processA.id)
    assert.ok(queries.length > 5)
    for (const query of queries) assert.ok(query.filters.some(([col, value]) => col === "organization_id" && value === ORG_A), query.table)
  })

  it("respeita as permissões do módulo", async () => {
    const { supabase } = fakeSupabase()
    const repo = createSupabaseRepository(supabase, ORG_A, (p) => p === "processes.view")
    assert.deepEqual(await repo.listInvoices(), [])
    assert.deepEqual(await repo.listTasks(), [])
    assert.equal(await repo.getClient("c_a1"), null)
    assert.ok(await repo.getProcess(processA.id))
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
    assert.deepEqual(result.data.movimentacoes_relevantes.map((n) => n.ref), ["M1"])
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

  it("dois pedidos iguais = uma chamada; o segundo vem do cache", async () => {
    const { deps, calls } = makeDeps(() => validSummary)
    const [first, second] = await Promise.all([summarizeProcess(deps, processA.id), summarizeProcess(deps, processA.id)])
    assert.equal(calls.length, 1)
    assert.deepEqual(first.data, second.data)
    const third = await summarizeProcess(deps, processA.id)
    assert.equal(third.cached, true)
    assert.equal(calls.length, 1)
  })

  it("limite de uso → RATE_LIMITED antes de chamar o modelo", async () => {
    const limiter = new RateLimiter()
    const { deps, calls } = makeDeps(() => nextActions, { limiter })
    for (let i = 0; i < 8; i++) {
      deps.cache = new ResultCache()
      // Contexto muda a cada pedido (sem cache) para forçar chamadas reais.
      deps.now = new Date(NOW.getTime() + i * 86_400_000)
      await suggestNextActions(deps, processA.id)
    }
    deps.now = new Date(NOW.getTime() + 9 * 86_400_000)
    assert.equal(await failure(suggestNextActions(deps, processA.id)), "RATE_LIMITED")
    assert.equal(calls.length, 8)
  })
})

describe("prazos", () => {
  it("sem prazo nos dados, o contexto diz isso e não traz data inventada", async () => {
    const { deps } = makeDeps(() => validSummary)
    const data = await loadProcessData(deps.repo, processA.id)
    const { context } = buildProcessContext(data, NOW)
    assert.equal((context.processo as Record<string, unknown>).prazo_cadastrado_no_lexa, "nenhum prazo cadastrado")
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
