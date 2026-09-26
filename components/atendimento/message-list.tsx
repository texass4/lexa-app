"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { ArrowDown, Copy, Lock, Pencil, Reply, RotateCw, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { getUser } from "@/lib/account"
import { fmtDayLabel, fmtTime, isSameDay, parse } from "@/lib/dates"
import { normalize } from "@/lib/format"
import { TYPE_PREVIEW } from "@/lib/whatsapp/config"
import type { WhatsAppMessage } from "@/types"
import { AttachmentView } from "./attachment"
import { DeliveryStatus } from "./parts"

/** Texto com os trechos buscados destacados e links clicáveis. */
function RichText({ text, query }: { text: string; query?: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  const q = query?.trim() ? normalize(query.trim()) : ""
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part))
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2 opacity-90 hover:opacity-100">
              {part}
            </a>
          )
        if (!q) return <React.Fragment key={i}>{part}</React.Fragment>
        const folded = normalize(part)
        const out: React.ReactNode[] = []
        let from = 0
        for (let at = folded.indexOf(q); at !== -1; at = folded.indexOf(q, at + q.length)) {
          out.push(part.slice(from, at), <mark key={`${i}-${at}`} className="rounded-[3px] bg-gold/35 px-px text-inherit">{part.slice(at, at + q.length)}</mark>)
          from = at + q.length
        }
        out.push(part.slice(from))
        return <React.Fragment key={i}>{out}</React.Fragment>
      })}
    </>
  )
}

function Quote({ message, onJump }: { message?: WhatsAppMessage; onJump: (id: string) => void }) {
  if (!message) return null
  return (
    <button
      type="button"
      onClick={() => onJump(message.id)}
      className="mb-1.5 block w-full rounded-[8px] border-l-2 border-gold/70 bg-black/[0.04] px-2 py-1 text-left outline-none hover:bg-black/[0.07] focus-visible:ring-2 focus-visible:ring-gold/40 dark:bg-white/[0.06]"
    >
      <span className="block text-[11px] font-semibold opacity-80">{message.direction === "inbound" ? "Cliente" : "Escritório"}</span>
      <span className="line-clamp-2 text-[12px] opacity-75">{message.body || TYPE_PREVIEW[message.type]}</span>
    </button>
  )
}

