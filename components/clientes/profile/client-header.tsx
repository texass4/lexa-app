"use client"

import Link from "next/link"
import {
  ArrowLeft,
  CalendarPlus,
  CircleDollarSign,
  Download,
  Ellipsis,
  FilePlus,
  ListChecks,
  MessageCircle,
  Pencil,
  Phone,
  Power,
  Scale,
  Trash2,
} from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBadge, Tag } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SourceIcon } from "@/components/clientes/source-icon"
import { CLIENT_STATUS } from "@/lib/config"
import { fmtLongDate } from "@/lib/dates"
import { getUser } from "@/lib/account"
import { whatsappLink } from "@/lib/clients"
import { DIALOG_PERMISSION, useUI, type DialogKind } from "@/lib/store/ui-store"
import type { Client } from "@/types"
import { Can, useSession } from "@/lib/auth/session"

const STATUS_LONG: Record<Client["status"], string> = {
  ativo: "Cliente ativo",
  novo: "Novo cliente",
  inativo: "Cliente inativo",
  inadimplente: "Inadimplente",
}

const CREATE: { kind: DialogKind; label: string; icon: React.ElementType }[] = [
  { kind: "process", label: "Novo processo", icon: Scale },
  { kind: "appointment", label: "Novo compromisso", icon: CalendarPlus },
  { kind: "invoice", label: "Novo lançamento", icon: CircleDollarSign },
]

export function ClientHeader({
  client,
  delinquent,
  onEdit,
  onToggleActive,
  onExport,
  onDelete,
}: {
  client: Client
  /** Há parcela vencida no financeiro (mesmo sem o status "inadimplente"). */
  delinquent: boolean
  onEdit: () => void
  onToggleActive: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const { openDialog } = useUI()
  const { can } = useSession()
  const owner = getUser(client.ownerId)
  const status = CLIENT_STATUS[client.status]
  const whatsapp = whatsappLink(client)
  const phone = client.phone.replace(/\D/g, "")
  const create = CREATE.filter((item) => can(DIALOG_PERMISSION[item.kind]))

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-border bg-card shadow-card">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--gold)_10%,transparent),transparent_60%)]"
      />
      <div className="relative p-5 sm:p-7">
        <Link
          href="/clientes"
          className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline md:hidden"
        >
          <ArrowLeft className="size-3.5" /> Clientes
        </Link>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            <UserAvatar
              name={client.name}
              size="xl"
              className="ring-4 ring-surface shadow-[0_1px_2px_rgb(0_0_0/0.06)] max-sm:size-14 max-sm:text-base"
            />
            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-serif text-[28px] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[36px]">{client.name}</h1>
                <StatusBadge tone={status.tone}>{STATUS_LONG[client.status]}</StatusBadge>
                {delinquent && client.status !== "inadimplente" && (
                  <StatusBadge tone="danger" dot={false}>
                    Parcelas em atraso
                  </StatusBadge>
                )}
              </div>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                Cliente desde {fmtLongDate(client.clientSince)}
                {client.profession && <span className="max-sm:hidden"> · {client.profession}</span>}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                <Tag>{client.kind === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</Tag>
                <Tag>{client.area}</Tag>
                <Tag icon={<UserAvatar name={owner.name} size="xs" className="!size-3.5 text-[7px]" />}>{owner.name}</Tag>
                {client.source && <Tag icon={<SourceIcon source={client.source} />}>Origem: {client.source}</Tag>}
                {client.tags?.map((tag) => (
                  <Tag key={tag} className="border-gold/25 bg-gold-soft/50 text-gold-dark">
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-nowrap">
            <Can permission="clients.edit">
              <Button variant="secondary" onClick={onEdit}>
                <Pencil /> Editar
              </Button>
            </Can>
            {phone && (
              <a
                href={`tel:${phone}`}
                aria-label={`Ligar para ${client.name}`}
                className={cn(buttonVariants({ variant: "secondary", size: "icon" }), "sm:hidden")}
              >
                <Phone />
              </a>
            )}
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir WhatsApp de ${client.name}`}
                title="Abrir conversa no WhatsApp"
                className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}
              >
                <MessageCircle />
              </a>
            )}
            <Can permission="tasks.edit">
              <Button variant="secondary" onClick={() => openDialog("task", { clientId: client.id })}>
                <ListChecks /> Nova tarefa
              </Button>
            </Can>
            <Can permission="documents.edit">
              <Button onClick={() => openDialog("document", { clientId: client.id })}>
                <FilePlus /> Novo documento
              </Button>
            </Can>
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Mais ações" className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
                {create.length > 0 && (
                  <>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-2 pt-1 pb-1 text-[11px] uppercase tracking-[0.08em]">Criar para o cliente</DropdownMenuLabel>
                      {create.map((item) => (
                        <DropdownMenuItem key={item.kind} className="h-8 px-2" onClick={() => openDialog(item.kind, { clientId: client.id })}>
                          <item.icon /> {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuGroup>
                  <Can permission="clients.edit">
                    <DropdownMenuItem className="h-8 px-2" onClick={onEdit}>
                      <Pencil /> Editar cadastro
                    </DropdownMenuItem>
                    <DropdownMenuItem className="h-8 px-2" onClick={onToggleActive}>
                      <Power /> {client.status === "inativo" ? "Reativar cliente" : "Desativar cliente"}
                    </DropdownMenuItem>
                  </Can>
                  <DropdownMenuItem className="h-8 px-2" onClick={onExport}>
                    <Download /> Exportar dados
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <Can permission="clients.edit">
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={onDelete}>
                      <Trash2 /> Excluir cliente
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}
