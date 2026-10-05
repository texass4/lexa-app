import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { fallbackForStatus, isTechnicalMessage, publicMessage, SERVICE_ERROR, UNEXPECTED_ERROR } from "./public-error"
import { HttpError, toPublicError } from "@/lib/auth/http-error"
import { AIError } from "@/lib/ai/errors"
import { publicLookupError, LookupError } from "@/lib/integrations/legal/errors"

const LEAKS = [
  "GEMINI_API_KEY não configurada",
  "A Íntegra IA não está configurada no servidor (ANTHROPIC_API_KEY).",
  "Defina ZAPI_WEBHOOK_SECRET no servidor.",
  "DataJud API 429",
  "HTTP 503",
  "status 500",
  "A Z-API recusou as credenciais.",
  "new row violates row-level security policy for table \"clients\"",
  "relation \"public.whatsapp_messages\" does not exist",
  "duplicate key value violates unique constraint \"profiles_pkey\"",
  "JWT expired",
  "Invalid API key",
  "TypeError: Cannot read properties of undefined (reading 'id')",
  "Error: connect ECONNREFUSED 127.0.0.1:5432",
  "    at handler (/var/task/.next/server/app/api/route.js:1:234)",
  "Failed to fetch",
  "fetch failed",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
  "Request failed with status code 500",
  "Unexpected token < in JSON at position 0",
  "https://xyz.supabase.co/rest/v1/clients",
  "Rode supabase/migrations/0002_whatsapp.sql no SQL Editor",
  "Falha em lib/services/whatsapp/outbound.ts",
  "{\"code\":\"PGRST205\"}",
  "service_role key missing",
  "Bearer eyJhbGciOiJIUzI1NiIs",
  "[object Object]",
  "null",
  "undefined",
]

const CLEAR = [
  "E-mail ou senha incorretos.",
  "Você não tem permissão para esta ação.",
  "Cliente não encontrado.",
  "O arquivo passa de 64 MB.",
  "A mensagem passa de 4096 caracteres.",
  "Informe um telefone válido, com DDD.",
  "O plano Profissional permite até 5 usuário(s). Fale com a equipe da Íntegra para ampliar.",
  "Este e-mail já tem conta na Íntegra. Cada pessoa pertence a um escritório.",
  "O WhatsApp do escritório ainda não foi ativado. Fale com o suporte da Íntegra.",
  "Não foi possível concluir a análise. Tente novamente em instantes.",
  "A atualização está temporariamente indisponível. Tente novamente mais tarde.",
  "O servidor de e-mail está indisponível no momento. Tente de novo em instantes.",
  "Cadastre ao menos uma inscrição na OAB antes de definir o papel Advogado.",
  UNEXPECTED_ERROR,
  SERVICE_ERROR,
]

describe("mensagens de erro para a tela", () => {
  it("reconhece detalhe técnico: variável, serviço, HTTP, SQL, stack, rede, endereço, caminho", () => {
    for (const text of LEAKS) assert.equal(isTechnicalMessage(text), true, text)
  })

  it("deixa passar as mensagens claras da Íntegra", () => {
    for (const text of CLEAR) {
      assert.equal(isTechnicalMessage(text), false, text)
      assert.equal(publicMessage(text), text)
    }
  })

  it("troca qualquer detalhe técnico pela mensagem orientada à ação", () => {
    for (const text of LEAKS) assert.equal(publicMessage(text, "Não foi possível enviar."), "Não foi possível enviar.")
    assert.equal(publicMessage(new TypeError("Failed to fetch")), UNEXPECTED_ERROR)
    assert.equal(publicMessage({ message: "permission denied for table clients", code: "42501" }), UNEXPECTED_ERROR)
  })

  it("sem texto utilizável (vazio, não string, longo demais) também vira a genérica", () => {
    assert.equal(publicMessage(undefined), UNEXPECTED_ERROR)
    assert.equal(publicMessage(""), UNEXPECTED_ERROR)
    assert.equal(publicMessage("   "), UNEXPECTED_ERROR)
    assert.equal(publicMessage(42), UNEXPECTED_ERROR)
    assert.equal(publicMessage({ message: 42 }), UNEXPECTED_ERROR)
    assert.equal(publicMessage("Não foi possível salvar. ".repeat(20)), UNEXPECTED_ERROR)
    assert.equal(publicMessage(null, ""), "")
  })

  it("mensagem padrão por status, sem número nem jargão", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504]) {
      const text = fallbackForStatus(status)
      assert.equal(isTechnicalMessage(text), false, `${status}: ${text}`)
      assert.ok(!/\d{3}/.test(text), `${status}: ${text}`)
    }
    assert.equal(fallbackForStatus(503), SERVICE_ERROR)
    assert.equal(fallbackForStatus(500), UNEXPECTED_ERROR)
  })
})

