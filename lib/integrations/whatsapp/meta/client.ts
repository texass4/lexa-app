/**
 * Cliente da WhatsApp Business Cloud API (Graph API da Meta). Só roda no servidor:
 * o token de acesso de cada escritório chega aqui já decifrado (`services/whatsapp/
 * credentials.ts`) e nunca vai para o navegador nem para o log.
 *
 *   https://graph.facebook.com/{versão}/{phone-number-id}/messages   (envio)
 *   https://graph.facebook.com/{versão}/{phone-number-id}            (dados do número)
 *   https://graph.facebook.com/{versão}/{waba-id}/subscribed_apps    (recebimento)
 *
 * A versão da Graph API vem de `META_GRAPH_API_VERSION` (padrão abaixo). A Meta
 * desativa versões ~2 anos depois do lançamento: atualize quando ela avisar.
 */

import type { SendResult, WhatsAppProvider } from "../types"
import { OUTSIDE_WINDOW_MESSAGE } from "@/lib/whatsapp/config"

export const DEFAULT_GRAPH_VERSION = "v23.0"
const GRAPH = "https://graph.facebook.com"
const TIMEOUT_MS = 25_000
/** Maior arquivo recebido que guardamos (o bucket aceita até 64 MB). */
export const MAX_MEDIA_BYTES = 64 * 1024 * 1024

export interface MetaCredentials {
  /** Token de acesso (usuário do sistema do escritório, ou do Cadastro Incorporado). */
  accessToken: string
  phoneNumberId: string
  businessAccountId: string
}

export interface MetaPhoneNumber {
  id: string
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string
  codeVerificationStatus?: string
  nameStatus?: string
  platformType?: string
}

/**
 * Erro da Graph API. `message` é para quem usa a Íntegra (o que aconteceu e o que
 * fazer); `code`/`subcode`/`detail` são para o log — nunca o token.
 */
export class MetaError extends Error {
  status: number
  code?: number
  subcode?: number
  detail?: string
  constructor(message: string, status: number, info: { code?: number; subcode?: number; detail?: string } = {}) {
    super(message)
    this.name = "MetaError"
    this.status = status
    this.code = info.code
    this.subcode = info.subcode
    this.detail = info.detail
  }
}

/** Janela de atendimento: fora dela, a Meta só aceita modelos de mensagem aprovados. */
export { OUTSIDE_WINDOW_MESSAGE }

/**
 * Códigos de erro da Cloud API → mensagem para a tela. Lista curta dos que um
 * escritório encontra no dia a dia; o resto cai na mensagem genérica (e no log).
 */
export function metaErrorMessage(code: number | undefined, status: number, subcode?: number): string {
  switch (code) {
    case 190:
      return "O acesso do WhatsApp do escritório expirou ou foi revogado na Meta. Gere um novo token e salve a conexão de novo."
    case 10:
    case 200:
    case 299:
    case 131005:
      return "O token informado não tem permissão para este número do WhatsApp. Confira as permissões do usuário do sistema na Meta."
    case 100:
      return subcode === 33
        ? "A Meta não encontrou este número com o token informado. Confira o identificador do número e o da conta."
        : "A Meta recusou o pedido por um dado inválido. Confira o número do destinatário e o texto."
    case 131047:
      return OUTSIDE_WINDOW_MESSAGE
    case 131026:
      return "A mensagem não foi entregue: o número pode não ter WhatsApp ou não aceitou mensagens deste número."
    case 131030:
      return "Este destinatário não está na lista de números permitidos do número de teste da Meta. Adicione-o no painel da Meta ou use o número oficial."
    case 131056:
      return "Muitas mensagens para este contato em pouco tempo. Aguarde um pouco e tente de novo."
    case 4:
    case 80007:
    case 130429:
    case 131048:
      return "O limite de envios do WhatsApp foi atingido. Tente novamente em instantes."
    case 131031:
      return "A conta do WhatsApp Business do escritório está bloqueada na Meta. Verifique o painel da Meta."
    case 368:
      return "A Meta bloqueou temporariamente os envios deste número por violação de política. Verifique o painel da Meta."
    case 133010:
      return "O número ainda não foi registrado na Cloud API da Meta. Conclua o registro do número no painel da Meta."
    case 131051:
      return "Este tipo de mensagem não é aceito pelo WhatsApp."
    case 131052:
    case 131053:
      return "Não foi possível baixar ou enviar a mídia desta mensagem."
    case 1:
    case 2:
    case 131000:
      return "O WhatsApp está instável no momento. Tente novamente em instantes."
  }
  if (status === 401) return "O acesso do WhatsApp do escritório expirou ou foi revogado na Meta. Gere um novo token e salve a conexão de novo."
  if (status === 429) return "O limite de envios do WhatsApp foi atingido. Tente novamente em instantes."
  if (status >= 500) return "O WhatsApp está instável no momento. Tente novamente em instantes."
  return "O WhatsApp não aceitou o pedido. Tente novamente; se continuar, verifique a conexão do número."
}

type Fetch = typeof fetch

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_data?: { details?: string }; fbtrace_id?: string }
}

export function graphVersion(env: Record<string, string | undefined> = process.env) {
  const version = env.META_GRAPH_API_VERSION?.trim()
  return version && /^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION
}

