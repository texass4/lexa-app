/**
 * Cliente HTTP da Z-API. Só roda no servidor: as credenciais vêm do `.env`
 * (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`) e nunca vão para o navegador.
 *
 * URL: https://api.z-api.io/instances/{instanceId}/token/{token}/{rota}
 * Header de segurança da conta: `Client-Token`.
 */

import type { SendResult, WhatsAppProvider } from "../types"

export interface ZapiCredentials {
  instanceId: string
  token: string
  /** Token de segurança da conta (Painel › Segurança). Obrigatório quando ativado lá. */
  clientToken?: string
}

export class ZapiError extends Error {
  status: number
  detail?: string
  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

const DEFAULT_BASE_URL = "https://api.z-api.io"
const TIMEOUT_MS = 25_000

/** Credenciais do `.env`, ou null se a Z-API não foi configurada. */
export function zapiCredentialsFromEnv(): ZapiCredentials | null {
  const instanceId = process.env.ZAPI_INSTANCE_ID?.trim()
  const token = process.env.ZAPI_TOKEN?.trim()
  if (!instanceId || !token) return null
  return { instanceId, token, clientToken: process.env.ZAPI_CLIENT_TOKEN?.trim() || undefined }
}

/**
 * Mensagem para quem está na Íntegra: o que aconteceu e o que fazer, sem nome de
 * provedor, variável ou código HTTP. O detalhe técnico fica em `detail`, para o log.
 */
function userMessage(status: number, detail: string) {
  if (status === 401 || status === 403 || status === 404 || /client-token|not allowed/i.test(detail))
    return "Não foi possível conectar ao WhatsApp do escritório. Fale com o suporte da Íntegra."
  if (status === 429) return "O WhatsApp limitou os envios por excesso de mensagens. Tente novamente em instantes."
  if (/not connected|disconnected|restore the session/i.test(detail)) return "O WhatsApp do escritório está desconectado. Reconecte o número para voltar a enviar."
  if (status >= 500) return "O WhatsApp está instável no momento. Tente novamente em instantes."
  return "O WhatsApp não aceitou a mensagem. Confira o conteúdo e tente novamente."
}

type Fetch = typeof fetch

export function createZapiClient(credentials: ZapiCredentials, options: { baseUrl?: string; fetch?: Fetch } = {}) {
  const baseUrl = (options.baseUrl ?? process.env.ZAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "")
  const doFetch = options.fetch ?? fetch
  const root = `${baseUrl}/instances/${encodeURIComponent(credentials.instanceId)}/token/${encodeURIComponent(credentials.token)}`

  async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${root}/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(credentials.clientToken ? { "Client-Token": credentials.clientToken } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError"
      throw new ZapiError(timeout ? "O WhatsApp demorou para responder. Tente novamente em instantes." : "Não foi possível conectar ao WhatsApp. Tente novamente em instantes.", 504, String(error))
    }

    const text = await response.text()
    let data: unknown = undefined
    try {
      data = text ? JSON.parse(text) : undefined
    } catch {
      data = text
    }
    // A Z-API às vezes responde 200 com `{ error }`. Só `status` usa `error` como
    // informação ("You are already connected") — lá, `connected` vem junto.
    const record = typeof data === "object" && data ? (data as Record<string, unknown>) : {}
    const errorDetail = record.error ? String(record.error) : ""
    const answered = "connected" in record || "value" in record || "messageId" in record
    if (!response.ok || (errorDetail && !answered)) {
      const detail = errorDetail || text.slice(0, 300)
      throw new ZapiError(userMessage(response.status, detail), response.ok ? 502 : response.status, detail)
    }
    return data as T
  }

  const send = async (path: string, body: Record<string, unknown>): Promise<SendResult> => {
    const data = await call<{ zaapId?: string; messageId?: string; id?: string }>("POST", path, body)
    const messageId = data?.messageId ?? data?.id
    if (!messageId) throw new ZapiError("O envio não foi confirmado pelo WhatsApp. Tente novamente.", 502, JSON.stringify(data))
    return { messageId, providerId: data.zaapId }
  }

  const provider: WhatsAppProvider = {
    sendText: ({ phone, text, replyTo }) => send("send-text", { phone, message: text, ...(replyTo ? { messageId: replyTo } : {}) }),

    sendImage: ({ phone, url, caption, replyTo }) =>
      send("send-image", { phone, image: url, ...(caption ? { caption } : {}), ...(replyTo ? { messageId: replyTo } : {}) }),

    sendDocument: ({ phone, url, fileName, extension, caption, replyTo }) =>
      send(`send-document/${encodeURIComponent(extension.toLowerCase())}`, {
        phone,
        document: url,
        fileName,
        ...(caption ? { caption } : {}),
        ...(replyTo ? { messageId: replyTo } : {}),
      }),

    // `waveform` envia como mensagem de voz (com ondas), como um áudio gravado no app.
    sendAudio: ({ phone, url }) => send("send-audio", { phone, audio: url, waveform: true }),

    async markRead({ phone, messageId }) {
      await call("POST", "read-message", { phone, messageId })
    },

    async status() {
      const data = await call<{ connected?: boolean; error?: string; smartphoneConnected?: boolean }>("GET", "status")
      return { connected: !!data?.connected, detail: data?.error, smartphoneConnected: data?.smartphoneConnected }
    },

    async qrCode() {
      const data = await call<{ value?: string; challenge?: unknown } | string>("GET", "qr-code/image")
      if (typeof data === "string") return { image: data.startsWith("data:") ? data : `data:image/png;base64,${data}` }
      if (data?.challenge) return { needsPasskey: true }
      const value = data?.value
      if (!value) return {}
      return { image: value.startsWith("data:") ? value : `data:image/png;base64,${value}` }
    },

    async configureWebhooks(url) {
      // Uma URL para todos os eventos; `notifySentByMe` traz também o que foi enviado
      // direto pelo celular, para o histórico ficar completo.
      await call("PUT", "update-every-webhooks", { value: url, notifySentByMe: true })
    },
  }

  return provider
}