describe("resposta de erro das rotas (`route`)", () => {
  it("HttpError com mensagem clara: status e mensagem como estão, sem log", () => {
    assert.deepEqual(toPublicError(new HttpError(404, "Conversa não encontrada.")), { status: 404, message: "Conversa não encontrada.", logged: false })
  })

  it("HttpError com detalhe técnico: mantém o status, troca a mensagem e manda para o log", () => {
    const result = toPublicError(new HttpError(503, "Defina ZAPI_WEBHOOK_SECRET no servidor."))
    assert.deepEqual(result, { status: 503, message: SERVICE_ERROR, logged: true })
    assert.equal(toPublicError(new HttpError(409, "relation \"x\" does not exist")).message, fallbackForStatus(409))
  })

  it("qualquer outra exceção vira 500 genérico (nada de stack, SQL ou caminho)", () => {
    const error = new Error("insert into organizations violates check constraint at /app/lib/x.ts:10:2")
    assert.deepEqual(toPublicError(error), { status: 500, message: UNEXPECTED_ERROR, logged: true })
    assert.deepEqual(toPublicError("boom"), { status: 500, message: UNEXPECTED_ERROR, logged: true })
  })
})

describe("catálogos de erro já saem limpos na origem", () => {
  it("Íntegra IA: nenhum código expõe chave, variável ou provedor", () => {
    const codes = [
      "DISABLED", "NOT_CONFIGURED", "INVALID_API_KEY", "MODEL_UNAVAILABLE", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST",
      "INSUFFICIENT_DATA", "RATE_LIMITED", "PLAN_LIMIT", "PROVIDER_RATE_LIMITED", "TIMEOUT", "CANCELLED", "EMPTY_RESPONSE",
      "INVALID_RESPONSE", "BLOCKED", "UNAVAILABLE", "UNEXPECTED",
    ] as const
    for (const code of codes) {
      const message = new AIError(code).userMessage
      assert.equal(isTechnicalMessage(message), false, `${code}: ${message}`)
    }
    assert.equal(new AIError("NOT_CONFIGURED").userMessage, "Não foi possível concluir a análise. Tente novamente em instantes.")
    // Mensagem interna (para o log) não chega à interface: a tela usa sempre o catálogo.
    assert.equal(new AIError("BLOCKED", { message: "Pedido bloqueado: SAFETY" }).userMessage.includes("SAFETY"), false)
  })

  it("consulta processual: falha da fonte (429, 503, chave) não aparece na tela", () => {
    for (const error of [
      new LookupError("RATE_LIMIT", "HTTP 429", { status: 429 }),
      new LookupError("UNAVAILABLE", "HTTP 503", { status: 503 }),
      new LookupError("NOT_CONFIGURED", "DATAJUD_API_KEY não configurada"),
      new Error("socket hang up"),
    ]) {
      const { message } = publicLookupError(error)
      assert.equal(isTechnicalMessage(message), false, message)
    }
  })
})
