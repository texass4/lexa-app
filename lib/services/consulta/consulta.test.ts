import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LookupError } from "@/lib/integrations/legal/errors"
import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"
import type { ExternalProcess } from "@/lib/integrations/legal/types"
import type { Communication } from "@/lib/integrations/legal/djen/mapper"
import { buildProcessSheet } from "@/lib/services/processos/sheet"
import type { Process } from "@/types"
import { collectMentions, mentionsIn } from "./magistrate"
import { sameValue } from "./report"
import { cachedCommunications } from "./sources"
import { EnrichmentError, REUSE_RECENT_MS, executeRun, processCnj, startEnrichment, type ServiceDeps } from "./service"
import type { EnrichmentStore, NewRun } from "./store"
import { runWorkflow, type CommunicationsResult, type RunState, type WorkflowDeps } from "./workflow"

/* ---------------------------------------------------------------- cenário */

// Ficha no formato real da API pública do DataJud (fixture da integração).
const CNJ = "00008323520184013202"
const sheet = buildProcessSheet(mapSearchResponse(trf1Response, CNJ) as ExternalProcess)
const NOW = new Date("2026-10-09T15:00:00Z")

/** Comunicações de TESTE (só existem aqui), no formato normalizado pelo mapper do DJEN. */
const comm = (patch: Partial<Communication> = {}): Communication => ({
  externalId: "c1",
  date: "2026-09-30",
  cnj: CNJ,
  tribunal: "TRF1",
  unit: "Tefé",
  type: "Intimação",
  documentType: "Despacho",
  className: "Procedimento do Juizado Especial Cível",
  text: "Intime-se a parte autora. Tefé, 30 de setembro de 2026.\nMARIA DE SOUZA LIMA\nJuíza Federal",
  url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao/abc/certidao",
  recipients: [{ name: "JOÃO DA SILVA", pole: "A" }],
  lawyers: [{ name: "ANA ADVOGADA", oab: "AM 1.234" }],
  cancelled: false,
  ...patch,
})

const office = (patch: Partial<Process> = {}): Process =>
  ({
    id: "p_1",
    organizationId: "org-a",
    createdAt: "2026-01-01T00:00:00",
    number: sheet.number,
    cnj: CNJ,
    code: "#103001",
    clientId: "c_1",
    area: "Previdenciário",
    type: "Ação previdenciária",
    court: "Juizado de Tefé",
    district: "",
    opposingParty: "INSS",
    status: "em_andamento",
    ownerId: "u_1",
    claimValue: 12000,
    distributedAt: "2026-01-01",
    lastMovementAt: "2026-01-01T00:00:00",
    movements: [],
    ...patch,
  }) as Process

function deps(overrides: Partial<WorkflowDeps> = {}): WorkflowDeps & { calls: { primary: number; communications: number }; states: RunState[] } {
  const calls = { primary: 0, communications: 0 }
  const states: RunState[] = []
  return {
    calls,
    states,
    now: () => NOW,
    primary: async () => {
      calls.primary += 1
      return { sheet, checkedAt: NOW.toISOString(), cached: false }
    },
    communications: null,
    jurisprudence: async () => ({ items: [], total: 0, basis: ["assunto: Concessão"] }),
    progress: async (state) => void states.push(structuredClone(state)),
    ...overrides,
  }
}

const source = (state: RunState, id: string) => state.sources.find((s) => s.id === id)!
const step = (state: RunState, id: string) => state.steps.find((s) => s.id === id)!
const fieldValues = (state: RunState, key: string) => state.report!.fields.find((f) => f.key === key)!.values

/* ------------------------------------------------------------------ testes */

describe("consulta processual — número CNJ", () => {
  it("número inválido: falha na validação, sem consultar fonte nenhuma", async () => {
    const d = deps()
    const state = await runWorkflow({ cnj: "0000832-35.2018.4.01.3203" }, d)
    assert.equal(state.status, "failed")
    assert.equal(step(state, "validar").status, "failed")
    assert.equal(d.calls.primary, 0)
    assert.ok(state.steps.slice(1).every((s) => s.status === "skipped"))
  })

  it("número válido (com ou sem máscara) segue para as fontes", async () => {
    const d = deps()
    const state = await runWorkflow({ cnj: sheet.number }, d)
    assert.equal(step(state, "validar").status, "done")
    assert.equal(d.calls.primary, 1)
  })

  it("serviço recusa número inválido antes de criar a execução", async () => {
    const { serviceDeps, store } = memoryService()
    await assert.rejects(startEnrichment({ organizationId: "org-a", userId: "u", cnj: "123" }, serviceDeps), (e: unknown) => e instanceof EnrichmentError && e.code === "INVALID_CNJ")
    assert.equal(store.rows.length, 0)
    assert.equal(processCnj({ number: "", cnj: undefined }), undefined)
    assert.equal(processCnj({ number: sheet.number, cnj: undefined }), CNJ)
  })
})

