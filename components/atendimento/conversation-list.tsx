"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { DatabaseZap, MessageSquarePlus, MessagesSquare, SearchX, StickyNote } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { SearchField } from "@/components/ui/search-field"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDemoData } from "@/lib/store/demo-store"
import { Can, useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/account"
import { diffInDays, fmtShortDate, fmtTime, getNow, parse, weekdayShort } from "@/lib/dates"
import { matches } from "@/lib/format"
import { statusOption } from "@/lib/whatsapp/config"
import { formatPhone } from "@/lib/whatsapp/phone"
import type { WhatsAppConversation } from "@/types"
import { useInbox } from "./inbox-provider"
import { ContactAvatar, contactName, ConversationStatusBadge, DeliveryStatus, TagChip } from "./parts"
import { ConnectionBadge } from "./connection"

export type InboxFilter = "all" | "unread" | "mine" | "unassigned" | "waiting" | "resolved"

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "Não lidas" },
  { value: "mine", label: "Minhas" },
  { value: "unassigned", label: "Sem responsável" },
  { value: "waiting", label: "Aguardando cliente" },
  { value: "resolved", label: "Resolvidas" },
]

function passes(filter: InboxFilter, c: WhatsAppConversation, me: string) {
  const category = statusOption(c.status).category
  switch (filter) {
    case "all":
      return true
    case "unread":
      return c.unreadCount > 0
    case "mine":
      return c.assignedUserId === me
    case "unassigned":
      return !c.assignedUserId
    case "waiting":
      return category === "waiting_client"
    case "resolved":
      return category === "resolved"
  }
}

