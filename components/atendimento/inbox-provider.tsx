"use client"

import * as React from "react"
import { getSupabase } from "@/lib/supabase/client"
import { useSession } from "@/lib/auth/session"
import { fetchConversation, fetchConversations, fetchTags, whatsappApi, type InstanceInfo } from "@/lib/whatsapp/client"
import { toContact, toInstance, type AttachmentRow, type ContactRow, type InstanceRow, type MessageRow } from "@/lib/whatsapp/mappers"
import type { WhatsAppConversation, WhatsAppTag } from "@/types"

/** Evento em tempo real de mensagem ou anexo, entregue à conversa aberta. */
export type MessageEvent = { kind: "message"; row: MessageRow } | { kind: "attachment"; row: AttachmentRow }

interface Inbox {
  /** `missing-schema`: a migração `0002_whatsapp.sql` ainda não rodou neste banco. */
  status: "loading" | "ready" | "error" | "missing-schema"
  conversations: WhatsAppConversation[]
  tags: WhatsAppTag[]
  instance: InstanceInfo | null
  instanceLoading: boolean
  reloadInstance(): Promise<void>
  reload(): Promise<void>
  /** Coloca/atualiza uma conversa na lista (resposta das rotas, sem esperar o Realtime). */
  upsertConversation(conversation: WhatsAppConversation): void
  patchConversation(id: string, patch: Partial<WhatsAppConversation>): void
  setTags: React.Dispatch<React.SetStateAction<WhatsAppTag[]>>
  subscribeMessages(listener: (event: MessageEvent) => void): () => void
}

const InboxContext = React.createContext<Inbox | null>(null)

const byActivity = (a: WhatsAppConversation, b: WhatsAppConversation) =>
  (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt)

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { organization } = useSession()
  const [status, setStatus] = React.useState<Inbox["status"]>("loading")
  const [conversations, setConversations] = React.useState<WhatsAppConversation[]>([])
  const [tags, setTags] = React.useState<WhatsAppTag[]>([])
  const [instance, setInstance] = React.useState<InstanceInfo | null>(null)
  const [instanceLoading, setInstanceLoading] = React.useState(true)
  const listeners = React.useRef(new Set<(event: MessageEvent) => void>())

  const upsertConversation = React.useCallback((conversation: WhatsAppConversation) => {
    setConversations((list) => [conversation, ...list.filter((c) => c.id !== conversation.id)].sort(byActivity))
  }, [])

  const patchConversation = React.useCallback((id: string, patch: Partial<WhatsAppConversation>) => {
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort(byActivity))
  }, [])

  const reload = React.useCallback(async () => {
    try {
      const [list, tagList] = await Promise.all([fetchConversations(), fetchTags()])
      setConversations(list.sort(byActivity))
      setTags(tagList)
      setStatus("ready")
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === "PGRST205" || code === "42P01") {
        setStatus("missing-schema")
        return
      }
      console.error("[atendimento] Falha ao carregar conversas:", error)
      setStatus("error")
    }
  }, [])

  const reloadInstance = React.useCallback(async () => {
    setInstanceLoading(true)
    try {
      setInstance(await whatsappApi.instance())
    } catch (error) {
      console.error("[atendimento] Falha ao consultar a conexão:", error)
      setInstance(null)
    } finally {
      setInstanceLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // Carga inicial de sistemas externos (Supabase e Z-API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
    reloadInstance()
  }, [reload, reloadInstance])

  // Recarrega uma conversa inteira (com contato e tags) quando o banco avisa que mudou.
  const pending = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const refreshConversation = React.useCallback(
    (id: string) => {
      const timers = pending.current
      clearTimeout(timers.get(id))
      timers.set(
        id,
        setTimeout(async () => {
          timers.delete(id)
          const fresh = await fetchConversation(id)
          if (fresh) upsertConversation(fresh)
          else setConversations((list) => list.filter((c) => c.id !== id))
        }, 120),
      )
    },
    [upsertConversation],
  )

  React.useEffect(() => {
    const supabase = getSupabase()
    const filter = `organization_id=eq.${organization.id}`
    const channel = supabase
      .channel(`whatsapp:${organization.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter }, (payload) => {
        const row = (payload.new && "id" in payload.new ? payload.new : payload.old) as { id?: string }
        if (row?.id) refreshConversation(row.id)
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_contacts", filter }, (payload) => {
        const contact = toContact(payload.new as ContactRow)
        setConversations((list) => list.map((c) => (c.contact.id === contact.id ? { ...c, contact } : c)))
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_tags", filter }, () => {
        fetchTags().then(setTags).catch(() => {})
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_instances", filter }, (payload) => {
        const next = toInstance(payload.new as InstanceRow)
        setInstance((info) =>
          info ? { ...info, instance: next, live: info.live ? { ...info.live, connected: next.status === "connected" } : info.live } : info,
        )
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages", filter }, (payload) => {
        if (payload.eventType === "DELETE") return
        listeners.current.forEach((listener) => listener({ kind: "message", row: payload.new as MessageRow }))
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_message_attachments", filter }, (payload) => {
        if (payload.eventType === "DELETE") return
        listeners.current.forEach((listener) => listener({ kind: "attachment", row: payload.new as AttachmentRow }))
      })
      .subscribe((state) => {
        // Ao reconectar, o que chegou no intervalo vem pela recarga.
        if (state === "SUBSCRIBED") reload()
      })

    const onFocus = () => reload()
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      supabase.removeChannel(channel)
    }
  }, [organization.id, refreshConversation, reload])

  const subscribeMessages = React.useCallback((listener: (event: MessageEvent) => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const value = React.useMemo<Inbox>(
    () => ({
      status,
      conversations,
      tags,
      instance,
      instanceLoading,
      reloadInstance,
      reload,
      upsertConversation,
      patchConversation,
      setTags,
      subscribeMessages,
    }),
    [status, conversations, tags, instance, instanceLoading, reloadInstance, reload, upsertConversation, patchConversation, subscribeMessages],
  )

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

export function useInbox() {
  const ctx = React.useContext(InboxContext)
  if (!ctx) throw new Error("useInbox deve ser usado dentro de InboxProvider")
  return ctx
}