describe("consulta processual — resultados", () => {
  it("sucesso: relatório com fonte e data em cada dado, e o que faltou como indisponível", async () => {
    const d = deps()
    const state = await runWorkflow({ cnj: CNJ }, d)
    assert.equal(state.status, "completed")
    assert.equal(source(state, "datajud").status, "ok")
    assert.equal(source(state, "djen").status, "not_configured")
    const tribunal = fieldValues(state, "tribunal")[0]
    assert.equal(tribunal.source, "datajud")
    assert.equal(tribunal.checkedAt, NOW.toISOString())
    assert.equal(tribunal.url, "https://www.trf1.jus.br")
    assert.equal(fieldValues(state, "classe")[0].value, "Procedimento do Juizado Especial Cível")
    assert.equal(fieldValues(state, "orgao_julgador")[0].value, "Tefé")
    assert.equal(state.report!.movements.total, 3)
    const missing = state.report!.unavailable.map((u) => u.label)
    for (const label of ["Valor da causa", "Prioridades e características", "Partes", "Magistrado", "Perfil institucional do magistrado"]) assert.ok(missing.includes(label), label)
    assert.ok(state.foundFields.includes("Tribunal"))
    assert.equal(state.dataVersion, sheet.updatedAt)
    // Etapas visíveis, na ordem, todas resolvidas.
    assert.deepEqual(
      state.steps.map((s) => s.status),
      ["done", "done", "done", "done", "done", "done", "done", "done"],
    )
    // O progresso foi gravado a cada etapa (a tela acompanha).
    assert.ok(d.states.length >= 8)
  })

  it("resultado parcial: fonte complementar fora do ar não derruba o relatório", async () => {
    const state = await runWorkflow(
      { cnj: CNJ },
      deps({
        communications: async () => {
          throw new LookupError("UNAVAILABLE", "HTTP 503 detalhe interno")
        },
      }),
    )
    assert.equal(state.status, "partial")
    assert.equal(source(state, "djen").status, "unavailable")
    assert.equal(step(state, "complementares").status, "partial")
    assert.ok(state.report!.fields.length > 0)
    // Detalhe técnico só no registro interno.
    assert.ok(!JSON.stringify(state.sources).includes("HTTP 503"))
    assert.ok(state.internalErrors.some((e) => e.source === "djen" && e.detail?.includes("HTTP 503")))
  })

  it("fonte principal indisponível: mostra o que as outras trouxeram e avisa", async () => {
    const state = await runWorkflow(
      { cnj: CNJ },
      deps({
        primary: async () => {
          throw new LookupError("UNAVAILABLE", "sem resposta")
        },
        communications: async (): Promise<CommunicationsResult> => ({ items: [comm()], total: 1, checkedAt: NOW.toISOString(), cached: false }),
      }),
    )
    assert.equal(state.status, "partial")
    assert.equal(step(state, "fonte_principal").status, "failed")
    assert.ok(state.report!.notices.some((n) => n.includes("não respondeu")))
    assert.equal(state.report!.parties.items[0].name, "JOÃO DA SILVA")
    assert.equal(state.report!.parties.items[0].pole, "Polo ativo")
    assert.equal(state.report!.parties.lawyers[0].oab, "AM 1.234")
    assert.equal(fieldValues(state, "orgao_julgador")[0].source, "djen")
  })

  it("limite da fonte (429) e demora: estados distintos, sem travar a consulta", async () => {
    const limited = await runWorkflow(
      { cnj: CNJ },
      deps({
        primary: async () => {
          throw new LookupError("RATE_LIMIT", "HTTP 429", { retryAfterMs: 60_000 })
        },
      }),
    )
    assert.equal(source(limited, "datajud").status, "rate_limited")
    assert.equal(limited.status, "failed")

    const slow = await runWorkflow(
      { cnj: CNJ },
      {
        ...deps({ primary: () => new Promise(() => {}) }),
        now: () => new Date(),
        timeouts: { primary: 20, complementary: 20 },
      },
    )
    assert.equal(source(slow, "datajud").status, "timeout")
    assert.equal(step(slow, "relatorio").status, "failed")
  })

  it("não encontrado na fonte principal: relatório diz isso, sem inventar dados", async () => {
    const state = await runWorkflow(
      { cnj: CNJ },
      deps({
        primary: async () => {
          throw new LookupError("NOT_FOUND", "sem hits")
        },
      }),
    )
    assert.equal(state.report!.summary.notFound, true)
    assert.ok(state.report!.notices.some((n) => n.includes("não tem este número")))
    assert.equal(fieldValues(state, "tribunal").length, 0)
  })
})

