import type { Tone } from "@/lib/config"
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
  in_progress: "gold",
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

/** Tamanho máximo de um anexo enviado pelo LEXA (o bucket aceita até 64 MB). */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024