export function createMetaClient(credentials: MetaCredentials, options: { fetch?: Fetch; version?: string; baseUrl?: string } = {}) {
  const doFetch = options.fetch ?? fetch
  const root = `${(options.baseUrl ?? GRAPH).replace(/\/$/, "")}/${options.version ?? graphVersion()}`
  const auth = { Authorization: `Bearer ${credentials.accessToken}` }

  async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${root}/${path}`, {
        method,
        headers: { ...auth, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError"
      throw new MetaError(
        timeout ? "O WhatsApp demorou para responder. Tente novamente em instantes." : "Não foi possível falar com o WhatsApp. Tente novamente em instantes.",
        504,
        { detail: error instanceof Error ? error.name : "network" },
      )
    }
    const text = await response.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : undefined
    } catch {
      data = undefined
    }
    if (!response.ok) {
      const error = (data as GraphError | undefined)?.error
      const code = typeof error?.code === "number" ? error.code : undefined
      const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : undefined
      // Para o log: tipo, mensagem e rastreio da Meta (não trazem o token).
      const detail = [error?.type, error?.message, error?.error_data?.details, error?.fbtrace_id && `fbtrace ${error.fbtrace_id}`].filter(Boolean).join(" · ").slice(0, 400)
      throw new MetaError(metaErrorMessage(code, response.status, subcode), response.status, { code, subcode, detail: detail || text.slice(0, 200) })
    }
    return data as T
  }

  const phonePath = encodeURIComponent(credentials.phoneNumberId)
  const wabaPath = encodeURIComponent(credentials.businessAccountId)

  const unsupported = async (): Promise<SendResult> => {
    throw new MetaError("Por enquanto, o WhatsApp oficial envia só mensagens de texto pela Íntegra.", 400)
  }

  const client = {
    sendsMedia: false,

    async sendText({ phone, text, replyTo }: { phone: string; text: string; replyTo?: string }): Promise<SendResult> {
      const data = await call<{ messages?: { id?: string }[] }>("POST", `${phonePath}/messages`, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body: text, preview_url: false },
        ...(replyTo ? { context: { message_id: replyTo } } : {}),
      })
      const messageId = data?.messages?.[0]?.id
      if (!messageId) throw new MetaError("O envio não foi confirmado pelo WhatsApp. Tente novamente.", 502, { detail: "resposta sem messages[0].id" })
      return { messageId }
    },

    sendImage: unsupported as WhatsAppProvider["sendImage"],
    sendDocument: unsupported as WhatsAppProvider["sendDocument"],
    sendAudio: unsupported as WhatsAppProvider["sendAudio"],

    /** Confirmação de leitura (os dois tiques azuis no celular do cliente). */
    async markRead({ messageId }: { phone: string; messageId: string }) {
      await call("POST", `${phonePath}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId })
    },

    /** Dados públicos do número; falha se o token não tem acesso a ele. */
    async phoneNumber(): Promise<MetaPhoneNumber> {
      const data = await call<{
        id: string
        display_phone_number?: string
        verified_name?: string
        quality_rating?: string
        code_verification_status?: string
        name_status?: string
        platform_type?: string
      }>("GET", `${phonePath}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type`)
      return {
        id: data.id,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        codeVerificationStatus: data.code_verification_status,
        nameStatus: data.name_status,
        platformType: data.platform_type,
      }
    },

    /** O número pertence à conta (WABA) informada? */
    async businessOwnsPhone(): Promise<boolean> {
      const data = await call<{ data?: { id?: string }[] }>("GET", `${wabaPath}/phone_numbers?fields=id&limit=100`)
      return (data?.data ?? []).some((phone) => phone.id === credentials.phoneNumberId)
    },

    /** Assina o aplicativo da Íntegra na conta: sem isso, a Meta não manda as mensagens recebidas. */
    async subscribeApp() {
      const data = await call<{ success?: boolean }>("POST", `${wabaPath}/subscribed_apps`)
      if (data?.success === false) throw new MetaError("A Meta não confirmou o recebimento de mensagens para esta conta.", 502)
    },

    /** Desfaz a assinatura (ao desconectar): a Meta para de mandar os eventos desta conta. */
    async unsubscribeApp() {
      await call("DELETE", `${wabaPath}/subscribed_apps`)
    },

    async status() {
      const phone = await client.phoneNumber()
      return { connected: true, detail: phone.verifiedName }
    },

    /** Mídia recebida: a Meta dá um id → endereço temporário (5 min) → arquivo, sempre com o token. */
    async downloadMedia(mediaId: string) {
      if (!/^[0-9]{1,40}$/.test(mediaId)) throw new MetaError("Mídia inválida.", 400)
      const info = await call<{ url?: string; mime_type?: string; file_size?: number }>("GET", encodeURIComponent(mediaId))
      if (!info?.url) throw new MetaError("A Meta não informou o endereço da mídia.", 502)
      if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) throw new MetaError("Arquivo acima de 64 MB.", 413)
      const url = new URL(info.url)
      // Só HTTPS em domínios da Meta: o token nunca vai para outro endereço.
      if (url.protocol !== "https:" || !/(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/.test(url.hostname))
        throw new MetaError("Endereço de mídia inesperado.", 502, { detail: url.hostname })
      const response = await doFetch(url, { headers: auth, signal: AbortSignal.timeout(90_000), redirect: "error", cache: "no-store" })
      if (!response.ok) throw new MetaError("Não foi possível baixar a mídia recebida.", response.status)
      const declared = Number(response.headers.get("content-length") ?? 0)
      if (declared > MAX_MEDIA_BYTES) throw new MetaError("Arquivo acima de 64 MB.", 413)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > MAX_MEDIA_BYTES) throw new MetaError("Arquivo acima de 64 MB.", 413)
      return { bytes, mimeType: info.mime_type ?? response.headers.get("content-type") ?? undefined }
    },
  }

  return client satisfies WhatsAppProvider
}

export type MetaClient = ReturnType<typeof createMetaClient>