describe("consulta processual — magistrado", () => {
  it("não identificado: o nome do órgão julgador nunca vira nome de juiz", async () => {
    const state = await runWorkflow({ cnj: CNJ }, deps())
    const m = state.report!.magistrate
    assert.equal(m.mentions.length, 0)
    assert.equal(m.unit?.value, "Tefé")
    assert.match(m.note, /não identificado/i)
    assert.equal(m.verifyUrl, "https://www.trf1.jus.br")
  })

  it("menção explícita com papel no texto: datada, com trecho e link — não é 'responsável atual'", async () => {
    const state = await runWorkflow(
      { cnj: CNJ },
      deps({ communications: async () => ({ items: [comm()], total: 1, checkedAt: NOW.toISOString(), cached: false }) }),
    )
    const [mention] = state.report!.magistrate.mentions
    assert.equal(mention.name, "Maria de Souza Lima")
    assert.equal(mention.role, "juiz")
    assert.equal(mention.date, "2026-09-30")
    assert.ok(mention.url?.startsWith("https://"))
    assert.match(state.report!.magistrate.note, /não confirma quem é o magistrado responsável hoje/)
  })

  it("assinatura de servidor e textos sem papel não contam", () => {
    assert.deepEqual(mentionsIn({ text: "Assinado eletronicamente por: CARLOS ALBERTO DIAS (Técnico Judiciário)", source: "djen" }), [])
    assert.deepEqual(mentionsIn({ text: "Comarca da Capital - 1ª Vara Cível\nJuízo da 1ª Vara Cível", source: "djen" }), [])
    assert.deepEqual(mentionsIn({ text: "relator: o processo foi distribuído", source: "djen" }), [])
  })

  it("relator, desembargador e ministro são papéis distintos; a mesma pessoa aparece uma vez (a mais recente)", () => {
    const mentions = collectMentions([
      { text: "APELAÇÃO CÍVEL. RELATOR: DES. ANTÔNIO CARLOS SANTOS. Intimação.", date: "2026-05-01", source: "djen" },
      { text: "Relator(a): Des. Antônio Carlos Santos", date: "2026-08-01", source: "djen" },
      { text: "Desembargadora Federal Relatora: ANA MARIA FONSECA", date: "2026-07-01", source: "djen" },
      { text: "Documento Assinado Eletronicamente Por JOÃO PEREIRA, Juiz de Direito Substituto, em 25/09/2025", date: "2025-09-25", source: "djen" },
    ])
    const antonio = mentions.filter((m) => m.name === "Antônio Carlos Santos")
    assert.equal(antonio.length, 1)
    assert.equal(antonio[0].date, "2026-08-01")
    assert.equal(antonio[0].role, "relator")
    assert.equal(mentions.find((m) => m.name === "Ana Maria Fonseca")?.roleLabel, "Desembargador(a) Relator(a)")
    assert.equal(mentions.find((m) => m.name === "João Pereira")?.roleLabel, "Juiz(a) de Direito Substituto(a)")
  })
})

