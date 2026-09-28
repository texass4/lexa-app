"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  CalendarDays,
  Copy,
  Ellipsis,
  FolderOpen,
  IdCard,
  Link2Off,
  ListChecks,
  Mail,
  Phone,
  Plus,
  Scale,
  Tag as TagIcon,
  UserPlus,
  UserRound,
  UserRoundCheck,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Eyebrow } from "@/components/ui/panel"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FileIcon } from "@/components/shared/file-icon"
import { TaskRow } from "@/components/tasks/task-row"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { Can, useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/account"
import { CATEGORY_COLORS, categoryStyle, CLIENT_STATUS, PROCESS_STATUS } from "@/lib/config"
import { fmtDayLabel, fmtNumericDate, fmtTime, getNow, parse } from "@/lib/dates"
import { normalize } from "@/lib/format"
import { formatPhone, phoneMatchKeys } from "@/lib/whatsapp/phone"
import { whatsappApi } from "@/lib/whatsapp/client"
import type { Client, WhatsAppConversation } from "@/types"
import { useInbox } from "./inbox-provider"
import { ContactAvatar, contactName, TagChip } from "./parts"
import { ConvertToClientDialog, LinkClientDialog } from "./dialogs"

function Section({ title, icon, action, children, count }: { title: string; icon: React.ReactNode; action?: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3.5">
      <header className="mb-2 flex items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1.5 [&_svg]:size-3.5">
          {icon}
          {title}
          {count ? <span className="tabular text-subtle normal-case tracking-normal">{count}</span> : null}
        </Eyebrow>
        {action}
      </header>
      {children}
    </section>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-subtle">{children}</p>

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
      <Plus />
    </Button>
  )
}

/** Clientes cujo telefone bate com o do contato (sugestão de vínculo, sem vincular sozinho). */
function useSuggestedClient(conversation: WhatsAppConversation) {
  const { clients } = useDemoData()
  return React.useMemo(() => {
    if (conversation.contact.clientId) return undefined
    const keys = new Set(phoneMatchKeys(conversation.contact.phone))
    return clients.find((c) => {
      const digits = c.phone?.replace(/\D/g, "") ?? ""
      const national = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits
      return national && keys.has(national)
    })
  }, [clients, conversation.contact])
}

function ContactCard({ conversation, client }: { conversation: WhatsAppConversation; client?: Client }) {
  const { can } = useSession()
  const [convert, setConvert] = React.useState(false)
  const [link, setLink] = React.useState(false)
  const suggested = useSuggestedClient(conversation)
  const contact = conversation.contact
  const name = contactName(contact, client)
  const canEdit = can("whatsapp.edit")

  const unlink = async () => {
    try {
      await whatsappApi.updateContact(contact.id, { clientId: null })
      toast.success("Contato desvinculado do cliente.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desvincular.")
    }
  }

  return (
    <div className="px-4 pt-5 pb-4">
      <div className="flex items-start gap-3">
        <ContactAvatar contact={contact} client={client} size="xl" className="size-14 text-base" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(formatPhone(contact.phone)).catch(() => {})
              toast.success("Telefone copiado.")
            }}
            className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
          >
            {formatPhone(contact.phone)} <Copy className="size-3" />
          </button>
          <div className="mt-1.5">
            {client ? (
              <StatusBadge tone={CLIENT_STATUS[client.status].tone} size="sm">
                Cliente · {CLIENT_STATUS[client.status].label}
              </StatusBadge>
            ) : (
              <StatusBadge tone="info" size="sm">
                Contato novo
              </StatusBadge>
            )}
          </div>
        </div>
        {client && canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Opções do vínculo"
              className="flex size-8 items-center justify-center rounded-[8px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
              <DropdownMenuGroup>
                <DropdownMenuItem className="h-8 px-2" onClick={() => setLink(true)}>
                  <UserRoundCheck /> Vincular a outro cliente
                </DropdownMenuItem>
                <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={unlink}>
                  <Link2Off /> Desvincular
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!client && canEdit && (
        <div className="mt-4 rounded-[12px] border border-border bg-surface-muted/50 p-3">
          {suggested ? (
            <>
              <p className="text-[12.5px] text-muted-foreground">
                O telefone bate com o cadastro de <span className="font-medium text-foreground">{suggested.name}</span>.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await whatsappApi.updateContact(contact.id, { clientId: suggested.id })
                      toast.success("Conversa vinculada ao cliente.", { description: suggested.name })
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Não foi possível vincular.")
                    }
                  }}
                >
                  <UserRoundCheck /> Vincular
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLink(true)}>
                  Outro cliente
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12.5px] text-muted-foreground">Este número ainda não é de um cliente do escritório.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Can permission="clients.edit">
                  <Button size="sm" onClick={() => setConvert(true)}>
                    <UserPlus /> Transformar em cliente
                  </Button>
                </Can>
                <Button variant="secondary" size="sm" onClick={() => setLink(true)}>
                  Vincular existente
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <ConvertToClientDialog open={convert} onOpenChange={setConvert} contact={contact} />
      <LinkClientDialog open={link} onOpenChange={setLink} contact={contact} />
    </div>
  )
}

