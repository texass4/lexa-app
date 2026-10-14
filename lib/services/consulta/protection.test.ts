import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SupabaseClient } from "@supabase/supabase-js"
import { LookupError } from "@/lib/integrations/legal/errors"
import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"
import { createDataJudClient } from "@/lib/integrations/legal/datajud/client"
import { createDjenClient } from "@/lib/integrations/legal/djen/client"
import type { ExternalProcess } from "@/lib/integrations/legal/types"
import type { Communication } from "@/lib/integrations/legal/djen/mapper"
import { buildProcessSheet, type ProcessSheet } from "@/lib/services/processos/sheet"
import { isSecretInOffice } from "@/lib/services/processos/secret-guard"
import type { Process } from "@/types"
import { JURISPRUDENCE_STATE_MESSAGE, jurisprudenceMessage, jurisprudenceState } from "./jurisprudence-state"
import { processProtection, redactStoredReport } from "./protection"
import { assembleReport } from "./report"
import { cachedCommunications } from "./sources"
import type { EnrichmentReport, JurisprudenceState } from "./types"
import { runWorkflow, withTimeout, type CommunicationsResult, type WorkflowDeps } from "./workflow"

/*
 * Tudo aqui é FICTÍCIO ou de fixture pública de formato: nenhum processo sigiloso real,
 * nenhuma chamada de rede (fetch falso), nenhum banco.
 */

const CNJ = "00008323520184013202"
const NOW = new Date("2026-10-09T15:00:00Z")
const base = buildProcessSheet(mapSearchResponse(trf1Response, CNJ) as ExternalProcess)
/** Ficha com o nível de sigilo pedido (`undefined` = a fonte não informou). */
const sheetWith = (secrecyLevel: number | undefined, patch: Partial<ProcessSheet> = {}): ProcessSheet => ({
  ...base,
  secrecyLevel,
  movements: base.movements.map((m, i) => (i === 0 ? { ...m, description: "Complemento fictício citando FULANO DE TAL" } : m)),
  ...patch,
})

const comm = (patch: Partial<Communication> = {}): Communication => ({
  externalId: "c1",
  date: "2026-09-30",
  cnj: CNJ,
  tribunal: "TRF1",
  unit: "Vara fictícia",
  type: "Intimação",
  documentType: "Despacho",
  className: "Classe fictícia",
  text: "Texto fictício de comunicação. FULANA DE TAL\nJuíza Federal",
  url: "https://exemplo.invalid/certidao",
  recipients: [{ name: "PARTE FICTÍCIA", pole: "A" }],
  lawyers: [{ name: "ADVOGADA FICTÍCIA", oab: "XX 0.000" }],
  cancelled: false,
  ...patch,
})

const office = (patch: Partial<Process> = {}): Process =>
  ({
    id: "p_ficticio",
    organizationId: "org-a",
    createdAt: "2026-01-01T00:00:00",
    number: base.number,
    cnj: CNJ,
    code: "#1",
    clientId: "c_1",
    area: "Cível",
    type: "Ação fictícia",
    court: "Vara fictícia",
    district: "",
    opposingParty: "Parte fictícia",
    status: "em_andamento",
    ownerId: "u_1",
    claimValue: 0,
    distributedAt: "2026-01-01",
    lastMovementAt: "2026-01-01T00:00:00",
    movements: [],
    ...patch,
  }) as Process

/** Dependências que CONTAM cada chamada externa e guardam o sinal recebido. */
function counted(sheet: ProcessSheet | null, overrides: Partial<WorkflowDeps> = {}) {
  const calls = { primary: 0, communications: 0, superior: 0, jurisprudence: 0 }
  const deps: WorkflowDeps = {
    now: () => NOW,
    primary: async () => {
      calls.primary += 1
      if (!sheet) throw new LookupError("NOT_FOUND", "fictício")
      return { sheet, checkedAt: NOW.toISOString(), cached: false }
    },
    communications: async (): Promise<CommunicationsResult> => {
      calls.communications += 1
      return { items: [comm()], total: 1, checkedAt: NOW.toISOString(), cached: false }
    },
    superior: async () => {
      calls.superior += 1
      return { dataset: "api_publica_stj", records: [], checkedAt: NOW.toISOString() }
    },
    jurisprudence: async () => {
      calls.jurisprudence += 1
      return { items: [], total: 0, basis: ["assunto: fictício"] }
    },
    progress: async () => {},
    ...overrides,
  }
  return { deps, calls }
}