describe("consulta processual — divergências e cadastro do escritório", () => {
  it("fontes que discordam ficam lado a lado, sem escolha automática", async () => {
    const state = await runWorkflow(
      { cnj: CNJ, process: office({ judicialUnit: "2ª Vara Federal de Manaus" }) },
      deps({ communications: async () => ({ items: [comm({ unit: "Juizado Especial Federal de Tefé" })], total: 1, checkedAt: NOW.toISOString(), cached: false }) }),
    )
    const unit = state.report!.fields.find((f) => f.key === "orgao_julgador")!
    assert.equal(unit.conflict, true)
    assert.deepEqual(
      unit.values.map((v) => v.source),
      ["datajud", "djen", "cadastro"],
    )
    assert.ok(state.report!.conflicts.some((c) => c.label === "Órgão julgador"))
    assert.ok(state.report!.office!.fields.find((f) => f.label === "Órgão julgador")!.differs)
    // Mesmo texto com acento/caixa/ordinal diferente não é divergência.
    assert.ok(sameValue("1ª Vara Cível", "1 VARA CIVEL da Comarca da Capital"))
  })

  it("dados manuais são preservados: a consulta nunca altera o processo", async () => {
    const process = office({ origin: "manual", tribunal: "TJAM (informado)", degree: "G2" })
    const before = structuredClone(process)
    const state = await runWorkflow({ cnj: CNJ, process, clientName: "Maria Cliente" }, deps())
    assert.deepEqual(process, before)
    const o = state.report!.office!
    assert.equal(o.manual, true)
    assert.equal(o.canApply, true)
    assert.match(o.applyNote, /mantido/)
    assert.equal(o.fields.find((f) => f.label === "Tribunal")!.office, "TJAM (informado)")
    assert.equal(o.label, "Maria Cliente — Ação previdenciária")
    assert.equal(source(state, "cadastro").status, "ok")
  })

  it("segredo de justiça: nenhuma fonte pública é consultada e nada é aplicado", async () => {
    const d = deps({ communications: async () => ({ items: [comm()], total: 1, checkedAt: NOW.toISOString(), cached: false }) })
    const state = await runWorkflow({ cnj: CNJ, process: office({ secret: true }) }, d)
    assert.equal(d.calls.primary, 0)
    assert.equal(source(state, "datajud").status, "skipped")
    assert.equal(source(state, "djen").status, "skipped")
    assert.equal(step(state, "fonte_principal").status, "skipped")
    assert.equal(state.report!.office!.canApply, false)
    assert.ok(state.report!.notices.some((n) => n.includes("segredo de justiça")))
    assert.equal(state.report!.parties.items.length, 0)
    assert.equal(state.status, "completed")
  })

  it("sigilo informado pela fonte: partes não são exibidas", async () => {
    const secretSheet = { ...sheet, secrecyLevel: 2 }
    const state = await runWorkflow(
      { cnj: CNJ },
      deps({
        primary: async () => ({ sheet: secretSheet, checkedAt: NOW.toISOString(), cached: false }),
        communications: async () => ({ items: [comm()], total: 1, checkedAt: NOW.toISOString(), cached: false }),
      }),
    )
    assert.equal(state.report!.parties.items.length, 0)
    assert.ok(state.report!.notices.some((n) => n.includes("nível 2")))
  })
})

/* -------------------------------------------- serviço: cache e duplicidade */

function memoryService(options: { allow?: boolean } = {}) {
  let clock = NOW.getTime()
  const rows: { id: string; org: string; cnj: string; status: string; startedAt: string; finishedAt?: string; state: RunState; processId?: string | null }[] = []
  const deferred: Promise<unknown>[] = []
  let seq = 0
  let createReturnsNull = false
  const store: EnrichmentStore & { rows: typeof rows; failNextCreate: () => void } = {
    rows,
    failNextCreate: () => {
      createReturnsNull = true
    },
    async findRecent(org, cnj, since) {
      const r = rows.filter((x) => x.org === org && x.cnj === cnj && ["completed", "partial"].includes(x.status) && (x.finishedAt ?? "") >= since)
      return r.length ? { id: r[r.length - 1].id } : null
    },
    async findRunning(org, cnj) {
      const r = rows.find((x) => x.org === org && x.cnj === cnj && x.status === "running")
      return r ? { id: r.id, startedAt: r.startedAt } : null
    },
    async expireStale(org, cnj, before) {
      for (const r of rows) if (r.org === org && r.cnj === cnj && r.status === "running" && r.startedAt < before) r.status = "failed"
    },
    async create(run: NewRun) {
      if (createReturnsNull) {
        createReturnsNull = false
        return null
      }
      if (rows.some((x) => x.org === run.organizationId && x.cnj === run.cnj && x.status === "running")) return null
      const id = `run-${++seq}`
      rows.push({ id, org: run.organizationId, cnj: run.cnj, status: "running", startedAt: new Date(clock).toISOString(), state: run.state, processId: run.processId })
      return id
    },
    async update(org, id, state, final, finishedAt) {
      const r = rows.find((x) => x.id === id && x.org === org)!
      r.state = state
      r.status = state.status
      if (final) r.finishedAt = finishedAt
    },
    async prune() {},
  }
  const serviceDeps: ServiceDeps = {
    store,
    now: () => new Date(clock),
    allow: async () => options.allow ?? true,
    sources: { primary: deps().primary, communications: null, jurisprudence: null },
    // Execução em segundo plano: guardada para o teste esperar quando quiser.
    defer: (task) => void deferred.push(task),
    log: () => {},
  }
  return {
    store,
    serviceDeps,
    advance: (ms: number) => {
      clock += ms
    },
    settle: () => Promise.all(deferred),
  }
}

