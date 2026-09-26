"use client"

import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react"
import { cn } from "cn"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { categoryStyle } from "@/lib/config"
import { useDemoData } from "@/lib/store/demo-store"
import { formatPhone } from "@/lib/whatsapp/phone"
import { STATUS_TONE, statusOption } from "@/lib/whatsapp/config"
import type { Client, MessageStatus, WhatsAppContact, WhatsAppTag } from "@/types"

/** Nome a exibir: o do cliente vinculado, o dado pelo escritório, o do perfil ou o telefone. */
export function contactName(contact: WhatsAppContact, client?: Client) {
  return client?.name || contact.name || contact.pushName || formatPhone(contact.phone)
}

export function useContactClient(contact?: WhatsAppContact) {
  const { clients } = useDemoData()
  return contact?.clientId ? clients.find((c) => c.id === contact.clientId) : undefined
}

export function ContactAvatar({
  contact,
  client,
  size = "md",
  className,
}: {
  contact: WhatsAppContact
  client?: Client
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}) {
  return <UserAvatar name={contactName(contact, client)} src={contact.avatarUrl} size={size} className={className} />
}

export function ConversationStatusBadge({ status, size }: { status: string; size?: "sm" | "default" }) {
  const option = statusOption(status)
  return (
    <StatusBadge tone={STATUS_TONE[option.category]} size={size}>
      {option.label}
    </StatusBadge>
  )
}

/** Envio → entrega → leitura, discreto como o resto do LEXA. */
export function DeliveryStatus({ status, className }: { status?: MessageStatus; className?: string }) {
  if (!status || status === "received") return null
  const cls = cn("size-3.5 shrink-0", className)
  switch (status) {
    case "pending":
      return <Clock3 className={cn(cls, "opacity-70")} aria-label="Enviando" />
    case "sent":
      return <Check className={cls} aria-label="Enviada" />
    case "delivered":
      return <CheckCheck className={cls} aria-label="Entregue" />
    case "read":
    case "played":
      return <CheckCheck className={cn(cls, "text-info")} aria-label={status === "played" ? "Ouvida" : "Lida"} />
    case "failed":
      return <AlertCircle className={cn(cls, "text-danger")} aria-label="Falhou" />
  }
}

export function TagChip({ tag, onRemove, className }: { tag: WhatsAppTag; onRemove?: () => void; className?: string }) {
  const style = categoryStyle(tag.color)
  return (
    <span
      className={cn("inline-flex h-[20px] max-w-full shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[11px] font-medium", className)}
      style={{ ...style.soft, ...style.text }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={style.dot} />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover a tag ${tag.name}`}
          className="-mr-0.5 ml-0.5 flex size-3.5 items-center justify-center rounded-[4px] opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          ×
        </button>
      )}
    </span>
  )
}

/** Duração de áudio: 0:42 */
export function fmtDuration(seconds?: number) {
  if (!seconds || seconds < 0) return "0:00"
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