/** Nada de comunicação/partes/menções/complementos no relatório gravado. */
function assertNoRestricted(report: EnrichmentReport) {
  assert.equal(report.communications.items.length, 0, "comunicações")
  assert.equal(report.parties.items.length, 0, "partes")
  assert.equal(report.parties.lawyers.length, 0, "advogados")
  assert.equal(report.magistrate.mentions.length, 0, "menções")
  assert.ok(report.movements.items.every((m) => !m.description), "complementos das movimentações")
  assert.ok(report.fields.every((f) => f.values.every((v) => v.source !== "djen")), "valores vindos do DJEN")
  const text = JSON.stringify(report)
  assert.ok(!text.includes("FULANO DE TAL") && !text.includes("FULANA DE TAL") && !text.includes("PARTE FICTÍCIA"), "nenhum nome restrito")
}

describe("sigilo — regra central", () => {
  it("cadastro, fonte com nível > 0, nível 0 e nível não informado são situações distintas", () => {
    assert.deepEqual(processProtection({ process: { secret: true }, sheet: sheetWith(0) }), { level: "protected", reason: "cadastro" })
    assert.deepEqual(processProtection({ sheet: sheetWith(5) }), { level: "protected", reason: "fonte" })
    assert.deepEqual(processProtection({ sheet: sheetWith(0) }), { level: "public", reason: "fonte_publica" })
    assert.deepEqual(processProtection({ sheet: sheetWith(undefined) }), { level: "unknown", reason: "fonte_sem_nivel" })
    assert.deepEqual(processProtection({}), { level: "unknown", reason: "sem_fonte" })
  })
})