function ClientInfo({ client }: { client: Client }) {
  const owner = getUser(client.ownerId)
  const rows = [
    { icon: <IdCard />, label: client.kind === "PJ" ? "CNPJ" : "CPF", value: client.document },
    { icon: <Phone />, label: "Telefone", value: client.phone },
    { icon: <Mail />, label: "E-mail", value: client.email },
  ].filter((r) => r.value)
  return (
    <Section
      title="Cliente"
      icon={<UserRound />}
      action={
        <Link href={`/clientes/${client.id}`} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
          Abrir cadastro <ArrowUpRight className="size-3.5" />
        </Link>
      }
    >
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="text-subtle [&_svg]:size-3.5">{r.icon}</span>
            <dt className="sr-only">{r.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-foreground">{r.value}</dd>
          </div>
        ))}
        <div className="flex items-center gap-2.5 text-[12.5px]">
          <UserAvatar name={owner.name} src={owner.avatarUrl} size="xs" />
          <dt className="text-muted-foreground">Responsável</dt>
          <dd className="min-w-0 flex-1 truncate text-right text-foreground">{owner.name}</dd>
        </div>
      </dl>
    </Section>
  )
}

function Assignment({ conversation, onChangeAssignee }: { conversation: WhatsAppConversation; onChangeAssignee: () => void }) {
  const { can } = useSession()
  const assignee = conversation.assignedUserId ? getUser(conversation.assignedUserId) : undefined
  const canChange = can("whatsapp.assign") || (!assignee && can("whatsapp.edit"))
  return (
    <Section title="Responsável" icon={<UserRoundCheck />}>
      <div className="flex items-center gap-2.5">
        {assignee ? <UserAvatar name={assignee.name} src={assignee.avatarUrl} size="sm" /> : <span className="size-6 rounded-full border border-dashed border-border-strong" />}
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", assignee ? "font-medium" : "text-muted-foreground")}>{assignee?.name ?? "Sem responsável"}</span>
        {canChange && (
          <Button variant="secondary" size="xs" onClick={onChangeAssignee}>
            {assignee ? "Alterar" : "Atribuir"}
          </Button>
        )}
      </div>
    </Section>
  )
}

