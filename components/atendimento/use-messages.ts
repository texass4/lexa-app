"use client"

import * as React from "react"
import { fetchMessage, fetchMessages, MESSAGE_PAGE } from "@/lib/whatsapp/client"
import { toAttachment, toMessage } from "@/lib/whatsapp/mappers"
import type { WhatsAppMessage } from "@/types"
import { useInbox, type MessageEvent } from "./inbox-provider"

const MEDIA = new Set(["image", "document", "audio", "video", "sticker"])

const bySentAt = (a: WhatsAppMessage, b: WhatsAppMessage) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id)

function upsert(list: WhatsAppMessage[], message: WhatsAppMessage) {
  const index = list.findIndex((m) => m.id === message.id)
  if (index === -1) return [...list, message].sort(bySentAt)
  const next = [...list]
  // A linha do Realtime não traz os anexos; mantém os que já estavam.
  next[index] = { ...message, attachments: message.attachments.length ? message.attachments : list[index].attachments }
  return next.sort(bySentAt)
}

interface State {
  conversationId?: string
  messages: WhatsAppMessage[]
  loading: boolean
  hasMore: boolean
  error: boolean
}

/** Mensagens da conversa aberta, com paginação para trás e atualização em tempo real. */
export function useMessages(conversationId: string | undefined) {
  const { subscribeMessages } = useInbox()
  const [state, setState] = React.useState<State>({ messages: [], loading: true, hasMore: false, error: false })

  const current = state.conversationId === conversationId ? state : { conversationId, messages: [], loading: true, hasMore: false, error: false }

  React.useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    fetchMessages(conversationId)
      .then((messages) => {
        if (!cancelled) setState({ conversationId, messages, loading: false, hasMore: messages.length === MESSAGE_PAGE, error: false })
      })
      .catch(() => {
        if (!cancelled) setState({ conversationId, messages: [], loading: false, hasMore: false, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  React.useEffect(() => {
    if (!conversationId) return
    return subscribeMessages((event: MessageEvent) => {
      if (event.kind === "message") {
        if (event.row.conversation_id !== conversationId) return
        const message = toMessage(event.row)
        setState((s) => (s.conversationId === conversationId ? { ...s, messages: upsert(s.messages, message) } : s))
        // Mídia nova: o anexo é gravado logo depois — busca a mensagem completa.
        if (MEDIA.has(message.type)) {
          setTimeout(() => {
            fetchMessage(message.id).then((full) => {
              if (full) setState((s) => (s.conversationId === conversationId ? { ...s, messages: upsert(s.messages, full) } : s))
            })
          }, 400)
        }
        return
      }
      const attachment = toAttachment(event.row)
      setState((s) => {
        if (s.conversationId !== conversationId || !s.messages.some((m) => m.id === attachment.messageId)) return s
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.id === attachment.messageId ? { ...m, attachments: [...m.attachments.filter((a) => a.id !== attachment.id), attachment] } : m,
          ),
        }
      })
    })
  }, [conversationId, subscribeMessages])

  const put = React.useCallback(
    (message: WhatsAppMessage) => {
      setState((s) => (s.conversationId === conversationId ? { ...s, messages: upsert(s.messages, message) } : s))
    },
    [conversationId],
  )

  const remove = React.useCallback((id: string) => {
    setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) }))
  }, [])

  const loadOlder = React.useCallback(async () => {
    if (!conversationId) return
    const oldest = current.messages[0]
    if (!oldest) return
    const older = await fetchMessages(conversationId, oldest.sentAt)
    setState((s) =>
      s.conversationId === conversationId
        ? { ...s, messages: [...older.filter((m) => !s.messages.some((x) => x.id === m.id)), ...s.messages], hasMore: older.length === MESSAGE_PAGE }
        : s,
    )
  }, [conversationId, current.messages])

  return { ...current, put, remove, loadOlder }
}