function Bubble({
  message,
  replied,
  showSender,
  query,
  highlighted,
  clientId,
  onReply,
  onRetry,
  onJump,
}: {
  message: WhatsAppMessage
  replied?: WhatsAppMessage
  showSender: boolean
  query?: string
  highlighted: boolean
  clientId?: string
  onReply: (m: WhatsAppMessage) => void
  onRetry: (m: WhatsAppMessage) => void
  onJump: (id: string) => void
}) {
  if (message.type === "event") {
    return (
      <div className="flex justify-center py-1.5">
        <span className="max-w-[80%] rounded-full bg-surface-muted/80 px-3 py-1 text-center text-[11.5px] text-muted-foreground">
          {message.body} · <span className="tabular">{fmtTime(message.sentAt)}</span>
        </span>
      </div>
    )
  }

  const inbound = message.direction === "inbound"
  const note = message.type === "note"
  const author = message.sentByUserId ? getUser(message.sentByUserId) : undefined
  const dark = !inbound && !note
  const canReply = !note && !!message.providerMessageId
  const hasMedia = message.attachments.length > 0
  const media = message.attachments.find((a) => a.kind === "image" || a.kind === "sticker" || a.kind === "video")

  return (
    <div className={cn("group/message flex flex-col", inbound ? "items-start" : "items-end")}>
      {showSender && !inbound && (
        <span className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          {note && <Lock className="size-3 text-gold" />}
          {note ? `Nota interna · ${author?.firstName ?? "Equipe"}` : message.fromDevice ? "Enviada pelo celular" : (author?.firstName ?? "Escritório")}
        </span>
      )}
      <div className={cn("flex max-w-[min(78%,560px)] items-end gap-1.5", inbound ? "flex-row" : "flex-row-reverse")}>
        <motion.div
          id={`msg-${message.id}`}
          initial={false}
          animate={highlighted ? { scale: [1, 1.015, 1] } : {}}
          className={cn(
            "relative min-w-0 rounded-[16px] px-3 py-2 text-[13.5px] leading-[1.45] shadow-xs transition-shadow",
            inbound && "rounded-bl-[5px] border border-border bg-surface text-foreground",
            dark && "rounded-br-[5px] bg-primary text-primary-foreground",
            note && "rounded-br-[5px] border border-dashed border-gold/45 bg-gold-soft text-foreground",
            message.status === "failed" && "ring-1 ring-danger/40",
            highlighted && "ring-2 ring-gold/60",
            media && !message.body && "p-1",
          )}
        >
          {replied && <Quote message={replied} onJump={onJump} />}
          {hasMedia && (
            <div className={cn("space-y-1.5", message.body && "mb-1.5")}>
              {message.attachments.map((a) => (
                <AttachmentView key={a.id} attachment={a} clientId={clientId} tone={dark ? "dark" : "light"} />
              ))}
            </div>
          )}
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">
              <RichText text={message.body} query={query} />
            </p>
          ) : (
            !hasMedia && <p className="italic opacity-70">{TYPE_PREVIEW[message.type]}</p>
          )}
          <span
            className={cn(
              "float-right mt-1 ml-3 flex translate-y-0.5 items-center gap-1 text-[10.5px] leading-none",
              dark ? "text-primary-foreground/60" : "text-subtle",
              media && !message.body && "absolute right-2.5 bottom-2 m-0 rounded-full bg-black/40 px-1.5 py-1 text-white/90",
            )}
          >
            {message.editedAt && <Pencil className="size-2.5" aria-label="Editada" />}
            {message.fromDevice && <Smartphone className="size-2.5" aria-label="Enviada pelo celular" />}
            <span className="tabular">{fmtTime(message.sentAt)}</span>
            {!inbound && !note && <DeliveryStatus status={message.status} className={cn("size-3.5", dark && message.status !== "failed" && message.status !== "read" && message.status !== "played" && "text-primary-foreground/60")} />}
          </span>
        </motion.div>

        <div className="mb-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          {canReply && (
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label="Responder esta mensagem"
              className="flex size-7 items-center justify-center rounded-[7px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <Reply className="size-3.5" />
            </button>
          )}
          {message.body && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(message.body!).catch(() => {})
                toast.success("Texto copiado.")
              }}
              aria-label="Copiar texto"
              className="flex size-7 items-center justify-center rounded-[7px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 max-md:hidden"
            >
              <Copy className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {message.status === "failed" && (
        <div className="mt-1 flex items-center gap-2 px-1 text-[11.5px] text-danger">
          <span className="max-w-[320px] truncate">Não enviada{message.error ? ` · ${message.error}` : ""}</span>
          <button type="button" onClick={() => onRetry(message)} className="inline-flex items-center gap-1 font-medium underline-offset-2 outline-none hover:underline focus-visible:underline">
            <RotateCw className="size-3" /> Tentar de novo
          </button>
        </div>
      )}
    </div>
  )
}