describe("sigilo — nenhuma consulta externa indevida, nada restrito gravado", () => {
  it("segredo de justiça no CADASTRO (manual): nenhuma fonte externa é chamada", async () => {
    const { deps, calls } = counted(sheetWith(0))
    const state = await runWorkflow({ cnj: CNJ, process: office({ secret: true, origin: "manual" } as Partial<Process>) }, deps)
    assert.deepEqual({ ...calls, jurisprudence: undefined }, { primary: 0, communications: 0, superior: 0, jurisprudence: undefined })
    assertNoRestricted(state.report!)
    assert.equal(state.sources.find((s) => s.id === "djen")!.message, "Não consultada: processo em segredo de justiça.")
    assert.equal(state.report!.office!.canApply, false)
  })

  it("sigilo informado pelo DATAJUD (nível > 0): DJEN e superior não são chamados; nada restrito gravado", async () => {
    const { deps, calls } = counted(sheetWith(3))
    const state = await runWorkflow({ cnj: CNJ }, deps)
    assert.equal(calls.primary, 1)
    assert.equal(calls.communications, 0, "DJEN não pode ser consultado")
    assert.equal(calls.superior, 0, "superior não é consultado para processo protegido")
    assertNoRestricted(state.report!)
    assert.equal(state.sources.find((s) => s.id === "djen")!.message, "Não consultada: a fonte principal informa sigilo.")
    assert.ok(state.report!.notices.some((n) => n.includes("informa sigilo (nível 3)")))
    // Metadados legítimos da fonte continuam: número, classe, movimentos (sem o complemento).
    assert.equal(state.report!.movements.total, base.movements.length)
    assert.ok(state.report!.fields.find((f) => f.key === "classe")!.values.some((v) => v.source === "datajud"))
  })

  it("nível de sigilo NÃO informado pela fonte: não é tratado como público", async () => {
    const { deps, calls } = counted(sheetWith(undefined))
    const state = await runWorkflow({ cnj: CNJ }, deps)
    assert.equal(calls.communications, 0)
    assert.equal(calls.superior, 1, "superior (metadados do DataJud) segue permitido quando o nível é desconhecido")
    assertNoRestricted(state.report!)
    assert.ok(state.report!.notices.some((n) => n.includes("não informou o nível de sigilo")))
  })

  it("processo público (nível 0): fluxo normal preservado, com comunicações e partes", async () => {
    const { deps, calls } = counted(sheetWith(0))
    const state = await runWorkflow({ cnj: CNJ }, deps)
    assert.equal(calls.communications, 1)
    assert.equal(state.report!.communications.items.length, 1)
    assert.equal(state.report!.parties.items[0].name, "PARTE FICTÍCIA")
    assert.ok(state.report!.movements.items.some((m) => m.description?.includes("Complemento fictício")))
  })

  it("segunda trava: mesmo que comunicações cheguem à montagem, processo não público não as grava", () => {
    const report = assembleReport({
      cnj: CNJ,
      now: NOW,
      primary: { sheet: sheetWith(undefined), checkedAt: NOW.toISOString() },
      primaryStatus: "ok",
      communications: { items: [comm()], total: 1, checkedAt: NOW.toISOString() },
      communicationsStatus: "ok",
    })
    assertNoRestricted(report)
  })

  it("relatório antigo gravado com conteúdo restrito: some na leitura; relatório público fica igual", () => {
    const leaky = assembleReport({
      cnj: CNJ,
      now: NOW,
      primary: { sheet: sheetWith(0), checkedAt: NOW.toISOString() },
      primaryStatus: "ok",
      communications: { items: [comm()], total: 1, checkedAt: NOW.toISOString() },
      communicationsStatus: "ok",
    })
    assert.equal(redactStoredReport(leaky), leaky, "público: o mesmo objeto, nada muda")
    // Simula um relatório antigo sem o nível informado (gravado antes da regra).
    const old = { ...leaky, fields: leaky.fields.map((f) => (f.key === "sigilo" ? { ...f, values: [] } : f)) }
    const read = redactStoredReport(old)
    assertNoRestricted(read)
    assert.equal(old.communications.items.length, 1, "o registro original não é alterado")
  })

  it("trava das rotas de consulta pelo navegador: pergunta só pelo próprio escritório e falha fechada", async () => {
    const seen: { filters: [string, unknown][]; or?: string } = { filters: [] }
    const fake = (rows: unknown[], error: unknown = null) =>
      ({
        from: () => {
          const q = {
            select: () => q,
            eq: (c: string, v: unknown) => (seen.filters.push([c, v]), q),
            or: (expr: string) => ((seen.or = expr), q),
            limit: async () => ({ data: rows, error }),
          }
          return q
        },
      }) as unknown as SupabaseClient
    assert.equal(await isSecretInOffice(fake([{ id: "p" }]), "org-a", CNJ, "p_1"), true)
    assert.deepEqual(seen.filters, [
      ["organization_id", "org-a"],
      ["data->>secret", "true"],
    ])
    assert.match(seen.or!, /id\.eq\.p_1/)
    assert.equal(await isSecretInOffice(fake([]), "org-a", CNJ), false)
    assert.equal(await isSecretInOffice(fake([], { message: "falha" }), "org-a", CNJ), true, "erro ao ler o cadastro: não consulta")
  })

  it("cache das comunicações é por escritório: um escritório nunca recebe o resultado do outro", async () => {
    let fetches = 0
    const forOrg = cachedCommunications(async () => {
      fetches += 1
      return { items: [comm({ externalId: `c${fetches}` })], total: 1 }
    })
    await forOrg("org-a")(CNJ, { force: false })
    const b = await forOrg("org-b")(CNJ, { force: false })
    assert.equal(fetches, 2)
    assert.equal(b.cached, false)
    assert.equal((await forOrg("org-a")(CNJ, { force: false })).cached, true)
  })
})

