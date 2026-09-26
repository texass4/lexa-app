import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { momentToISO, parseZapiWebhook } from "./webhook"
import { createZapiClient, ZapiError } from "./client"

const NOW = new Date("2026-09-25T12:00:00.000Z")

const received = (extra: Record<string, unknown>) => ({
  isStatusReply: false,
  isGroup: false,
  isNewsletter: false,
  instanceId: "INST1",
  messageId: "3EB0ABC",
  phone: "5511999998888",
  fromMe: false,
  momment: 1777494009341,
  status: "RECEIVED",
  chatName: "Maria Souza",
  senderName: "Maria",
  senderPhoto: "https://pps.whatsapp.net/maria.jpg",
  photo: "https://pps.whatsapp.net/maria.jpg",
  broadcast: false,
  type: "ReceivedCallback",
  ...extra,
})

describe("webhooks da Z-API", () => {
  it("texto recebido", () => {
    const event = parseZapiWebhook(received({ text: { message: "Bom dia, doutor" } }), NOW)
    assert.equal(event.kind, "message")
    if (event.kind !== "message") return
    assert.equal(event.type, "text")
    assert.equal(event.body, "Bom dia, doutor")
    assert.equal(event.phone, "5511999998888")
    assert.equal(event.fromMe, false)
    assert.equal(event.contactName, "Maria")
    assert.equal(event.at, new Date(1777494009341).toISOString())
  })

  it("resposta citando outra mensagem", () => {
    const event = parseZapiWebhook(received({ text: { message: "sim" }, referenceMessageId: "3EB0OLD" }), NOW)
    assert.equal(event.kind === "message" && event.replyToProviderId, "3EB0OLD")
  })

  it("imagem, documento e áudio trazem a mídia", () => {
    const image = parseZapiWebhook(received({ image: { imageUrl: "https://z/i.jpg", mimeType: "image/jpeg", caption: "RG", width: 800 } }), NOW)
    assert.ok(image.kind === "message" && image.media)
    assert.deepEqual([image.type, image.body, image.media.kind, image.media.url, image.media.width], ["image", "RG", "image", "https://z/i.jpg", 800])

    const doc = parseZapiWebhook(
      received({ document: { documentUrl: "https://z/c.pdf", mimeType: "application/pdf", fileName: "contrato.pdf", pageCount: 3 } }),
      NOW,
    )
    assert.ok(doc.kind === "message" && doc.media)
    assert.deepEqual([doc.type, doc.media.fileName, doc.media.pageCount], ["document", "contrato.pdf", 3])

    const audio = parseZapiWebhook(received({ audio: { audioUrl: "https://z/a.ogg", ptt: true, seconds: 12, mimeType: "audio/ogg; codecs=opus" } }), NOW)
    assert.ok(audio.kind === "message" && audio.media)
    assert.deepEqual([audio.type, audio.media.voiceNote, audio.media.durationSeconds], ["audio", true, 12])
  })

  it("mensagem enviada pelo celular usa o nome da conversa, não o do escritório", () => {
    const event = parseZapiWebhook(received({ fromMe: true, senderName: "Escritório", text: { message: "Olá" } }), NOW)
    assert.ok(event.kind === "message")
    assert.equal(event.fromMe, true)
    assert.equal(event.contactName, "Maria Souza")
  })

  it("ignora grupos, canais, reações e status", () => {
    assert.equal(parseZapiWebhook(received({ isGroup: true, text: { message: "x" } }), NOW).kind, "ignored")
    assert.equal(parseZapiWebhook(received({ isNewsletter: true }), NOW).kind, "ignored")
    assert.equal(parseZapiWebhook(received({ reaction: { value: "👍" } }), NOW).kind, "ignored")
    assert.equal(parseZapiWebhook(received({ phone: "120363019502650977-group" }), NOW).kind, "ignored")
    assert.equal(parseZapiWebhook({ type: "ReceivedCallback" }, NOW).kind, "ignored")
  })

  it("status de entrega e leitura", () => {
    const base = { instanceId: "INST1", ids: ["A1", "A2"], momment: 1632234645000, phone: "5544999999999", type: "MessageStatusCallback", isGroup: false }
    const read = parseZapiWebhook({ ...base, status: "READ" }, NOW)
    assert.deepEqual(read, { kind: "status", instanceExternalId: "INST1", ids: ["A1", "A2"], status: "read", at: new Date(1632234645000).toISOString() })
    const delivered = parseZapiWebhook({ ...base, status: "RECEIVED" }, NOW)
    assert.equal(delivered.kind === "status" && delivered.status, "delivered")
    const byMe = parseZapiWebhook({ ...base, status: "READ_BY_ME" }, NOW)
    assert.equal(byMe.kind === "status" && byMe.status, "read_by_me")
  })

  it("resultado do envio, com e sem erro", () => {
    const ok = parseZapiWebhook({ phone: "554499999999", messageId: "M1", zaapId: "Z1", instanceId: "INST1", momment: 1, type: "DeliveryCallback" }, NOW)
    assert.ok(ok.kind === "delivery" && !ok.error)
    const failed = parseZapiWebhook(
      { phone: "554499999999", messageId: "M1", zaapId: "Z1", instanceId: "INST1", error: "Phone number does not exist", type: "DeliveryCallback" },
      NOW,
    )
    assert.equal(failed.kind === "delivery" && failed.error, "Phone number does not exist")
  })

  it("conexão e desconexão", () => {
    const on = parseZapiWebhook({ type: "ConnectedCallback", connected: true, momment: 26151515154, instanceId: "INST1", phone: "5544999999999" }, NOW)
    assert.deepEqual(on.kind === "connection" && [on.connected, on.phone], [true, "5544999999999"])
    const off = parseZapiWebhook({ momment: 1580163342, error: "Device has been disconnected", disconnected: true, type: "DisconnectedCallback", instanceId: "INST1" }, NOW)
    assert.deepEqual(off.kind === "connection" && [off.connected, off.detail, off.at], [false, "Device has been disconnected", new Date(1580163342000).toISOString()])
  })

  it("sem instanceId, o evento é descartado", () => {
    assert.equal(parseZapiWebhook({ type: "ReceivedCallback", text: { message: "x" } }, NOW).kind, "ignored")
    assert.equal(momentToISO(undefined, NOW), NOW.toISOString())
  })
})

