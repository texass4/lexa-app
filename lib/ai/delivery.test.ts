import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { makeDeps } from "./__fixtures__/data"
import { aiApi } from "./client"
import { GeminiProvider, type GeminiClientLike } from "./gemini"
import { chatBlocks, type Block } from "./markdown"
import { chat } from "./services/chat"
import type { AISources } from "./types"

/*
 * O texto que CHEGA À TELA, em cada caminho de resposta da IA — não só a função de
 * limpeza isolada: a rota da conversa (servidor, inclusive pelo modelo reserva), o
 * cliente do navegador (`aiApi`) e os blocos que o `AIMarkdown` desenha (resposta nova,
 * do histórico ou ainda em geração). Respostas do "modelo" são FICTÍCIAS.
 */

const MARKERS = ["[clientes_com_valores_em_atraso]", "[metricas_calculadas_pelo_lexa]", "[métricas_calculadas_pelo_lexa]", "[pesquisa_de_jurisprudencia]"]

/** Nenhum marcador interno, nenhum pedaço dele, nenhum nome antigo. */
function assertClean(text: string, where: string) {
  assert.ok(!/\[[\p{Ll}\d]*_/u.test(text), `${where}: colchete com identificador → ${text}`)
  assert.ok(!/\p{Ll}_\p{Ll}/u.test(text), `${where}: identificador com sublinhado → ${text}`)
  assert.ok(!/lexa/i.test(text), `${where}: nome antigo → ${text}`)
}

/** Todo o texto que a tela desenharia a partir dos blocos. */
const shown = (blocks: Block[]) => blocks.map((b) => ("items" in b ? b.items.join("\n") : b.text)).join("\n")

const LEGIT =
  "O processo 0000832-35.2018.4.01.3202 (TRF1), julgado pelo STJ em 05/02/2018 [J1], aplicou o art. 186 do Código Civil e a Súmula 385/STJ; na ementa, \"o devedor [sic] foi notificado\"."
const sources: AISources = { J1: { kind: "jurisprudence", label: "STJ · REsp 1234567", href: "/jurisprudencia?id=x" } as never }

/** Provedor Gemini de verdade, com o cliente do SDK trocado: cada modelo responde o que for pedido. */
function gemini(replies: Record<string, string | number>) {
  const calls: string[] = []
  const client: GeminiClientLike = {
    models: {
      async generateContent(params: { model: string }) {
        calls.push(params.model)
        const reply = replies[params.model]
        if (typeof reply === "number") throw Object.assign(new Error(`HTTP ${reply}`), { status: reply })
        return { text: reply, candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }
      },
    },
  } as unknown as GeminiClientLike
  const provider = new GeminiProvider({ apiKey: "chave-de-teste", model: "gemini-principal-teste", lightModel: "gemini-reserva-teste", timeoutMs: 10_000, client, retryDelayMs: 0 })
  return { provider, calls }
}

describe("IA — o que chega à tela não tem marcador interno", () => {
  it("1. resposta final da rota da conversa com cada um dos marcadores", async () => {
    for (const marker of MARKERS) {
      const { deps } = makeDeps(() => `Não encontrei dados específicos desse cliente ${marker}. O escritório tem 1 processo ativo ${marker}.`)
      const result = await chat(deps, { type: "office" }, [{ role: "user", content: "Como está o cliente Maria?" }])
      assertClean(result.data.text, marker)
      assert.equal(result.data.text, "Não encontrei dados específicos desse cliente. O escritório tem 1 processo ativo.")
    }
  })

  it("2. marcador dividido em vários eventos de streaming: nenhum pedaço aparece em nenhum momento", () => {
    const events = ["Não encontrei dados [clien", "tes_com_valo", "res_em_atraso] desse clie", "nte. O escritório [métricas_calc", "uladas_pelo_le", "xa] tem 29 processos ativos."]
    let raw = ""
    for (const event of events) {
      raw += event
      assertClean(shown(chatBlocks(raw, { sources, streaming: true })), `durante "${raw}"`)
    }
    assert.equal(shown(chatBlocks(raw, { sources })), "Não encontrei dados desse cliente. O escritório tem 29 processos ativos.")
  })

  it("3. marcador que não existe no contexto montado (acrescentado depois) também some", async () => {
    const { deps, calls } = makeDeps(() => "Há 1 tarefa atrasada [tarefas_atrasadas_do_cliente] e nada em [secao_nova_qualquer].")
    const result = await chat(deps, { type: "office" }, [{ role: "user", content: "E as tarefas?" }])
    assert.equal(calls[0].system.includes("tarefas_atrasadas_do_cliente"), false, "o marcador não veio do contexto")
    assert.equal(result.data.text, "Há 1 tarefa atrasada e nada.")
    assertClean(result.data.text, "marcador novo")
  })

  it("4. resposta do modelo reserva (o principal sem cota) passa pela mesma limpeza", async () => {
    const { deps } = makeDeps(() => "não usado")
    const fake = gemini({ "gemini-principal-teste": 429, "gemini-reserva-teste": "Existe uma fatura vencida de R$ 10.000,00 [clientes_com_valores_em_atraso], vinculada a um cliente sem acesso." })
    deps.provider = fake.provider
    const result = await chat(deps, { type: "office" }, [{ role: "user", content: "Há valores em atraso?" }])
    assert.deepEqual(fake.calls, ["gemini-principal-teste", "gemini-reserva-teste"])
    assert.equal(result.data.text, "Existe uma fatura vencida de R$ 10.000,00, vinculada a um cliente sem acesso.")
  })

  it("5. mensagem antiga do histórico (gravada antes da limpeza) aparece limpa — e o registro não muda", async () => {
    const old = "### Resumo [metricas_calculadas_pelo_lexa]\n- R$ 3.000 em atraso [clientes_com_valores_em_atraso].\n- [pesquisa_de_jurisprudencia]\n\nSegundo a pesquisa_de_jurisprudencia, veja J1."
    const stored = { role: "assistant" as const, content: old }
    const blocks = chatBlocks(stored.content, { sources })
    assert.deepEqual(blocks, [
      { type: "h", text: "Resumo" },
      { type: "ul", items: ["R$ 3.000 em atraso."] },
      { type: "p", text: "Segundo a pesquisa de jurisprudência, veja [J1]." },
    ])
    assert.equal(stored.content, old, "o registro original não é alterado")
    // A conversa continua: o histórico antigo vai ao modelo e a nova resposta sai limpa.
    const { deps, calls } = makeDeps(() => "Continua igual [clientes_com_valores_em_atraso].")
    const result = await chat(deps, { type: "office" }, [{ role: "user", content: "Resumo?" }, stored, { role: "user", content: "E agora?" }])
    assert.equal(calls[0].messages.length, 3)
    assert.equal(result.data.text, "Continua igual.")
  })

  it("6. CNJ, data, tribunal e referência jurídica legítima são preservados em todos os caminhos", async () => {
    const { deps } = makeDeps(() => `${LEGIT} [pesquisa_de_jurisprudencia]`)
    const result = await chat(deps, { type: "office" }, [{ role: "user", content: "Há jurisprudência?" }])
    assert.equal(result.data.text, LEGIT.replace(" [J1]", ""), "na conversa do escritório J1 não existe: só a referência inexistente sai")
    assert.equal(shown(chatBlocks(LEGIT, { sources })), LEGIT)
    assert.equal(shown(chatBlocks(LEGIT, { sources, streaming: true })), LEGIT.slice(0, LEGIT.lastIndexOf(" ")))
  })

  it("7. mensagem comum, sem marcador, chega exatamente como foi escrita", async () => {
    const plain = "O escritório possui 29 processos ativos, e 17 estão sem movimentação há mais de 60 dias."
    const { deps } = makeDeps(() => plain)
    const result = await chat(deps, { type: "office" }, [{ role: "user", content: "Como está o escritório?" }])
    assert.equal(result.data.text, plain)
    assert.equal(shown(chatBlocks(plain, { sources })), plain)
  })
})

describe("IA — cliente do navegador (segunda trava): resposta de servidor antigo ou guardada", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const serve = (status: number, body: unknown) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch
  }

  it("conversa e análise estruturada com marcadores chegam limpas aos componentes", async () => {
    serve(200, { data: { text: `Sem dados do cliente [clientes_com_valores_em_atraso]. Números do LEXA [metricas_calculadas_pelo_lexa]. ${LEGIT}` }, sources, warnings: [] })
    const reply = await aiApi.chat({ type: "office" }, [{ role: "user", content: "x" }])
    assert.equal(reply.data.text, `Sem dados do cliente. Números da Íntegra. ${LEGIT}`)

    serve(200, { data: { leitura: "R$ 10.000,00 vencidos [clientes_com_valores_em_atraso].", pontos_atencao: [{ texto: "Ver metricas_calculadas_pelo_lexa.", refs: ["C1"] }] }, sources: {}, metrics: { overdueAmount: 10000 } })
    const finance = await aiApi.financeAnalysis()
    assert.equal(finance.data.leitura, "R$ 10.000,00 vencidos.")
    assert.equal(finance.data.pontos_atencao[0].texto, "Ver métricas do escritório.")
    assert.deepEqual(finance.data.pontos_atencao[0].refs, ["C1"])
    assert.equal((finance as unknown as { metrics: { overdueAmount: number } }).metrics.overdueAmount, 10000)
  })

  it("erro continua erro (mensagem e código intactos), sem virar afirmação", async () => {
    serve(503, { error: { code: "UNAVAILABLE", message: "A Íntegra IA está indisponível no momento. Tente novamente em alguns minutos." } })
    await assert.rejects(aiApi.chat({ type: "office" }, [{ role: "user", content: "x" }]), (error: unknown) => {
      const e = error as { code: string; message: string }
      return e.code === "UNAVAILABLE" && /indisponível/.test(e.message)
    })
  })
})
