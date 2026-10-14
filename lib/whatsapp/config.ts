import type { Tone } from "@/lib/core/config"
import type { ConversationStatusCategory, ConversationStatusOption, MessageType } from "@/types"

/**
 * Status do sistema. Cada escritório poderá criar os seus (`whatsapp_statuses`),
 * sempre ligados a uma destas categorias — é a categoria que move filtros e
 * automações (mensagem do cliente reabre uma conversa resolvida, por exemplo).
 */
export const SYSTEM_STATUSES: ConversationStatusOption[] = [
  { key: "new", label: "Novo", category: "new" },
  { key: "in_progress", label: "Em atendimento", category: "in_progress" },
  { key: "waiting_client", label: "Aguardando cliente", category: "waiting_client" },
  { key: "resolved", label: "Resolvido", category: "resolved" },
]

export const STATUS_TONE: Record<ConversationStatusCategory, Tone> = {
  new: "info",
  in_progress: "brand",
  waiting_client: "warning",
  resolved: "success",
}

export function statusOption(key: string, custom: ConversationStatusOption[] = []): ConversationStatusOption {
  return (
    SYSTEM_STATUSES.find((s) => s.key === key) ??
    custom.find((s) => s.key === key) ?? { key, label: key, category: "in_progress" }
  )
}

export const isSystemStatus = (key: string) => SYSTEM_STATUSES.some((s) => s.key === key)

/** Prévia curta de uma mensagem sem texto (lista de conversas, resposta citada). */
export const TYPE_PREVIEW: Record<MessageType, string> = {
  text: "Mensagem",
  image: "Imagem",
  document: "Documento",
  audio: "Áudio",
  video: "Vídeo",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato",
  note: "Nota interna",
  event: "Registro",
  unsupported: "Mensagem não suportada",
}

/**
 * Janela de atendimento do WhatsApp oficial: depois de 24 h sem mensagem do cliente,
 * a Meta só aceita modelos de mensagem aprovados (a regra vale no servidor e na tela).
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60_000

export function insideServiceWindow(lastInboundAt: string | null | undefined, now = Date.now()) {
  if (!lastInboundAt) return false
  const at = Date.parse(lastInboundAt)
  return Number.isFinite(at) && now - at < SERVICE_WINDOW_MS
}

export const OUTSIDE_WINDOW_MESSAGE =
  "Já se passaram 24 horas desde a última mensagem do cliente. Pela regra do WhatsApp, agora só é possível enviar um modelo de mensagem aprovado — o envio de modelos chega na próxima etapa da Íntegra."

export const TEXT_ONLY_MESSAGE = "Por enquanto, o WhatsApp oficial envia só mensagens de texto pela Íntegra. Anexos chegam na próxima etapa."

/**
 * Regras do WhatsApp oficial (Meta) para uma mensagem que sai da Íntegra: o motivo da
 * recusa, ou null. Notas internas nunca vão ao WhatsApp e passam sempre.
 */
export function metaSendRefusal(
  provider: string | null | undefined,
  lastInboundAt: string | null | undefined,
  type: "text" | "image" | "document" | "audio" | "note",
  now = Date.now(),
): string | null {
  if (provider !== "meta" || type === "note") return null
  if (type !== "text") return TEXT_ONLY_MESSAGE
  return insideServiceWindow(lastInboundAt, now) ? null : OUTSIDE_WINDOW_MESSAGE
}

/** Tamanho máximo de um anexo enviado pela Íntegra (o bucket aceita até 64 MB). */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024
