import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { describe, it } from "node:test"
import { parseMetaWebhook, redactMetaPayload, verifyChallenge, verifySignature } from "./webhook"

const SECRET = "segredo-do-app-de-teste"
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`

/** Corpo no formato da Cloud API (estrutura da documentação da Meta, dados de teste). */
function payload(value: Record<string, unknown>, phoneNumberId = "111111111111111", field = "messages") {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "911111111111111", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: "5511999990001", phone_number_id: phoneNumberId }, ...value } }] }],
  }
}

describe("webhook da Meta — verificação inicial", () => {
  const params = (mode: string, token: string, challenge = "1158201444") => new URLSearchParams({ "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge })

  it("devolve o challenge só com modo subscribe e token certo", () => {
    assert.equal(verifyChallenge(params("subscribe", "verifica"), "verifica"), "1158201444")
    assert.equal(verifyChallenge(params("subscribe", "errado"), "verifica"), null)
    assert.equal(verifyChallenge(params("unsubscribe", "verifica"), "verifica"), null)
    assert.equal(verifyChallenge(params("subscribe", "verifica", "<script>"), "verifica"), null)
  })

  it("sem token configurado no servidor, recusa sempre", () => {
    assert.equal(verifyChallenge(params("subscribe", ""), undefined), null)
    assert.equal(verifyChallenge(params("subscribe", "qualquer"), ""), null)
  })
})

describe("webhook da Meta — assinatura", () => {
  const body = JSON.stringify(payload({ messages: [] }))
  const bytes = new TextEncoder().encode(body)

  it("aceita a assinatura HMAC-SHA256 do corpo bruto com o App Secret", () => {
    assert.equal(verifySignature(bytes, sign(body), SECRET), true)
  })

  it("recusa corpo alterado, segredo errado, cabeçalho ausente ou malformado", () => {
    assert.equal(verifySignature(new TextEncoder().encode(body.replace("whatsapp", "whatsapq")), sign(body), SECRET), false)
    assert.equal(verifySignature(bytes, sign(body, "outro-segredo"), SECRET), false)
    assert.equal(verifySignature(bytes, null, SECRET), false)
    assert.equal(verifySignature(bytes, "sha1=abc", SECRET), false)
    assert.equal(verifySignature(bytes, "sha256=xyz", SECRET), false)
    assert.equal(verifySignature(bytes, sign(body), undefined), false)
  })

  it("acentos: confere os bytes recebidos, não o JSON re-serializado", () => {
    const accented = '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"text":{"body":"Ol\\u00e1"}}]}}]}]}'
    assert.equal(verifySignature(new TextEncoder().encode(accented), sign(accented), SECRET), true)
    const reserialized = JSON.stringify(JSON.parse(accented))
    assert.notEqual(reserialized, accented)
    assert.equal(verifySignature(new TextEncoder().encode(reserialized), sign(accented), SECRET), false)
  })
})

describe("webhook da Meta — mensagens", () => {
  it("texto: remetente, nome do perfil, horário, resposta citada e número do escritório", () => {
    const [event] = parseMetaWebhook(
      payload({
        contacts: [{ profile: { name: "Maria Teste" }, wa_id: "5511988887777" }],
        messages: [{ from: "5511988887777", id: "wamid.HBgM1", timestamp: "1760000000", type: "text", text: { body: "Bom dia, doutora" }, context: { id: "wamid.ANTERIOR" } }],
      }),
    )
    assert.deepEqual(event, {
      kind: "message",
      instanceExternalId: "111111111111111",
      messageId: "wamid.HBgM1",
      phone: "5511988887777",
      fromMe: false,
      at: new Date(1760000000 * 1000).toISOString(),
      contactName: "Maria Teste",
      type: "text",
      body: "Bom dia, doutora",
      media: undefined,
      replyToProviderId: "wamid.ANTERIOR",
      isEdit: false,
    })
  })

  it("mídia vem por id (baixada depois, com a credencial do escritório)", () => {
    const [image, doc, voice] = parseMetaWebhook(
      payload({
        messages: [
          { from: "5511988887777", id: "wamid.IMG", timestamp: "1760000001", type: "image", image: { id: "1234567890", mime_type: "image/jpeg", caption: "RG" } },
          { from: "5511988887777", id: "wamid.DOC", timestamp: "1760000002", type: "document", document: { id: "2234567890", mime_type: "application/pdf", filename: "contrato.pdf" } },
          { from: "5511988887777", id: "wamid.AUD", timestamp: "1760000003", type: "audio", audio: { id: "3234567890", mime_type: "audio/ogg; codecs=opus", voice: true } },
        ],
      }),
    )
    assert.equal(image.kind === "message" && image.type, "image")
    assert.deepEqual(image.kind === "message" && image.media, { kind: "image", mediaId: "1234567890", mimeType: "image/jpeg", fileName: undefined, caption: "RG", voiceNote: undefined })
    assert.equal(image.kind === "message" && image.body, "RG")
    assert.equal(doc.kind === "message" && doc.media?.fileName, "contrato.pdf")
    assert.equal(voice.kind === "message" && voice.media?.voiceNote, true)
  })

  it("localização, contato, botão e lista viram texto legível; reação é ignorada; tipo novo vira 'não suportada'", () => {
    const events = parseMetaWebhook(
      payload({
        messages: [
          { from: "5511988887777", id: "w1", timestamp: "1", type: "location", location: { latitude: -23.5, longitude: -46.6, name: "Fórum" } },
          { from: "5511988887777", id: "w2", timestamp: "1", type: "contacts", contacts: [{ name: { formatted_name: "João" }, phones: [{ phone: "+55 11 90000-0000" }] }] },
          { from: "5511988887777", id: "w3", timestamp: "1", type: "button", button: { text: "Confirmo" } },
          { from: "5511988887777", id: "w4", timestamp: "1", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "x", title: "Agendar" } } },
          { from: "5511988887777", id: "w5", timestamp: "1", type: "reaction", reaction: { message_id: "w1", emoji: "👍" } },
          { from: "5511988887777", id: "w6", timestamp: "1", type: "order_v9" },
        ],
      }),
    )
    const bodies = events.map((e) => (e.kind === "message" ? `${e.type}:${e.body ?? ""}` : e.kind))
    assert.deepEqual(bodies, [
      "location:Fórum\nhttps://maps.google.com/?q=-23.5,-46.6",
      "contact:João · +55 11 90000-0000",
      "text:Confirmo",
      "text:Agendar",
      "ignored",
      "unsupported:",
    ])
  })

  it("item malformado não derruba os outros do mesmo lote", () => {
    const events = parseMetaWebhook(
      payload({
        messages: [
          { id: "sem-remetente", type: "text", text: { body: "x" } },
          { from: "5511988887777", id: "wamid.OK", timestamp: "1", type: "text", text: { body: "ok" } },
        ],
      }),
    )
    assert.deepEqual(events.map((e) => e.kind), ["ignored", "message"])
  })

  it("lote com dois números: cada evento leva o número dele (é ele que define o escritório)", () => {
    const body = payload({ messages: [{ from: "5511988887777", id: "a", timestamp: "1", type: "text", text: { body: "A" } }] })
    const other = payload({ messages: [{ from: "5511988887777", id: "b", timestamp: "1", type: "text", text: { body: "B" } }] }, "222222222222222")
    body.entry.push(other.entry[0])
    assert.deepEqual(parseMetaWebhook(body).map((e) => e.instanceExternalId), ["111111111111111", "222222222222222"])
  })

  it("objeto de outro produto ou campo diferente de messages: ignorado", () => {
    assert.equal(parseMetaWebhook({ object: "page", entry: [] })[0].kind, "ignored")
    assert.equal(parseMetaWebhook(payload({ event: "x" }, "111", "account_update"))[0].kind, "ignored")
    assert.equal(parseMetaWebhook("lixo")[0].kind, "ignored")
  })
})

describe("webhook da Meta — status de entrega", () => {
  it("enviado, entregue e lido avançam; falha traz motivo e código", () => {
    const events = parseMetaWebhook(
      payload({
        statuses: [
          { id: "wamid.S", status: "sent", timestamp: "1760000100", recipient_id: "5511988887777" },
          { id: "wamid.S", status: "delivered", timestamp: "1760000101", recipient_id: "5511988887777" },
          { id: "wamid.S", status: "read", timestamp: "1760000102", recipient_id: "5511988887777" },
          { id: "wamid.F", status: "failed", timestamp: "1760000103", recipient_id: "5511988887777", errors: [{ code: 131047, title: "Re-engagement message" }] },
        ],
      }),
    )
    assert.deepEqual(events.slice(0, 3).map((e) => (e.kind === "status" ? e.status : e.kind)), ["sent", "delivered", "read"])
    const failed = events[3]
    assert.equal(failed.kind, "delivery")
    if (failed.kind === "delivery") {
      assert.equal(failed.messageId, "wamid.F")
      assert.equal(failed.errorCode, "131047")
      assert.match(failed.error ?? "", /24 horas/)
    }
  })
})

describe("webhook da Meta — registro sem conteúdo", () => {
  it("o registro de diagnóstico guarda ids, tipos e códigos — nunca texto, nome ou telefone", () => {
    const redacted = JSON.stringify(
      redactMetaPayload(
        payload({
          contacts: [{ profile: { name: "Maria Teste" }, wa_id: "5511988887777" }],
          messages: [{ from: "5511988887777", id: "wamid.X", timestamp: "1", type: "text", text: { body: "meu CPF é 123.456.789-00" } }],
          statuses: [{ id: "wamid.Y", status: "failed", timestamp: "2", recipient_id: "5511977776666", errors: [{ code: 131026, message: "detalhe" }] }],
        }),
      ),
    )
    assert.match(redacted, /wamid\.X/)
    assert.match(redacted, /131026/)
    for (const secret of ["Maria", "CPF", "5511988887777", "5511977776666", "detalhe"]) assert.equal(redacted.includes(secret), false, secret)
  })
})
