"use client"

import Link from "next/link"
import { ArrowLeft, Ellipsis, FilePlus, ListChecks, Pencil, Phone, Trash2 } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBadge, Tag } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SourceIcon } from "@/components/clientes/source-icon"
import { CLIENT_STATUS } from "@/lib/config"
import { fmtLongDate } from "@/lib/dates"
import { getUser } from "@/lib/account"
import { useUI } from "@/lib/store/ui-store"
import type { Client } from "@/types"
import { Can } from "@/lib/auth/session"

const STATUS_LONG: Record<Client["status"], string> = {
  ativo: "Cliente ativo",
  novo: "Novo cliente",
  inativo: "Cliente inativo",
  inadimplente: "Inadimplente",
}

export function ClientHeader({ client, onEdit, onDelete }: { client: Client; onEdit: () => void; onDelete: () => void }) {
  const { openDialog } = useUI()
  const owner = getUser(client.ownerId)
  const status = CLIENT_STATUS[client.status]

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
              </div>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                Cliente desde {fmtLongDate(client.clientSince)}
                {client.profession && <span className="max-sm:hidden"> · {client.profession}</span>}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                <Tag>{client.area}</Tag>
                <Tag icon={<UserAvatar name={owner.name} size="xs" className="!size-3.5 text-[7px]" />}>{owner.name}</Tag>
                {client.source && <Tag icon={<SourceIcon source={client.source} />}>Origem: {client.source}</Tag>}
                <Tag>{client.kind === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</Tag>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Can permission="clients.edit">
              <Button variant="secondary" onClick={onEdit}>
                <Pencil /> Editar
              </Button>
            </Can>
            <a
              href={`tel:${client.phone.replace(/\D/g, "")}`}
              aria-label={`Ligar para ${client.name}`}
              className={cn(buttonVariants({ variant: "secondary", size: "icon" }), "sm:hidden")}
            >
              <Phone />
            </a>
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
            <Can permission="clients.edit">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Mais ações" className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-[10px] p-1">
                  <DropdownMenuGroup>
                    <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={onDelete}>
                      <Trash2 /> Excluir cliente
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          </div>
        </div>
      </div>
    </div>
  )
}
