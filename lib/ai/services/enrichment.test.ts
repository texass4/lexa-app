import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { trf1Response } from "@/lib/integrations/legal/datajud/__fixtures__/responses"
import type { ExternalProcess } from "@/lib/integrations/legal/types"
import { buildProcessSheet } from "@/lib/services/processos/sheet"
import { runWorkflow } from "@/lib/services/consulta/workflow"
import type { EnrichmentRun } from "@/lib/services/consulta/types"
import { makeDeps, promptText } from "../__fixtures__/data"
import { summarizeEnrichment } from "./enrichment"

const CNJ = "00008323520184013202"
const sheet = buildProcessSheet(mapSearchResponse(trf1Response, CNJ) as ExternalProcess)

async function completedRun(): Promise<EnrichmentRun> {
  const state = await runWorkflow(
    { cnj: CNJ },
    {
      now: () => new Date("2026-10-09T15:00:00Z"),
      primary: async () => ({ sheet, checkedAt: "2026-10-09T15:00:00.000Z", cached: false }),
      communications: null,
      jurisprudence: null,
      progress: async () => {},
    },
  )
  return { id: "11111111-1111-4111-8111-111111111111", cnj: CNJ, status: state.status, forced: false, startedAt: "2026-10-09T15:00:00.000Z", steps: state.steps, sources: state.sources, report: state.report, foundFields: state.foundFields, missingFields: state.missingFields }
}

describe("Resumir com a Íntegra (consulta processual)", () => {
  it("usa só o relatório; fato sem fonte sai; ausentes vêm do relatório, não do modelo", async () => {
    const run = await completedRun()
    const { deps, calls } = makeDeps(() => ({
      resumo: "Processo do TRF1 com 3 movimentações [Q1].",
      fatos_confirmados: [
        { texto: "Classe: Procedimento do Juizado Especial Cível.", refs: ["Q1"] },
        { texto: "O juiz responsável é Fulano.", refs: ["Q9"] },
      ],
      inferencias: [{ texto: "A última movimentação pode indicar andamento recente.", refs: ["Q1", "X1"] }],
      ausentes: ["(o modelo não decide isto)"],
      cuidados: ["A consulta pública não traz os autos."],
    }))
    const result = await summarizeEnrichment(deps, run)
    assert.equal(result.data.fatos_confirmados.length, 1)
    assert.deepEqual(result.data.inferencias[0].refs, ["Q1"])
    assert.ok(result.data.ausentes.some((a) => a.startsWith("Magistrado")))
    assert.ok(!result.data.ausentes.includes("(o modelo não decide isto)"))
    assert.equal(result.sources.Q1.label, "DataJud (CNJ)")
    // O que o modelo recebeu: os dados da consulta e as ausências explícitas.
    const prompt = promptText(calls[0])
    assert.match(prompt, /Procedimento do Juizado Especial Cível/)
    assert.match(prompt, /informacoes_indisponiveis/)
    assert.match(prompt, /Nunca diga que alguém é o juiz responsável atual/)
  })

  it("sem relatório (ainda rodando) ou sem acesso: recusa sem chamar o modelo", async () => {
    const run = await completedRun()
    const { deps, calls } = makeDeps(() => ({}))
    await assert.rejects(summarizeEnrichment(deps, { ...run, status: "running", report: undefined }), (e: { code?: string }) => e.code === "INSUFFICIENT_DATA")
    await assert.rejects(summarizeEnrichment(deps, null), (e: { code?: string }) => e.code === "NOT_FOUND")
    const noView = makeDeps(() => ({}), { permissions: ["clients.view"] })
    await assert.rejects(summarizeEnrichment(noView.deps, run), (e: { code?: string }) => e.code === "FORBIDDEN")
    assert.equal(calls.length, 0)
  })
})
