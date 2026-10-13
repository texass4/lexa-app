import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { insideServiceWindow, metaSendRefusal, SERVICE_WINDOW_MS } from "./config"

const NOW = Date.parse("2026-10-13T15:00:00Z")
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

describe("WhatsApp oficial — regras de envio (antes de gravar)", () => {
  it("janela de atendimento: 24 h desde a última mensagem do cliente", () => {
    assert.equal(insideServiceWindow(hoursAgo(1), NOW), true)
    assert.equal(insideServiceWindow(new Date(NOW - SERVICE_WINDOW_MS + 60_000).toISOString(), NOW), true)
    assert.equal(insideServiceWindow(new Date(NOW - SERVICE_WINDOW_MS).toISOString(), NOW), false)
    assert.equal(insideServiceWindow(null, NOW), false)
    assert.equal(insideServiceWindow("data-ruim", NOW), false)
  })

  it("texto dentro da janela: liberado", () => {
    assert.equal(metaSendRefusal("meta", hoursAgo(2), "text", NOW), null)
  })

  it("texto fora da janela (ou cliente que nunca escreveu): recusado com a regra do WhatsApp", () => {
    for (const last of [hoursAgo(30), null]) {
      assert.match(metaSendRefusal("meta", last, "text", NOW) ?? "", /modelo de mensagem aprovado/)
    }
  })

  it("anexos no número oficial: recusados nesta etapa", () => {
    for (const type of ["image", "document", "audio"] as const) assert.match(metaSendRefusal("meta", hoursAgo(1), type, NOW) ?? "", /só mensagens de texto/)
  })

  it("nota interna nunca vai ao WhatsApp: liberada sempre; outro provedor não passa por estas regras", () => {
    assert.equal(metaSendRefusal("meta", null, "note", NOW), null)
    assert.equal(metaSendRefusal("zapi", null, "image", NOW), null)
  })
})
