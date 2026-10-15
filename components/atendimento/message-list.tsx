"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { ArrowDown, Copy, Lock, Pencil, Reply, RotateCw, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { getUser } from "@/lib/auth/account"
import { fmtDayLabel, fmtTime, isSameDay, parse } from "@/lib/core/dates"
import { normalize } from "@/lib/core/format"
import { TYPE_PREVIEW } from "@/lib/whatsapp/config"
import type { WhatsAppMessage } from "@/types"
import { AttachmentView } from "./attachment"
import { DeliveryStatus } from "./parts"
import { publicMessage } from "@/lib/core/public-error"

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
          out.push(part.slice(from, at), <mark key={`${i}-${at}`} className="rounded-[3px] bg-brand/35 px-px text-inherit">{part.slice(at, at + q.length)}</mark>)
          from = at + q.length
        }
        out.push(part.slice(from))
        return <React.Fragment key={i}>{out}</React.Fragment>
      })}
    </>
  )
}

/** Cores dos balões: o enviado leva um tom da cor da Íntegra; o recebido é o cartão branco. */
const OUT_BG = "bg-[color-mix(in_srgb,var(--brand)_17%,var(--card))]"
const OUT_TAIL = "bg-[color-mix(in_srgb,var(--brand)_17%,var(--card))]"
const BUBBLE_SHADOW = "shadow-[0_1px_1px_rgb(0_0_0/0.13)]"