export function MessageList({
  messages,
  loading,
  error,
  hasMore,
  onLoadOlder,
  query,
  focusId,
  clientId,
  contactName,
  contactAvatar,
  onReply,
  onRetry,
}: {
  messages: WhatsAppMessage[]
  loading: boolean
  error: boolean
  hasMore: boolean
  onLoadOlder: () => Promise<void>
  query?: string
  /** Mensagem a destacar e trazer para a tela (resultado da busca, citação). */
  focusId?: string
  clientId?: string
  contactName: string
  contactAvatar?: string
  onReply: (m: WhatsAppMessage) => void
  onRetry: (m: WhatsAppMessage) => void
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const atBottom = React.useRef(true)
  const [showJump, setShowJump] = React.useState(false)
  const [loadingOlder, setLoadingOlder] = React.useState(false)
  const [jumped, setJumped] = React.useState<string>()
  const byId = React.useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  const byProvider = React.useMemo(() => new Map(messages.filter((m) => m.providerMessageId).map((m) => [m.providerMessageId!, m])), [messages])
  const lastId = messages.at(-1)?.id

  const scrollToBottom = React.useCallback((smooth = false) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [])

  // Nova mensagem: acompanha o fim se a pessoa já estava lá.
  React.useLayoutEffect(() => {
    if (atBottom.current) scrollToBottom()
  }, [lastId, scrollToBottom])

  const jumpTo = React.useCallback((id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    setJumped(id)
    setTimeout(() => setJumped((current) => (current === id ? undefined : current)), 1600)
  }, [])

  React.useEffect(() => {
    if (focusId) document.getElementById(`msg-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [focusId])

  const onScroll = async () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setShowJump(!atBottom.current)
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      setLoadingOlder(true)
      const before = el.scrollHeight
      await onLoadOlder()
      // Mantém a posição de leitura depois de inserir as antigas no topo.
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop += scroller.current.scrollHeight - before
        setLoadingOlder(false)
      })
    }
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-4 overflow-hidden px-6 py-6" aria-busy="true" aria-label="Carregando mensagens">
        {[60, 40, 72, 30, 55].map((w, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <Skeleton className="h-12 rounded-[16px]" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    )
  }

  if (error) return <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">Não foi possível carregar as mensagens.</div>

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4 thin-scrollbar sm:px-6" role="log" aria-live="polite" aria-label="Mensagens">
        {hasMore && <p className="pb-3 text-center text-[11.5px] text-subtle">{loadingOlder ? "Carregando mensagens anteriores…" : "Role para ver mensagens anteriores"}</p>}
        {!messages.length && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <UserAvatar name={contactName} src={contactAvatar} size="xl" />
            <p className="text-[13.5px] font-medium">Conversa com {contactName}</p>
            <p className="max-w-xs text-[12.5px] text-muted-foreground">Nenhuma mensagem ainda. Escreva abaixo para iniciar o atendimento.</p>
          </div>
        )}
        <div className="mx-auto flex max-w-[860px] flex-col gap-1">
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || !isSameDay(parse(prev.sentAt), parse(m.sentAt))
            const sameSide =
              prev &&
              !newDay &&
              prev.direction === m.direction &&
              prev.type !== "event" &&
              (prev.type === "note") === (m.type === "note") &&
              prev.sentByUserId === m.sentByUserId &&
              prev.fromDevice === m.fromDevice
            const replied = m.replyToMessageId ? byId.get(m.replyToMessageId) : m.replyToProviderId ? byProvider.get(m.replyToProviderId) : undefined
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <div className="sticky top-0 z-[1] flex justify-center py-2">
                    <span className="rounded-full border border-border bg-card/90 px-3 py-0.5 text-[11.5px] font-medium text-muted-foreground shadow-xs backdrop-blur">
                      {fmtDayLabel(m.sentAt)}
                    </span>
                  </div>
                )}
                <div className={cn(!sameSide && i > 0 && !newDay && "mt-2.5")}>
                  <Bubble
                    message={m}
                    replied={replied}
                    showSender={!sameSide}
                    query={query}
                    highlighted={m.id === focusId || m.id === jumped}
                    clientId={clientId}
                    onReply={onReply}
                    onRetry={onRetry}
                    onJump={jumpTo}
                  />
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
      {showJump && (
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label="Ir para a mensagem mais recente"
          onClick={() => scrollToBottom(true)}
          className="absolute right-5 bottom-4 rounded-full shadow-float"
        >
          <ArrowDown />
        </Button>
      )}
    </div>
  )
}