describe("consulta processual — cache e duplicidade", () => {
  const input = { organizationId: "org-a", userId: "u-1", cnj: CNJ }

  it("pedido repetido enquanto roda reaproveita a mesma execução", async () => {
    const { serviceDeps, store } = memoryService()
    const first = await startEnrichment(input, serviceDeps)
    const second = await startEnrichment(input, serviceDeps)
    assert.equal(first.reused, false)
    assert.equal(second.runId, first.runId)
    assert.equal(second.reused, "running")
    assert.equal(store.rows.length, 1)
  })

  it("consulta concluída há pouco é reaproveitada; 'Consultar novamente' (force) cria outra", async () => {
    const { serviceDeps, store, settle, advance } = memoryService()
    const first = await startEnrichment(input, serviceDeps)
    await settle()
    assert.equal(store.rows[0].status, "completed")
    advance(60_000)
    const again = await startEnrichment(input, serviceDeps)
    assert.deepEqual(again, { runId: first.runId, reused: "recent" })
    const forced = await startEnrichment({ ...input, force: true }, serviceDeps)
    assert.notEqual(forced.runId, first.runId)
    await settle()
    advance(REUSE_RECENT_MS + 1)
    const later = await startEnrichment(input, serviceDeps)
    assert.equal(later.reused, false)
  })

  it("escritórios diferentes nunca compartilham execução", async () => {
    const { serviceDeps } = memoryService()
    const a = await startEnrichment(input, serviceDeps)
    const b = await startEnrichment({ ...input, organizationId: "org-b" }, serviceDeps)
    assert.notEqual(a.runId, b.runId)
    assert.equal(b.reused, false)
  })

  it("corrida ao criar (dois pedidos no mesmo instante) devolve a que ganhou", async () => {
    const { serviceDeps, store } = memoryService()
    const first = await startEnrichment(input, serviceDeps)
    store.failNextCreate()
    const second = await startEnrichment({ ...input, force: true }, serviceDeps)
    assert.equal(second.runId, first.runId)
  })

  it("execução 'rodando' esquecida (servidor caiu) expira e não bloqueia", async () => {
    const { serviceDeps, store, advance } = memoryService()
    // Execução que ficou "rodando" (o servidor caiu antes de terminar).
    const stuck = (await store.create({ organizationId: "org-a", cnj: CNJ, requestedBy: "u", forced: false, state: {} as RunState }))!
    advance(60_000)
    assert.equal((await startEnrichment(input, serviceDeps)).runId, stuck)
    advance(6 * 60_000)
    const second = await startEnrichment(input, serviceDeps)
    assert.notEqual(second.runId, stuck)
    assert.equal(store.rows.find((r) => r.id === stuck)!.status, "failed")
  })

  it("acima do limite de consultas: recusa com mensagem, sem criar execução", async () => {
    const { serviceDeps, store } = memoryService({ allow: false })
    await assert.rejects(startEnrichment(input, serviceDeps), (e: unknown) => e instanceof EnrichmentError && e.code === "RATE_LIMIT")
    assert.equal(store.rows.length, 0)
  })

  it("falha inesperada vira execução 'failed' registrada (nunca fica rodando)", async () => {
    const { serviceDeps, store } = memoryService()
    const id = (await store.create({ organizationId: "org-a", cnj: CNJ, requestedBy: "u", forced: false, state: {} as RunState }))!
    const broken = {
      ...serviceDeps,
      store: {
        ...store,
        update: async (...args: Parameters<EnrichmentStore["update"]>) => {
          if (!args[3]) throw new Error("banco fora")
          return store.update(...args)
        },
      },
    }
    // Progresso falhando não interrompe; o registro final sai.
    const state = await executeRun(id, { ...input }, broken)
    assert.equal(state?.status, "completed")
    assert.ok(state?.internalErrors.some((e) => e.code === "PROGRESS"))
  })

  it("comunicações: cache por escritório, 'force' ignora o cache e chamadas simultâneas viram uma", async () => {
    let calls = 0
    let clock = 0
    const fetchItems = async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 5))
      return { items: [comm()], total: 1 }
    }
    const forOrg = cachedCommunications(fetchItems, { now: () => clock, ttlMs: 1000 })
    const a = forOrg("org-a")
    const [x, y] = await Promise.all([a(CNJ, { force: false }), a(CNJ, { force: false })])
    assert.equal(calls, 1)
    assert.equal(x.cached, false)
    assert.equal(y.cached, false)
    assert.equal((await a(CNJ, { force: false })).cached, true)
    assert.equal(calls, 1)
    await forOrg("org-b")(CNJ, { force: false })
    assert.equal(calls, 2)
    await a(CNJ, { force: true })
    assert.equal(calls, 3)
    clock += 2000
    assert.equal((await a(CNJ, { force: false })).cached, false)
  })
})