describe("cliente da Z-API", () => {
  const creds = { instanceId: "INST1", token: "TOK", clientToken: "SEC" }

  it("monta a URL com instância e token e envia o Client-Token", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const client = createZapiClient(creds, {
      baseUrl: "https://api.test",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ zaapId: "Z1", messageId: "M1", id: "M1" }), { status: 200 })
      }) as typeof fetch,
    })
    const result = await client.sendText({ phone: "5511999998888", text: "Olá", replyTo: "OLD" })
    assert.deepEqual(result, { messageId: "M1", providerId: "Z1" })
    assert.equal(calls[0].url, "https://api.test/instances/INST1/token/TOK/send-text")
    assert.equal((calls[0].init.headers as Record<string, string>)["Client-Token"], "SEC")
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { phone: "5511999998888", message: "Olá", messageId: "OLD" })
  })

  it("documento leva a extensão na rota", async () => {
    let url = ""
    const client = createZapiClient(creds, {
      baseUrl: "https://api.test",
      fetch: (async (u: string) => {
        url = u
        return new Response(JSON.stringify({ messageId: "M2" }))
      }) as typeof fetch,
    })
    await client.sendDocument({ phone: "5511999998888", url: "https://f/x.pdf", fileName: "x.pdf", extension: "PDF" })
    assert.equal(url, "https://api.test/instances/INST1/token/TOK/send-document/pdf")
  })

  it("erros viram ZapiError com mensagem legível", async () => {
    const client = createZapiClient(creds, {
      baseUrl: "https://api.test",
      fetch: (async () => new Response(JSON.stringify({ error: "null not allowed" }), { status: 400 })) as typeof fetch,
    })
    await assert.rejects(client.sendText({ phone: "1", text: "x" }), (error: unknown) => {
      assert.ok(error instanceof ZapiError)
      assert.match(error.message, /credenciais/)
      return true
    })
  })

  it("status: `error` informativo junto de `connected` não é falha", async () => {
    const client = createZapiClient(creds, {
      baseUrl: "https://api.test",
      fetch: (async () => new Response(JSON.stringify({ connected: false, error: "You are not connected", smartphoneConnected: false }))) as typeof fetch,
    })
    assert.deepEqual(await client.status(), { connected: false, detail: "You are not connected", smartphoneConnected: false })
  })
})
