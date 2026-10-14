/**
 * Gemini FALSO para testes de ponta a ponta da Íntegra IA — nunca em produção.
 *
 * Carregue SÓ no servidor de teste:
 *   NODE_OPTIONS="--import ./tests/integration/fake-gemini.mjs" npx next start
 *
 * Troca as chamadas a generativelanguage.googleapis.com por respostas fixas que imitam o
 * vazamento visto nas telas (nomes internos dos dados entre colchetes, nome antigo) ao
 * lado de conteúdo jurídico legítimo. `FAKE_GEMINI_FAIL_MODEL` responde 429 (sem cota),
 * para exercitar o modelo reserva. Qualquer outro endereço segue para a rede normal.
 */

const LEAKY = [
  "Não encontrei dados específicos desse cliente [clientes_com_valores_em_atraso].",
  "O escritório tem processos ativos [metricas_calculadas_pelo_lexa] [métricas_calculadas_pelo_lexa], segundo as métricas calculadas pelo LEXA.",
  "- Valores em atraso: ver [clientes_com_valores_em_atraso].",
  "- [pesquisa_de_jurisprudencia]",
  "Segundo a pesquisa_de_jurisprudencia, o processo 0000832-35.2018.4.01.3202 (TRF1), julgado em 05/02/2018, aplicou o art. 186 do Código Civil e a Súmula 385/STJ; na ementa, \"o devedor [sic] foi notificado\".",
].join("\n")

const realFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init)
  const model = /models\/([^:/?]+)/.exec(url)?.[1] ?? ""
  if (process.env.FAKE_GEMINI_FAIL_MODEL && model === process.env.FAKE_GEMINI_FAIL_MODEL) {
    return new Response(JSON.stringify({ error: { code: 429, message: "quota (teste)", status: "RESOURCE_EXHAUSTED" } }), { status: 429, headers: { "content-type": "application/json" } })
  }
  const body = {
    candidates: [{ content: { role: "model", parts: [{ text: LEAKY }] }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    modelVersion: model,
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}