function Tags({ conversation, onChanged }: { conversation: WhatsAppConversation; onChanged: (c: WhatsAppConversation) => void }) {
  const { tags, setTags } = useInbox()
  const { can } = useSession()
  const [query, setQuery] = React.useState("")
  const [color, setColor] = React.useState(CATEGORY_COLORS[0].value)
  const canEdit = can("whatsapp.edit")
  const current = conversation.tagIds.map((id) => tags.find((t) => t.id === id)).filter((t) => !!t)
  const q = normalize(query.trim())
  const options = tags.filter((t) => !q || normalize(t.name).includes(q))
  const exact = tags.some((t) => normalize(t.name) === q)

  const toggle = async (tagId: string) => {
    const has = conversation.tagIds.includes(tagId)
    try {
      onChanged(await whatsappApi.update(conversation.id, has ? { removeTagIds: [tagId] } : { addTagIds: [tagId] }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a tag.")
    }
  }

  const create = async () => {
    try {
      const tag = await whatsappApi.createTag({ name: query.trim(), color })
      setTags((list) => [...list.filter((t) => t.id !== tag.id), tag].sort((a, b) => a.name.localeCompare(b.name)))
      setQuery("")
      await toggle(tag.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a tag.")
    }
  }

  return (
    <Section
      title="Tags"
      icon={<TagIcon />}
      action={
        canEdit && (
          <Popover>
            <PopoverTrigger
              aria-label="Adicionar tag"
              className="flex size-7 items-center justify-center rounded-[7px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <Plus className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 gap-2 p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value.slice(0, 40))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim() && !exact) create()
                }}
                placeholder="Buscar ou criar tag"
                className="h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-gold/50"
              />
              <ul className="max-h-48 overflow-y-auto thin-scrollbar">
                {options.map((t) => {
                  const on = conversation.tagIds.includes(t.id)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent"
                      >
                        <span className="size-2 shrink-0 rounded-full" style={categoryStyle(t.color).dot} />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        {on && <span className="text-[11px] text-gold-dark">aplicada</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {query.trim() && !exact && (
                <div className="space-y-2 border-t border-border pt-2">
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Cor da tag">
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={color === c.value}
                        aria-label={c.name}
                        onClick={() => setColor(c.value)}
                        className={cn("size-5 rounded-full outline-none ring-offset-2 ring-offset-popover focus-visible:ring-2 focus-visible:ring-gold/50", color === c.value && "ring-2 ring-foreground/40")}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <Button size="xs" className="w-full" onClick={create}>
                    Criar “{query.trim()}”
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )
      }
    >
      {current.length ? (
        <div className="flex flex-wrap gap-1.5">
          {current.map((t) => (
            <TagChip key={t.id} tag={t} onRemove={canEdit ? () => toggle(t.id) : undefined} />
          ))}
        </div>
      ) : (
        <Muted>Nenhuma tag.</Muted>
      )}
    </Section>
  )
}

export function ContextPanel({
  conversation,
  onChanged,
  onChangeAssignee,
}: {
  conversation: WhatsAppConversation
  onChanged: (c: WhatsAppConversation) => void
  onChangeAssignee: () => void
}) {
  const data = useDemoData()
  const { can } = useSession()
  const { openDialog } = useUI()
  const lookup = useCategoryLookup()
  const client = conversation.contact.clientId ? data.clients.find((c) => c.id === conversation.contact.clientId) : undefined
  const clientId = client?.id

  const processes = clientId ? data.processes.filter((p) => p.clientId === clientId) : []
  const processIds = new Set(processes.map((p) => p.id))
  const tasks = clientId
    ? data.tasks
        .filter((t) => (t.related?.type === "client" && t.related.id === clientId) || (t.related?.type === "process" && processIds.has(t.related.id)))
        .sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === "pendente" ? -1 : 1))
    : []
  const documents = clientId ? data.documents.filter((d) => d.clientId === clientId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) : []
  const upcoming = clientId
    ? data.appointments.filter((a) => a.clientId === clientId && parse(a.end) > getNow()).sort((a, b) => a.start.localeCompare(b.start))
    : []

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto thin-scrollbar">
      <ContactCard conversation={conversation} client={client} />
      {client && can("clients.view") && <ClientInfo client={client} />}
      <Assignment conversation={conversation} onChangeAssignee={onChangeAssignee} />
      <Tags conversation={conversation} onChanged={onChanged} />

      {client && can("processes.view") && (
        <Section
          title="Processos"
          icon={<Scale />}
          count={processes.length}
          action={can("processes.edit") && <AddButton label="Novo processo" onClick={() => openDialog("process", { clientId })} />}
        >
          {processes.length ? (
            <ul className="-mx-2 space-y-0.5">
              {processes.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/processos/${p.id}`}
                    className="group flex items-start gap-2.5 rounded-[9px] px-2 py-2 outline-none transition-colors hover:bg-accent/70 focus-visible:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="tabular truncate text-[12.5px] font-medium text-foreground">{p.number || p.code}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
                        <span className="truncate">{p.className ?? p.type}</span>
                        <span className="text-subtle">·</span>
                        <span className="shrink-0">{getUser(p.ownerId).firstName}</span>
                      </p>
                    </div>
                    <StatusBadge tone={PROCESS_STATUS[p.status].tone} size="sm">
                      {PROCESS_STATUS[p.status].label}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>Nenhum processo vinculado.</Muted>
          )}
        </Section>
      )}

      {client && can("tasks.view") && (
        <Section
          title="Tarefas"
          icon={<ListChecks />}
          count={tasks.filter((t) => t.status === "pendente").length}
          action={can("tasks.edit") && <AddButton label="Criar tarefa" onClick={() => openDialog("task", { clientId })} />}
        >
          {tasks.length ? (
            <ul className="-mx-2">
              {tasks.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} showAssignee />
              ))}
            </ul>
          ) : (
            <Muted>Nenhuma tarefa relacionada.</Muted>
          )}
        </Section>
      )}

      {client && can("documents.view") && (
        <Section
          title="Documentos"
          icon={<FolderOpen />}
          count={documents.length}
          action={can("documents.edit") && <AddButton label="Adicionar documento" onClick={() => openDialog("document", { clientId })} />}
        >
          {documents.length ? (
            <ul className="-mx-2 space-y-0.5">
              {documents.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => openDialog("document-preview", { documentId: d.id })}
                    className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:bg-accent"
                  >
                    <FileIcon extension={d.extension} className="h-9 w-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{d.name}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {d.kind} · {fmtNumericDate(d.uploadedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>Nenhum documento. Salve anexos da conversa pelo menu de cada arquivo.</Muted>
          )}
        </Section>
      )}

      {client && can("agenda.view") && (
        <Section
          title="Agenda"
          icon={<CalendarDays />}
          count={upcoming.length}
          action={can("agenda.edit") && <AddButton label="Novo compromisso" onClick={() => openDialog("appointment", { clientId })} />}
        >
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.slice(0, 4).map((a) => {
                const { category, style } = lookup(a.categoryId)
                return (
                  <li key={a.id} className="flex items-stretch gap-2.5">
                    <span className="w-[3px] shrink-0 rounded-full" style={style.dot} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{a.title}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {fmtDayLabel(a.start)}, {fmtTime(a.start)}
                        {category ? ` · ${category.name}` : ""}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Muted>Nenhum compromisso marcado.</Muted>
          )}
        </Section>
      )}

      {!client && (
        <div className="border-t border-border px-4 py-5">
          <Muted>Processos, tarefas, documentos e agenda aparecem aqui quando a conversa estiver vinculada a um cliente.</Muted>
        </div>
      )}
    </div>
  )
}
