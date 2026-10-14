import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createMetaClient, DEFAULT_GRAPH_VERSION, graphVersion, MetaError, metaErrorMessage } from "./client"

const TOKEN = "EAAG-token-de-teste-que-nunca-pode-vazar-0123456789"
const creds = { accessToken: TOKEN, phoneNumberId: "111111111111111", businessAccountId: "911111111111111" }

/** Graph API de mentira: registra os pedidos e responde o que o teste mandar. */
function graph(reply: (url: string, init: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchFn = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    const { status = 200, body, headers } = reply(url, init)
    const payload = body instanceof Uint8Array ? body : JSON.stringify(body ?? {})
    return new Response(payload as BodyInit, { status, headers })
  }) as typeof fetch
  return { fetchFn, calls }
}

describe("Meta Cloud API — envio de texto", () => {
  it("POST /{phone-number-id}/messages com o token no cabeçalho e o formato da Meta", async () => {
    const { fetchFn, calls } = graph(() => ({ body: { messaging_product: "whatsapp", contacts: [{ wa_id: "5511988887777" }], messages: [{ id: "wamid.ENVIADA" }] } }))
    const client = createMetaClient(creds, { fetch: fetchFn, version: "v23.0" })
    const result = await client.sendText({ phone: "5511988887777", text: "Olá! Recebemos seus documentos.", replyTo: "wamid.CITADA" })
    assert.deepEqual(result, { messageId: "wamid.ENVIADA" })
    assert.equal(calls[0].url, "https://graph.facebook.com/v23.0/111111111111111/messages")
    assert.equal(calls[0].init.method, "POST")
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`)
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511988887777",
      type: "text",
      text: { body: "Olá! Recebemos seus documentos.", preview_url: false },
      context: { message_id: "wamid.CITADA" },
    })
  })

  it("fora da janela de 24 h (131047): erro com explicação e código, sem o token", async () => {
    const { fetchFn } = graph(() => ({
      status: 400,
      body: { error: { message: "(#131047) Re-engagement message", type: "OAuthException", code: 131047, error_data: { details: "Message failed to send because more than 24 hours have passed" }, fbtrace_id: "Abc" } },
    }))
    const error = await createMetaClient(creds, { fetch: fetchFn }).sendText({ phone: "5511988887777", text: "oi" }).catch((e) => e)
    assert.ok(error instanceof MetaError)
    assert.equal(error.code, 131047)
    assert.match(error.message, /24 horas/)
    assert.match(error.detail ?? "", /fbtrace Abc/)
    assert.equal(JSON.stringify(error).includes(TOKEN) || String(error.message).includes(TOKEN) || String(error.detail).includes(TOKEN), false)
  })

  it("token expirado (190), sem permissão (200), limite (130429) e instabilidade: mensagens próprias", () => {
    assert.match(metaErrorMessage(190, 401), /expirou ou foi revogado/)
    assert.match(metaErrorMessage(200, 403), /não tem permissão/)
    assert.match(metaErrorMessage(130429, 429), /limite de envios/)
    assert.match(metaErrorMessage(undefined, 503), /instável/)
    assert.match(metaErrorMessage(100, 400, 33), /não encontrou este número/)
  })

  it("resposta sem id da mensagem não é tratada como enviada", async () => {
    const { fetchFn } = graph(() => ({ body: { messages: [] } }))
    await assert.rejects(createMetaClient(creds, { fetch: fetchFn }).sendText({ phone: "5511988887777", text: "oi" }), MetaError)
  })

  it("anexos ainda não: recusa sem chamar a Meta", async () => {
    const { fetchFn, calls } = graph(() => ({}))
    const client = createMetaClient(creds, { fetch: fetchFn })
    await assert.rejects(client.sendImage({ phone: "5511988887777", url: "https://x/y.png" }), /só mensagens de texto/)
    assert.equal(calls.length, 0)
    assert.equal(client.sendsMedia, false)
  })
})

describe("Meta Cloud API — conexão", () => {
  it("dados do número, posse pela conta e assinatura do aplicativo", async () => {
    const { fetchFn, calls } = graph((url) => {
      if (url.includes("/phone_numbers")) return { body: { data: [{ id: "999" }, { id: "111111111111111" }] } }
      if (url.includes("/subscribed_apps")) return { body: { success: true } }
      return { body: { id: "111111111111111", display_phone_number: "+55 11 99999-0001", verified_name: "Prado Lima Advocacia", quality_rating: "GREEN", platform_type: "CLOUD_API" } }
    })
    const client = createMetaClient(creds, { fetch: fetchFn, version: "v23.0" })
    const phone = await client.phoneNumber()
    assert.equal(phone.verifiedName, "Prado Lima Advocacia")
    assert.equal(phone.platformType, "CLOUD_API")
    assert.equal(await client.businessOwnsPhone(), true)
    await client.subscribeApp()
    assert.match(calls[0].url, /\/v23\.0\/111111111111111\?fields=.*verified_name/)
    assert.match(calls[1].url, /\/911111111111111\/phone_numbers/)
    assert.equal(calls[2].init.method, "POST")
    assert.match(calls[2].url, /\/911111111111111\/subscribed_apps$/)
  })

  it("número fora da conta informada: não pertence", async () => {
    const { fetchFn } = graph(() => ({ body: { data: [{ id: "999" }] } }))
    assert.equal(await createMetaClient(creds, { fetch: fetchFn }).businessOwnsPhone(), false)
  })

  it("confirmação de leitura no formato da Meta", async () => {
    const { fetchFn, calls } = graph(() => ({ body: { success: true } }))
    await createMetaClient(creds, { fetch: fetchFn }).markRead({ phone: "5511988887777", messageId: "wamid.LIDA" })
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { messaging_product: "whatsapp", status: "read", message_id: "wamid.LIDA" })
  })

  it("versão da Graph API: do ambiente, se válida; senão a padrão", () => {
    assert.equal(graphVersion({ META_GRAPH_API_VERSION: "v24.0" }), "v24.0")
    assert.equal(graphVersion({ META_GRAPH_API_VERSION: "latest" }), DEFAULT_GRAPH_VERSION)
    assert.equal(graphVersion({}), DEFAULT_GRAPH_VERSION)
  })
})

describe("Meta Cloud API — mídia recebida", () => {
  it("id → endereço da Meta → arquivo, com o token só para domínios da Meta", async () => {
    const { fetchFn, calls } = graph((url) =>
      url.startsWith("https://graph.facebook.com")
        ? { body: { url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", mime_type: "image/jpeg", file_size: 3 } }
        : { body: new Uint8Array([1, 2, 3]), headers: { "content-type": "image/jpeg" } },
    )
    const file = await createMetaClient(creds, { fetch: fetchFn }).downloadMedia("1234567890")
    assert.deepEqual([...file.bytes], [1, 2, 3])
    assert.equal(file.mimeType, "image/jpeg")
    assert.equal(new URL(calls[1].url).hostname, "lookaside.fbsbx.com")
    assert.equal((calls[1].init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`)
  })

  it("endereço fora da Meta: não manda o token", async () => {
    const { fetchFn, calls } = graph(() => ({ body: { url: "https://atacante.example.com/arquivo", file_size: 3 } }))
    await assert.rejects(createMetaClient(creds, { fetch: fetchFn }).downloadMedia("1234567890"), /inesperado/)
    assert.equal(calls.length, 1)
  })

  it("arquivo acima de 64 MB: recusado antes de baixar", async () => {
    const { fetchFn, calls } = graph(() => ({ body: { url: "https://lookaside.fbsbx.com/x", file_size: 70 * 1024 * 1024 } }))
    await assert.rejects(createMetaClient(creds, { fetch: fetchFn }).downloadMedia("1234567890"), /64 MB/)
    assert.equal(calls.length, 1)
  })
})
