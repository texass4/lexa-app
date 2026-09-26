"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Ellipsis,
  FilePlus2,
  Info,
  ListPlus,
  Scale,
  Search,
  Sparkles,
  UserRound,
  UserRoundCheck,
  X,
  Tags,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/account"
import { normalize } from "@/lib/format"
import { SYSTEM_STATUSES, STATUS_TONE, statusOption } from "@/lib/whatsapp/config"
import { attachmentKindFor } from "@/lib/whatsapp/files"
import { formatPhone } from "@/lib/whatsapp/phone"
import { uploadOutgoing, whatsappApi } from "@/lib/whatsapp/client"
import type { WhatsAppConversation, WhatsAppMessage } from "@/types"
import { useInbox } from "./inbox-provider"
import { useMessages } from "./use-messages"
import { MessageList } from "./message-list"
import { Composer, type ComposerSubmit } from "./composer"
import { ConnectionNotice, useConnectionHealth } from "./connection"
import { ContactAvatar, contactName, useContactClient } from "./parts"

const TONE_DOT: Record<string, string> = {
  info: "bg-info",
  gold: "bg-gold",
  warning: "bg-warning",
  success: "bg-success",
}

function StatusMenu({ conversation, onChanged, disabled }: { conversation: WhatsAppConversation; onChanged: (c: WhatsAppConversation) => void; disabled: boolean }) {
  const option = statusOption(conversation.status)
  const change = async (status: string) => {
    if (status === conversation.status) return
    try {
      onChanged(await whatsappApi.update(conversation.id, { status }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status.")
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2 text-[12px] font-medium text-foreground shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40 disabled:cursor-default disabled:hover:border-border"
      >
        <span className={cn("size-1.5 rounded-full", TONE_DOT[STATUS_TONE[option.category]])} />
        {option.label}
        {!disabled && <ChevronDown className="size-3 text-subtle" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 rounded-[10px] p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status do atendimento</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={conversation.status} onValueChange={(v) => change(String(v))}>
            {SYSTEM_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s.key} value={s.key} className="h-8 px-2">
                <span className={cn("size-1.5 rounded-full", TONE_DOT[STATUS_TONE[s.category]])} />
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function HeaderIcon({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} onClick={onClick} className={cn(active && "bg-accent text-foreground")} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ConversationView({
  conversation,
  onBack,
  onAssign,
  onShowContext,
  onShowAi,
  panel,
}: {
  conversation: WhatsAppConversation
  onBack: () => void
  onAssign: () => void
  onShowContext: () => void
  onShowAi: () => void
  panel: "context" | "ai" | null
}) {
  const { upsertConversation, patchConversation } = useInbox()
  const { can, user, organization } = useSession()
  const { processes } = useDemoData()
  const { openDialog } = useUI()
  const router = useRouter()
  const health = useConnectionHealth()
  const client = useContactClient(conversation.contact)
  const name = contactName(conversation.contact, client)
  const { messages, loading, error, hasMore, loadOlder, put, remove } = useMessages(conversation.id)
  const [replyTo, setReplyTo] = React.useState<WhatsAppMessage>()
  const [searching, setSearching] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [hit, setHit] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [dropped, setDropped] = React.useState<File>()
  const assignee = conversation.assignedUserId ? getUser(conversation.assignedUserId) : undefined
  const clientProcesses = client ? processes.filter((p) => p.clientId === client.id) : []
  const canEdit = can("whatsapp.edit")

  // Ao abrir (ou chegar mensagem nova com a conversa aberta), marca como lida.
  React.useEffect(() => {
    if (!conversation.unreadCount || document.visibilityState !== "visible") return
    patchConversation(conversation.id, { unreadCount: 0 })
    whatsappApi.update(conversation.id, { read: true }).catch(() => {})
  }, [conversation.id, conversation.unreadCount, patchConversation])

  // Troca de conversa: limpa estado local da anterior.
  const [shownId, setShownId] = React.useState(conversation.id)
  if (shownId !== conversation.id) {
    setShownId(conversation.id)
    setReplyTo(undefined)
    setSearching(false)
    setQuery("")
  }

  const hits = React.useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return []
    return messages.filter((m) => m.body && normalize(m.body).includes(q)).map((m) => m.id)
  }, [messages, query])
  const focusId = hits.length ? hits[Math.min(hit, hits.length - 1)] : undefined

  const submit = async ({ mode, text, file, durationSeconds }: ComposerSubmit) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const base = { id, organizationId: organization.id, conversationId: conversation.id, sentAt: now, sentByUserId: user.id, fromDevice: false }

    if (mode === "note") {
      put({ ...base, direction: "internal", type: "note", body: text, status: "sent", attachments: [] })
      try {
        put(await whatsappApi.send(conversation.id, { id, type: "note", text }))
        return true
      } catch (err) {
        remove(id)
        toast.error(err instanceof Error ? err.message : "Não foi possível salvar a nota.")
        return false
      }
    }

    const type = file ? attachmentKindFor(file.type) : "text"
    const localUrl = file ? URL.createObjectURL(file) : undefined
    put({
      ...base,
      direction: "outbound",
      type,
      body: text || undefined,
      status: "pending",
      replyToMessageId: replyTo?.id,
      attachments: file
        ? [
            {
              id: `local-${id}`,
              messageId: id,
              kind: type as "image" | "audio" | "document",
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              remoteUrl: localUrl,
              durationSeconds,
              voiceNote: type === "audio",
              downloadStatus: "stored",
            },
          ]
        : [],
    })
    const quoted = replyTo
    setReplyTo(undefined)
    try {
      const storagePath = file ? await uploadOutgoing(organization.id, file, file.name) : undefined
      const sent = await whatsappApi.send(conversation.id, {
        id,
        type,
        text: text || undefined,
        replyToId: quoted?.id,
        attachment: file && storagePath ? { storagePath, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, durationSeconds } : undefined,
      })
      put(sent)
      if (sent.status === "failed") toast.error("A mensagem não foi enviada.", { description: sent.error })
      return true
    } catch (err) {
      remove(id)
      setReplyTo(quoted)
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar.")
      return false
    } finally {
      if (localUrl) setTimeout(() => URL.revokeObjectURL(localUrl), 60_000)
    }
  }

  const retry = async (message: WhatsAppMessage) => {
    put({ ...message, status: "pending", error: undefined })
    try {
      const sent = await whatsappApi.retry(message.id)
      put(sent)
      if (sent.status === "failed") toast.error("Ainda não foi possível enviar.", { description: sent.error })
    } catch (err) {
      put(message)
      toast.error(err instanceof Error ? err.message : "Não foi possível reenviar.")
    }
  }

  const replyBlocked = health === "unconfigured" ? "WhatsApp não configurado" : health === "disconnected" ? "WhatsApp desconectado" : health === "error" ? "Z-API indisponível" : undefined

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!canEdit) return
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) setDropped(file)
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon-sm" aria-label="Voltar para as conversas" onClick={onBack} className="md:hidden">
          <ChevronLeft />
        </Button>
        <button type="button" onClick={onShowContext} className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
          <ContactAvatar contact={conversation.contact} client={client} size="lg" />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{name}</span>
              {client ? (
                <span className="hidden shrink-0 rounded-[5px] bg-success-soft px-1.5 py-px text-[10.5px] font-medium text-success sm:inline">Cliente</span>
              ) : (
                <span className="hidden shrink-0 rounded-[5px] bg-info-soft px-1.5 py-px text-[10.5px] font-medium text-info sm:inline">Contato novo</span>
              )}
            </span>
            <span className="tabular block truncate text-[12px] text-muted-foreground">{formatPhone(conversation.contact.phone)}</span>
          </span>
        </button>

        <div className="hidden items-center gap-2 lg:flex">
          <StatusMenu conversation={conversation} onChanged={upsertConversation} disabled={!canEdit} />
          <button
            type="button"
            onClick={onAssign}
            className="inline-flex h-7 items-center gap-1.5 rounded-[8px] border border-border bg-surface pr-2 pl-1 text-[12px] font-medium shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            {assignee ? <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="xs" /> : <UserRoundCheck className="ml-1 size-3.5 text-subtle" />}
            <span className="max-w-[110px] truncate">{assignee ? assignee.firstName : "Atribuir"}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderIcon label="Buscar na conversa" onClick={() => setSearching((s) => !s)} active={searching}>
            <Search />
          </HeaderIcon>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Lexa IA"
                  aria-pressed={panel === "ai"}
                  onClick={onShowAi}
                  className={cn("gap-1.5 px-2 text-gold-dark hover:text-gold-dark", panel === "ai" && "bg-gold-soft")}
                />
              }
            >
              <Sparkles /> <span className="hidden sm:inline">Lexa IA</span>
            </TooltipTrigger>
            <TooltipContent>Resumir, sugerir resposta, identificar tarefas</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Ações rápidas"
              className="flex size-8 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent aria-expanded:text-foreground"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-[10px] p-1">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
                <DropdownMenuItem className="h-8 px-2" disabled={!client || !can("clients.view")} onClick={() => client && router.push(`/clientes/${client.id}`)}>
                  <UserRound /> Abrir cliente
                </DropdownMenuItem>
                {clientProcesses.length > 1 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="h-8 px-2">
                      <Scale /> Abrir processo
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64 rounded-[10px] p-1">
                      {clientProcesses.map((p) => (
                        <DropdownMenuItem key={p.id} className="h-8 px-2" onClick={() => router.push(`/processos/${p.id}`)}>
                          <span className="tabular truncate">{p.number || p.code}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem
                    className="h-8 px-2"
                    disabled={!clientProcesses.length}
                    onClick={() => clientProcesses[0] && router.push(`/processos/${clientProcesses[0].id}`)}
                  >
                    <Scale /> Abrir processo
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="h-8 px-2" disabled={!can("tasks.edit")} onClick={() => openDialog("task", { clientId: client?.id })}>
                  <ListPlus /> Criar tarefa
                </DropdownMenuItem>
                <DropdownMenuItem className="h-8 px-2" disabled={!can("agenda.edit")} onClick={() => openDialog("appointment", { clientId: client?.id })}>
                  <CalendarPlus /> Criar compromisso
                </DropdownMenuItem>
                <DropdownMenuItem className="h-8 px-2" disabled={!can("documents.edit")} onClick={() => openDialog("document", { clientId: client?.id })}>
                  <FilePlus2 /> Adicionar documento
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="h-8 px-2" onClick={onAssign}>
                  <UserRoundCheck /> Alterar responsável
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 px-2" disabled={!canEdit}>
                    <Tags /> Alterar status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48 rounded-[10px] p-1">
                    <DropdownMenuRadioGroup
                      value={conversation.status}
                      onValueChange={async (value) => {
                        try {
                          upsertConversation(await whatsappApi.update(conversation.id, { status: String(value) }))
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Não foi possível alterar o status.")
                        }
                      }}
                    >
                      {SYSTEM_STATUSES.map((s) => (
                        <DropdownMenuRadioItem key={s.key} value={s.key} className="h-8 px-2">
                          {s.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem className="h-8 px-2" onClick={onShowContext}>
                  <Info /> Ver informações do contato
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Status e responsável no mobile/tablet */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
        <StatusMenu conversation={conversation} onChanged={upsertConversation} disabled={!canEdit} />
        <button type="button" onClick={onAssign} className="inline-flex h-7 items-center gap-1.5 rounded-[8px] border border-border bg-surface pr-2 pl-1 text-[12px] font-medium outline-none">
          {assignee ? <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="xs" /> : <UserRoundCheck className="ml-1 size-3.5 text-subtle" />}
          {assignee ? assignee.firstName : "Atribuir"}
        </button>
      </div>

      {searching && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted/40 px-4 py-2">
          <Search className="size-4 shrink-0 text-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHit(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits.length) setHit((h) => (e.shiftKey ? (h - 1 + hits.length) % hits.length : (h + 1) % hits.length))
              if (e.key === "Escape") setSearching(false)
            }}
            placeholder="Buscar nesta conversa"
            aria-label="Buscar nesta conversa"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
          />
          <span className="tabular shrink-0 text-[12px] text-muted-foreground">{query.trim() ? (hits.length ? `${Math.min(hit, hits.length - 1) + 1} de ${hits.length}` : "Nenhum resultado") : ""}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Resultado anterior" disabled={!hits.length} onClick={() => setHit((h) => (h - 1 + hits.length) % hits.length)}>
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Próximo resultado" disabled={!hits.length} onClick={() => setHit((h) => (h + 1) % hits.length)}>
            <ChevronDown />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Fechar busca" onClick={() => setSearching(false)}>
            <X />
          </Button>
        </div>
      )}

      <ConnectionNotice />

      <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--border-strong)_45%,transparent)_1px,transparent_0)] [background-size:22px_22px]">
        <MessageList
          messages={messages}
          loading={loading}
          error={error}
          hasMore={hasMore}
          onLoadOlder={loadOlder}
          query={searching ? query : undefined}
          focusId={searching ? focusId : undefined}
          clientId={client?.id}
          contactName={name}
          contactAvatar={conversation.contact.avatarUrl}
          onReply={setReplyTo}
          onRetry={retry}
        />
      </div>

      <Composer
        conversationId={conversation.id}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(undefined)}
        onSubmit={submit}
        canSend={canEdit}
        canReply={!replyBlocked}
        replyDisabledReason={replyBlocked ? `${replyBlocked} — só notas internas.` : undefined}
        droppedFile={dropped}
        onDroppedFileHandled={() => setDropped(undefined)}
      />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-gold/60 bg-gold-soft/80 text-gold-dark backdrop-blur-[2px]">
          <Upload className="size-6" />
          <p className="text-[13.5px] font-medium">Solte para anexar à mensagem</p>
        </div>
      )}
    </div>
  )
}

export function EmptyConversation() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 -m-6 rounded-full bg-gold-soft/80 blur-2xl" aria-hidden />
        <div className="relative flex size-16 items-center justify-center rounded-[18px] border border-border bg-surface shadow-card">
          <svg viewBox="0 0 24 24" className="size-7 text-gold" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
            <path d="M8.5 8.5h7M8.5 11.5h4.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <h2 className="font-serif text-[26px] leading-tight tracking-[-0.01em]">Central de atendimento</h2>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
        Escolha uma conversa para responder, registrar notas internas e ver processos, tarefas e documentos do cliente — tudo no mesmo lugar.
      </p>
      <Link href="/clientes" className="mt-5 text-[12.5px] font-medium text-gold-dark underline-offset-4 hover:underline">
        Ver clientes do escritório
      </Link>
    </div>
  )
}