describe("jurisprudência — estados distintos (não rodar ≠ não achar)", () => {
  const run = async (jurisprudence: WorkflowDeps["jurisprudence"], process: Process | null = office(), timeouts?: WorkflowDeps["timeouts"]) => {
    const { deps } = counted(sheetWith(0), { jurisprudence, timeouts })
    const state = await runWorkflow({ cnj: CNJ, process }, deps)
    return { state, j: state.report!.jurisprudence, source: state.sources.find((s) => s.id === "jurisprudencia")! }
  }

  it("termos insuficientes (a fonte recusa pesquisar): 'não realizada', nunca 'sem resultado'", async () => {
    const { j, source } = await run(async () => ({ items: [], total: 0, basis: [], message: "O processo não tem assunto nem tipo de ação para orientar a pesquisa.", executed: false }))
    assert.equal(j.state, "not_run")
    assert.equal(source.status, "skipped")
    assert.match(source.message!, /^Pesquisa não realizada/)
    assert.ok(!/nenhuma decisão/i.test(source.message!))
    assert.ok(!("executed" in j), "o controle interno não vai para o relatório")
  })

  it("sem assunto, classe nem tipo: a pesquisa nem é chamada", async () => {
    let called = 0
    const { deps } = counted(sheetWith(0, { subject: undefined, subjects: [], className: undefined }), {
      jurisprudence: async () => {
        called += 1
        return { items: [], total: 0, basis: [] }
      },
    })
    const state = await runWorkflow({ cnj: CNJ, process: office({ type: "" as never, className: undefined, subject: undefined }) }, deps)
    assert.equal(called, 0)
    assert.equal(state.report!.jurisprudence.state, "not_run")
  })

  it("com resultados: metadados e rastreabilidade preservados", async () => {
    const item = { id: "d1", label: "STJ · REsp 0000000", date: "2025-01-01", excerpt: "Ementa fictícia", href: "/jurisprudencia?id=d1", sourceUrl: "https://exemplo.invalid/d1" }
    const { j } = await run(async () => ({ items: [item], total: 7, basis: ["assunto: fictício"] }))
    assert.equal(j.state, "results")
    assert.deepEqual(j.items[0], item)
    assert.equal(j.total, 7)
  })

  it("pesquisa feita sem resultado", async () => {
    const { j, source } = await run(async () => ({ items: [], total: 0, basis: ["assunto: fictício"] }))
    assert.equal(j.state, "no_results")
    assert.match(source.message!, /^Pesquisa feita: nenhuma decisão/)
  })

  it("fonte indisponível, demora (interrompida) e não configurada", async () => {
    const failed = await run(async () => {
      throw new LookupError("UNAVAILABLE", "fictício")
    })
    assert.equal(failed.j.state, "unavailable")
    const slow = await run(() => new Promise(() => {}), office(), { complementary: 20 })
    assert.equal(slow.j.state, "timeout")
    const off = await run(null)
    assert.equal(off.j.state, "not_configured")
  })

  it("cada estado tem a sua mensagem; relatório antigo (sem o campo) é lido pelo estado da fonte", () => {
    const messages = Object.values(JURISPRUDENCE_STATE_MESSAGE)
    assert.equal(new Set(messages).size, messages.length)
    const empty = { items: [], total: 0, basis: [] }
    const cases: [Parameters<typeof jurisprudenceState>[1], JurisprudenceState][] = [
      ["skipped", "not_run"],
      ["not_configured", "not_configured"],
      ["timeout", "timeout"],
      ["unavailable", "unavailable"],
      ["not_found", "no_results"],
    ]
    for (const [status, expected] of cases) assert.equal(jurisprudenceState(empty, status), expected, String(status))
    // Antes do campo, "termos insuficientes" era gravado como não encontrado + o motivo.
    const oldNotRun = { ...empty, message: "O processo não tem assunto nem tipo de ação para orientar a pesquisa." }
    assert.equal(jurisprudenceState(oldNotRun, "not_found"), "not_run")
    assert.match(jurisprudenceMessage(oldNotRun, "not_run")!, /^Pesquisa não realizada: o processo não tem assunto/)
  })
})

describe("dados oficiais × ausentes (nada presumido)", () => {
  it("data de ajuizamento e situação: da fonte quando ela informa; ausentes ficam ausentes", () => {
    const withData = assembleReport({ cnj: CNJ, now: NOW, primary: { sheet: sheetWith(0, { filedAt: "2018-05-02", sourceStatus: "Em tramitação" }), checkedAt: NOW.toISOString() }, primaryStatus: "ok", communicationsStatus: "skipped" })
    const filed = withData.fields.find((f) => f.key === "data_ajuizamento")!
    assert.deepEqual(filed.values.map((v) => [v.value, v.source]), [["02/05/2018", "datajud"]])
    const without = assembleReport({ cnj: CNJ, now: NOW, primary: { sheet: sheetWith(0, { filedAt: undefined, sourceStatus: undefined }), checkedAt: NOW.toISOString() }, primaryStatus: "ok", communicationsStatus: "skipped" })
    for (const key of ["data_ajuizamento", "situacao"] as const) {
      assert.equal(without.fields.find((f) => f.key === key)!.values.length, 0, key)
    }
    assert.ok(without.unavailable.some((u) => u.label === "Data de ajuizamento"))
    assert.ok(without.unavailable.some((u) => u.label === "Situação processual"))
  })
})