/** 14:32 · Ontem · Seg · 12/09 */
function listTime(iso?: string) {
  if (!iso) return ""
  const days = diffInDays(getNow(), parse(iso))
  if (days <= 0) return fmtTime(iso)
  if (days === 1) return "Ontem"
  if (days < 7) {
    const label = weekdayShort(parse(iso).getDay())
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return fmtShortDate(iso)
}

export function ConversationList({
  selectedId,
  onSelect,
  onNew,
  filter,
  onFilterChange,
}: {
  selectedId?: string
  onSelect: (id: string) => void
  onNew: () => void
  filter: InboxFilter
  onFilterChange: (filter: InboxFilter) => void
}) {
  const { conversations, tags, status, reload } = useInbox()
  const { user } = useSession()
  const { clients } = useDemoData()
  const [query, setQuery] = React.useState("")

  const tagById = React.useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const clientById = React.useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  const searched = React.useMemo(
    () =>
      conversations.filter((c) => {
        const client = c.contact.clientId ? clientById.get(c.contact.clientId) : undefined
        return matches(
          query,
          contactName(c.contact, client),
          c.contact.pushName,
          c.contact.phone,
          formatPhone(c.contact.phone),
          c.lastMessagePreview,
          ...c.tagIds.map((id) => tagById.get(id)?.name),
        )
      }),
    [conversations, query, clientById, tagById],
  )

  const counts = React.useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, searched.filter((c) => passes(f.value, c, user.id)).length])) as Record<InboxFilter, number>,
    [searched, user.id],
  )
  const visible = searched.filter((c) => passes(filter, c, user.id))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-serif text-[24px] leading-none tracking-[-0.01em] text-foreground">Conversas</h1>
            <ConnectionBadge className="mt-1.5" />
          </div>
          <Can permission="whatsapp.edit">
            <Tooltip>
              <TooltipTrigger render={<Button variant="secondary" size="icon-sm" aria-label="Nova conversa" onClick={onNew} />}>
                <MessageSquarePlus />
              </TooltipTrigger>
              <TooltipContent>Nova conversa</TooltipContent>
            </Tooltip>
          </Can>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Buscar nome, telefone ou tag" className="mt-3.5" />
        <div role="tablist" aria-label="Filtrar conversas" className="-mx-1 mt-3 flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = f.value === filter
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(f.value)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {f.label}
                {counts[f.value] > 0 && (
                  <span className={cn("tabular text-[11px]", active ? "text-background/70" : "text-subtle")}>{counts[f.value]}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border thin-scrollbar">
        {status === "loading" ? (
          <ul aria-busy="true" aria-label="Carregando conversas">
            {Array.from({ length: 7 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-2.5 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : status === "missing-schema" ? (
          <EmptyState
            compact
            icon={<DatabaseZap />}
            title="Banco ainda não preparado."
            description="Rode supabase/migrations/0002_whatsapp.sql no SQL Editor do Supabase para ativar a Central de Atendimento."
          />
        ) : status === "error" ? (
          <ErrorState title="Não conseguimos carregar as conversas." onRetry={reload} className="py-12" />
        ) : visible.length === 0 ? (
          conversations.length === 0 ? (
            <EmptyState
              compact
              icon={<MessagesSquare />}
              title="Nenhuma conversa ainda."
              description="Quando um cliente escrever para o WhatsApp do escritório, a conversa aparece aqui na hora."
            />
          ) : (
            <EmptyState compact icon={<SearchX />} title="Nada por aqui." description="Nenhuma conversa corresponde à busca ou ao filtro." />
          )
        ) : (
          <ul className="py-1">
            <AnimatePresence initial={false}>
              {visible.map((c) => (
                <motion.li key={c.id} layout="position" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                  <ConversationItem
                    conversation={c}
                    selected={c.id === selectedId}
                    onSelect={() => onSelect(c.id)}
                    clientName={c.contact.clientId ? clientById.get(c.contact.clientId)?.name : undefined}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function ConversationItem({
  conversation: c,
  selected,
  onSelect,
  clientName,
}: {
  conversation: WhatsAppConversation
  selected: boolean
  onSelect: () => void
  clientName?: string
}) {
  const { tags } = useInbox()
  const { clients } = useDemoData()
  const client = clientName ? clients.find((x) => x.id === c.contact.clientId) : undefined
  const name = contactName(c.contact, client)
  const unread = c.unreadCount > 0
  const conversationTags = c.tagIds.map((id) => tags.find((t) => t.id === id)).filter((t) => !!t)
  const assignee = c.assignedUserId ? getUser(c.assignedUserId) : undefined

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:bg-accent",
        selected ? "bg-surface-muted/80" : "hover:bg-accent/60",
      )}
    >
      {selected && <motion.span layoutId="conversation-active" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gold" />}
      <span className="relative">
        <ContactAvatar contact={c.contact} client={client} size="lg" />
        {!c.contact.clientId && (
          <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-info px-1 text-[8.5px] leading-[14px] font-semibold text-white ring-2 ring-card">
            novo
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[13.5px]", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>{name}</span>
          <span className={cn("tabular shrink-0 text-[11.5px]", unread ? "font-semibold text-gold-dark" : "text-subtle")}>{listTime(c.lastMessageAt ?? c.createdAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {c.lastMessageDirection === "outbound" && <DeliveryStatus status={c.lastMessageStatus} className="text-subtle" />}
          {c.lastMessageDirection === "internal" && <StickyNote className="size-3.5 shrink-0 text-gold" />}
          <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", unread ? "text-foreground" : "text-muted-foreground")}>
            {c.lastMessagePreview ?? "Conversa iniciada"}
          </span>
          {unread && (
            <span className="tabular flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-gold px-1 text-[10.5px] font-semibold text-white">
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </span>
        <span className="mt-1.5 flex min-w-0 items-center gap-1">
          <ConversationStatusBadge status={c.status} size="sm" />
          {conversationTags.slice(0, 2).map((t) => (
            <TagChip key={t.id} tag={t} className="max-w-[88px]" />
          ))}
          {conversationTags.length > 2 && <span className="text-[11px] text-subtle">+{conversationTags.length - 2}</span>}
          <span className="ml-auto shrink-0">
            {assignee ? (
              <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="xs" />
            ) : (
              <span className="text-[11px] text-subtle">sem responsável</span>
            )}
          </span>
        </span>
      </span>
    </button>
  )
}