function Quote({ message, onJump, outgoing }: { message?: WhatsAppMessage; onJump: (id: string) => void; outgoing: boolean }) {
  if (!message) return null
  return (
    <button
      type="button"
      onClick={() => onJump(message.id)}
      className="mb-1 block w-full overflow-hidden rounded-[6px] border-l-[4px] border-brand bg-black/[0.06] px-2.5 py-1.5 text-left outline-none hover:bg-black/[0.09] focus-visible:ring-2 focus-visible:ring-brand/40 dark:bg-white/[0.07]"
    >
      <span className="block text-[12.5px] font-semibold text-brand-strong">
        {message.direction === "inbound" ? "Cliente" : outgoing ? "Você" : "Escritório"}
      </span>
      <span className="line-clamp-2 text-[13px] text-muted-foreground">{message.body || TYPE_PREVIEW[message.type]}</span>
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
        <span className="max-w-[80%] rounded-[8px] bg-card/95 px-3 py-1 text-center text-[12.5px] text-muted-foreground shadow-[0_1px_1px_rgb(0_0_0/0.1)]">
          {message.body} · <span className="tabular">{fmtTime(message.sentAt)}</span>
        </span>
      </div>
    )
  }

  const inbound = message.direction === "inbound"
  const note = message.type === "note"
  const author = message.sentByUserId ? getUser(message.sentByUserId) : undefined
  const canReply = !note && !!message.providerMessageId
  const hasMedia = message.attachments.length > 0
  const media = message.attachments.find((a) => a.kind === "image" || a.kind === "sticker" || a.kind === "video")
  // Cauda do balão só no primeiro de uma sequência, como no WhatsApp.
  const tail = showSender && !note

  return (
    <div className={cn("group/message flex flex-col", inbound ? "items-start" : "items-end")}>
      <div className={cn("flex max-w-[min(80%,540px)] items-end gap-1.5", inbound ? "flex-row" : "flex-row-reverse")}>
        <motion.div
          id={`msg-${message.id}`}
          initial={false}
          animate={highlighted ? { scale: [1, 1.015, 1] } : {}}
          className={cn(
            "relative min-w-0 rounded-[8px] px-2.5 pt-1.5 pb-1 text-[14.2px] leading-[1.4] text-foreground transition-shadow",
            BUBBLE_SHADOW,
            inbound && "bg-card",
            !inbound && !note && OUT_BG,
            note && "border border-dashed border-brand/45 bg-brand-soft shadow-none",
            tail && (inbound ? "rounded-tl-none" : "rounded-tr-none"),
            message.status === "failed" && "ring-1 ring-danger/40",
            highlighted && "ring-2 ring-brand/60",
            media && !message.body && "p-1",
          )}
        >
          {tail && (
            <span
              aria-hidden
              className={cn(
                "absolute top-0 h-[13px] w-[9px]",
                inbound ? "-left-[8px] bg-card [clip-path:polygon(100%_0,0_0,100%_100%)]" : cn("-right-[8px]", OUT_TAIL, "[clip-path:polygon(0_0,100%_0,0_100%)]"),
              )}
            />
          )}
          {!inbound && showSender && (
            <span className="mb-0.5 flex items-center gap-1 text-[12.5px] font-semibold text-brand-strong">
              {note && <Lock className="size-3" />}
              {note ? `Nota interna · ${author?.firstName ?? "Equipe"}` : message.fromDevice ? "Enviada pelo celular" : (author?.firstName ?? "Escritório")}
            </span>
          )}
          {replied && <Quote message={replied} onJump={onJump} outgoing={!inbound} />}
          {hasMedia && (
            <div className={cn("space-y-1.5", message.body && "mb-1.5")}>
              {message.attachments.map((a) => (
                <AttachmentView key={a.id} attachment={a} clientId={clientId} tone="light" />
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
              "float-right mt-1 ml-3 flex translate-y-[3px] items-center gap-1 text-[11px] leading-none text-subtle",
              media && !message.body && "absolute right-2.5 bottom-2 m-0 rounded-full bg-black/40 px-1.5 py-1 text-white/90",
            )}
          >
            {message.editedAt && <Pencil className="size-2.5" aria-label="Editada" />}
            {message.fromDevice && <Smartphone className="size-2.5" aria-label="Enviada pelo celular" />}
            <span className="tabular">{fmtTime(message.sentAt)}</span>
            {!inbound && !note && <DeliveryStatus status={message.status} className="size-4" />}
          </span>
        </motion.div>

        <div className="mb-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          {canReply && (
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label="Responder esta mensagem"
              className="touch-target relative flex size-7 items-center justify-center rounded-full bg-card/90 text-subtle shadow-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
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
              className="touch-target relative flex size-7 items-center justify-center rounded-full bg-card/90 text-subtle shadow-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 max-md:hidden"
            >
              <Copy className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {message.status === "failed" && (
        <div className="mt-1 flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11.5px] leading-snug text-danger">
          <span className="min-w-0 max-w-[320px]">Não enviada{failureReason(message.error)}</span>
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
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-3 thin-scrollbar sm:px-[7%]" role="log" aria-live="polite" aria-label="Mensagens">
        {hasMore && <p className="pb-3 text-center text-[11.5px] text-subtle">{loadingOlder ? "Carregando mensagens anteriores…" : "Role para ver mensagens anteriores"}</p>}
        {!messages.length && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <UserAvatar name={contactName} src={contactAvatar} size="xl" />
            <p className="text-[13.5px] font-medium">Conversa com {contactName}</p>
            <p className="max-w-xs text-[12.5px] text-muted-foreground">Nenhuma mensagem ainda. Escreva abaixo para iniciar o atendimento.</p>
          </div>
        )}
        <div className="mx-auto flex max-w-[900px] flex-col gap-[3px]">
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
                  <div className="sticky top-0 z-[1] flex justify-center py-2.5">
                    <span className="rounded-[8px] bg-card px-3 py-1 text-[12.5px] font-medium uppercase text-muted-foreground shadow-[0_1px_1px_rgb(0_0_0/0.13)]">
                      {fmtDayLabel(m.sentAt)}
                    </span>
                  </div>
                )}
                <div className={cn(!sameSide && i > 0 && !newDay && "mt-2")}>
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
          className="absolute right-5 bottom-4 size-10 rounded-full bg-card shadow-float"
        >
          <ArrowDown />
        </Button>
      )}
    </div>
  )
}

/** Motivo da falha ao lado de "Não enviada" — só se for uma mensagem clara (registros antigos podiam ter detalhe técnico). */
function failureReason(error: string | undefined | null) {
  const reason = publicMessage(error, "")
  return reason ? ` · ${reason}` : ""
}
