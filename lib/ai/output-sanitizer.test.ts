import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { AISources } from "./types"
import { contextKeys, createStreamSanitizer, sanitizeAIOutput, sanitizeAIText } from "./output-sanitizer"

/* Textos de resposta FICTÍCIOS, no formato do que o modelo devolveu nas telas. */

const keys = contextKeys({
  metricas_calculadas: { processes: { active: 29 } },
  clientes_com_valores_em_atraso: [{ cliente: "Cliente sem acesso", valor_em_atraso: "R$ 10.000,00" }],
  pesquisa_de_jurisprudencia: { decisoes: [{ ref: "J1" }] },
  decisao: { assunto: "x" },
})
const sources: AISources = { J1: { kind: "jurisprudence", label: "STJ · REsp 1234567", href: "/jurisprudencia?id=x" } as never }

describe("IA — limpeza final da resposta: marcadores internos", () => {
  it("1. resposta financeira sem [clientes_com_valores_em_atraso]", () => {
    const out = sanitizeAIText("Existe uma fatura vencida de R$ 10.000,00, vinculada a um cliente sem acesso [clientes_com_valores_em_atraso].", { contextKeys: keys })
    assert.equal(out, "Existe uma fatura vencida de R$ 10.000,00, vinculada a um cliente sem acesso.")
  })

  it("2. resposta sobre processos sem [métricas_calculadas_pelo_lexa] (com acento e nome antigo)", () => {
    const out = sanitizeAIText("O escritório possui 29 processos ativos [métricas_calculadas_pelo_lexa], e 17 estão sem movimentação há mais de 60 dias.")
    assert.equal(out, "O escritório possui 29 processos ativos, e 17 estão sem movimentação há mais de 60 dias.")
  })

  it("3. resposta jurídica sem [pesquisa_de_jurisprudencia], com a referência real preservada", () => {
    const out = sanitizeAIText("Encontrei uma decisão do STJ [pesquisa_de_jurisprudencia]: REsp 1234567, julgado em 10/03/2025 [J1].", { contextKeys: keys, sources, linkBareRefs: true })
    assert.equal(out, "Encontrei uma decisão do STJ: REsp 1234567, julgado em 10/03/2025 [J1].")
  })

  it("4. vários marcadores na mesma resposta, no meio e no fim de frases e em listas", () => {
    const text = [
      "### Resumo [metricas_calculadas]",
      "- 3 tarefas atrasadas [tarefas_atrasadas].",
      "- Valores em atraso: R$ 2.500,00 ([clientes_com_valores_em_atraso]).",
      "Segundo a pesquisa_de_jurisprudencia, não há decisões pertinentes [ pesquisa_de_jurisprudencia ].",
      "Dados de \"clientes_com_valores_em_atraso\" e [clientes com valores em atraso] conferidos.",
    ].join("\n")
    const out = sanitizeAIText(text, { contextKeys: keys })
    assert.equal(
      out,
      [
        "### Resumo",
        "- 3 tarefas atrasadas.",
        "- Valores em atraso: R$ 2.500,00.",
        "Segundo a pesquisa de jurisprudência, não há decisões pertinentes.",
        "Dados de clientes com valores em atraso e conferidos.",
      ].join("\n"),
    )
    assert.ok(!/[a-z]_[a-z]/.test(out), out)
  })

  it("5. CNJ, tribunais, datas, artigos de lei, valores e referências legítimas ficam intactos", () => {
    const text =
      "Processo 0000832-35.2018.4.01.3202 (TRF1), distribuído em 05/02/2018. O TJSP e o STJ [J1] aplicaram o art. 186 do Código Civil e a Súmula 385/STJ; valor de R$ 1.234,56. Ver https://www.stj.jus.br/processo?tipo_pesquisa=numero e contrato_social.pdf (enviado por joao_silva@exemplo.com.br)."
    assert.equal(sanitizeAIText(text, { contextKeys: keys, sources, linkBareRefs: true }), text)
  })

  it("6. texto jurídico legítimo entre colchetes não é removido", () => {
    const text =
      "Na ementa: \"o consumidor [sic] tem direito […] à reparação [grifo nosso]\"; ver [art. 5º, X, da CF] e [decisão] citada; nota [1]. A [J9] inexistente fica para a outra etapa."
    assert.equal(sanitizeAIText(text, { contextKeys: keys }), text)
  })

  it("marcador no fim da oração leva junto a palavra que só apontava para ele (sem fragmento órfão)", () => {
    assert.equal(sanitizeAIText("- Valores em atraso: ver [clientes_com_valores_em_atraso]."), "- Valores em atraso.")
    assert.equal(sanitizeAIText("Números conforme [metricas_calculadas_pelo_lexa], sem mudança."), "Números, sem mudança.")
    // No meio da frase, a palavra continua (ela não apontava só para o marcador).
    assert.equal(sanitizeAIText("Veja em [pesquisa_de_jurisprudencia] a decisão do STJ."), "Veja em a decisão do STJ.")
  })

  it("nome antigo do produto vira Íntegra (com artigo correto)", () => {
    assert.equal(sanitizeAIText("Números calculados pelo LEXA e mostrados na LEXA IA."), "Números calculados pela Íntegra e mostrados na Íntegra IA.")
    assert.equal(sanitizeAIText("Alexandre e Lexandro continuam iguais."), "Alexandre e Lexandro continuam iguais.")
  })

  it("referência solta vira link só quando existe", () => {
    assert.equal(sanitizeAIText("A decisão J1 (ver também J9).", { sources, linkBareRefs: true }), "A decisão [J1] (ver também J9).")
  })

  it("9. erros e respostas sem dados não ganham afirmação nova (a limpeza só tira, nunca acrescenta)", () => {
    const cases = [
      "Não há faturas vencidas registradas [clientes_com_valores_em_atraso].",
      "A pesquisa de jurisprudência não respondeu agora [pesquisa_de_jurisprudencia]. Tente de novo em instantes.",
      "Não tenho acesso aos dados financeiros nesta conversa.",
    ]
    const out = cases.map((t) => sanitizeAIText(t, { contextKeys: keys }))
    assert.deepEqual(out, [
      "Não há faturas vencidas registradas.",
      "A pesquisa de jurisprudência não respondeu agora. Tente de novo em instantes.",
      "Não tenho acesso aos dados financeiros nesta conversa.",
    ])
    for (const [i, text] of out.entries()) assert.ok(text.length <= cases[i].length)
  })

  it("resposta estruturada: limpa todos os textos sem mexer em chaves, números nem refs", () => {
    const data = { resumo: "Há 2 faturas vencidas [clientes_com_valores_em_atraso].", pontos: [{ texto: "Ver metricas_calculadas.", refs: ["M1"] }], total: 2, ref: "M1" }
    const out = sanitizeAIOutput(data, { contextKeys: keys })
    assert.deepEqual(out, { resumo: "Há 2 faturas vencidas.", pontos: [{ texto: "Ver métricas do escritório.", refs: ["M1"] }], total: 2, ref: "M1" })
    assert.equal(data.resumo, "Há 2 faturas vencidas [clientes_com_valores_em_atraso].", "o original não é alterado")
  })
})