describe("prazo e cancelamento: depois do prazo, nenhuma nova tentativa", () => {
  it("o prazo do workflow cancela a consulta (o sinal chega abortado à fonte)", async () => {
    let received: AbortSignal | undefined
    const { deps } = counted(sheetWith(0), {
      communications: (_cnj, options) => {
        received = options.signal
        return new Promise(() => {})
      },
      timeouts: { complementary: 20 },
    })
    const state = await runWorkflow({ cnj: CNJ }, deps)
    assert.equal(state.sources.find((s) => s.id === "djen")!.status, "timeout")
    assert.equal(received?.aborted, true)
  })

  it("withTimeout aborta o controller só quando o prazo estoura", async () => {
    const quick = new AbortController()
    await withTimeout(Promise.resolve(1), 50, quick)
    assert.equal(quick.signal.aborted, false)
    const slow = new AbortController()
    await assert.rejects(withTimeout(new Promise(() => {}), 10, slow), (e: unknown) => e instanceof LookupError && e.code === "TIMEOUT")
    assert.equal(slow.signal.aborted, true)
  })

  it("DJEN: cancelado durante a tentativa → nenhuma nova tentativa nem segunda página", async () => {
    let fetches = 0
    const client = createDjenClient({
      sleep: async () => {},
      fetch: ((_url: string, init: RequestInit) => {
        fetches += 1
        return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("abortado"), { name: "AbortError" }))))
      }) as typeof fetch,
    })
    const controller = new AbortController()
    const pending = client.searchByProcess(CNJ, { signal: controller.signal })
    setTimeout(() => controller.abort(), 5)
    await assert.rejects(pending, (e: unknown) => e instanceof LookupError && e.code === "TIMEOUT")
    assert.equal(fetches, 1)
  })

  it("DJEN: cancelado durante a espera entre tentativas → a próxima não começa", async () => {
    let fetches = 0
    const controller = new AbortController()
    const client = createDjenClient({
      sleep: () => new Promise(() => {}),
      fetch: (async () => {
        fetches += 1
        return new Response("", { status: 503 })
      }) as typeof fetch,
    })
    const pending = client.searchByProcess(CNJ, { signal: controller.signal })
    setTimeout(() => controller.abort(), 5)
    await assert.rejects(pending, (e: unknown) => e instanceof LookupError && e.code === "TIMEOUT")
    assert.equal(fetches, 1)
  })

  it("DataJud: cancelado → falha final, sem nova tentativa (e sem cancelar, as 3 tentativas continuam valendo)", async () => {
    let fetches = 0
    const failing = (async () => {
      fetches += 1
      throw Object.assign(new Error("conexão"), { name: "TypeError" })
    }) as typeof fetch
    const controller = new AbortController()
    controller.abort()
    const cancelled = createDataJudClient({ apiKey: "chave-de-teste", fetch: failing, sleep: async () => {}, random: () => 0 })
    await assert.rejects(cancelled.searchByNumber(CNJ, "api_publica_trf1", { signal: controller.signal }), (e: unknown) => e instanceof LookupError && e.code === "TIMEOUT")
    assert.equal(fetches, 0, "já cancelado: nenhuma tentativa")

    fetches = 0
    let clock = 0
    const normal = createDataJudClient({ apiKey: "chave-de-teste", fetch: failing, now: () => clock, sleep: async (ms) => void (clock += ms), random: () => 0 })
    await assert.rejects(normal.searchByNumber(CNJ, "api_publica_trf1"))
    assert.equal(fetches, 3, "limite de tentativas preservado")
  })
})