describe("IA — limpeza com resposta em partes (streaming)", () => {
  /** Tudo o que a tela mostraria, parte a parte. */
  function play(chunks: string[]) {
    const stream = createStreamSanitizer({ contextKeys: keys })
    const shown = chunks.map((chunk) => stream.push(chunk))
    return { shown, final: stream.finish() }
  }

  it("7. marcador dividido entre partes nunca aparece, nem pela metade", () => {
    const { shown, final } = play(["Existe uma fatura vencida de R$ 10.000,00 [clientes_", "com_valores_", "em_atraso] de um cliente", " sem acesso", "."])
    for (const text of [...shown, final]) {
      assert.ok(!text.includes("["), `parcial visível: ${text}`)
      assert.ok(!text.includes("_"), `parcial visível: ${text}`)
    }
    assert.equal(final, "Existe uma fatura vencida de R$ 10.000,00 de um cliente sem acesso.")
  })

  it("o texto mostrado só cresce e termina igual à limpeza do texto inteiro", () => {
    const text = "O escritório possui 29 processos ativos [métricas_calculadas_pelo_lexa], e 17 estão parados (ver [J1])."
    const chunks = text.match(/[\s\S]{1,7}/g)!
    const { shown, final } = play(chunks)
    for (let i = 1; i < shown.length; i += 1) assert.ok(shown[i].startsWith(shown[i - 1]), `${shown[i - 1]} → ${shown[i]}`)
    assert.equal(final, sanitizeAIText(text, { contextKeys: keys }))
    assert.ok(!shown.some((s) => s.includes("métricas_")))
  })

  it("identificador solto dividido entre partes não aparece cru", () => {
    const { shown, final } = play(["Segundo a pesquisa_", "de_jurisprudencia, nada", " foi encontrado."])
    assert.ok(!shown.some((s) => s.includes("pesquisa_")))
    assert.equal(final, "Segundo a pesquisa de jurisprudência, nada foi encontrado.")
  })
})
