"use client"

import Link from "next/link"
import {
  CalendarDays,
  Copy,
  Hourglass,
  IdCard,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Scale,
  StickyNote,
  Tags,
  UserRound,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MiniStat } from "@/components/shared/mini-stat"
import { ActivityIcon } from "@/components/shared/activity-icon"
import { TaskRow } from "@/components/tasks/task-row"
import { useUI } from "@/lib/store/ui-store"
import { clientFinance, nextClientDeadline, type ClientHub } from "@/lib/selectors"
import { useCategoryLookup } from "@/components/agenda/use-category"
import {
  getNow,
  diffInDays,
  fmtActivityTime,
  fmtDayLabel,
  fmtDayMonth,
  fmtDueIn,
  fmtLongDate,
  fmtNumericDate,
  fmtRelative,
  fmtTime,
  parse,
} from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import { getUser } from "@/lib/account"
import { whatsappLink, whatsappNumber } from "@/lib/clients"
import { maskPhone } from "@/lib/masks"
import type { Client, WhatsAppConversation } from "@/types"
import { Can, useSession } from "@/lib/auth/session"
import type { ProfileTab } from "./client-profile"

function InfoRow({
  icon,
  label,
  value,
  copy,
  action,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  copy?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="group flex items-start gap-3 py-3">
      <span className="mt-0.5 text-subtle [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 text-[13.5px] break-words", value ? "text-foreground" : "text-subtle")}>{value || "Não informado"}</p>
      </div>
      {action}
      {copy && value && (
        <button
          type="button"
          aria-label={`Copiar ${label.toLowerCase()}`}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => toast.success(`${label} copiado.`),
              () => toast.error("Não foi possível copiar."),
            )
          }}
          className="flex size-7 items-center justify-center rounded-[7px] text-subtle opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gold/40 group-hover:opacity-100 max-md:opacity-100"
        >
          <Copy className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Card de número que leva para a seção correspondente. */
function StatLink({ onClick, href, label, children }: { onClick?: () => void; href?: string; label: string; children: React.ReactNode }) {
  const cls =
    "block min-w-0 rounded-[14px] text-left outline-none transition-transform focus-visible:ring-2 focus-visible:ring-gold/40 hover:[&>div]:border-border-strong"
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        {children}
      </Link>
    )
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  )
}

export function OverviewTab({
  client,
  hub,
  finance,
  onNavigate,
}: {
  client: Client
  hub: ClientHub
  /** Faturas do cliente — ausente para quem não vê o financeiro. */
  finance?: ReturnType<typeof clientFinance>
  onNavigate: (tab: ProfileTab) => void
}) {
  const { openDialog } = useUI()
  const { can } = useSession()
  const lookup = useCategoryLookup()
  const { processes, activeProcesses, activities } = hub
  const nextDeadline = nextClientDeadline(processes)
  const deadlineDays = nextDeadline ? diffInDays(parse(nextDeadline.nextDeadline!.date), getNow()) : undefined
  const tasks = hub.tasks.slice(0, 5)
  const pendingTasks = hub.tasks.filter((t) => t.status === "pendente").length
  const upcoming = hub.appointments.filter((a) => parse(a.end) > getNow()).slice(0, 4)
  const lastActivity = activities[0]
  const lastLabel = lastActivity ? fmtDayLabel(lastActivity.at) : "—"
  const owner = getUser(client.ownerId)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatLink label="Ver processos do cliente" onClick={() => onNavigate("processos")}>
          <MiniStat
            label="Processos ativos"
            value={String(activeProcesses.length).padStart(2, "0")}
            hint={`${processes.length} no total`}
            icon={<Scale />}
          />
        </StatLink>
        {nextDeadline ? (
          <StatLink label={`Abrir processo ${nextDeadline.code}`} href={`/processos/${nextDeadline.id}`}>
            <MiniStat
              label="Próximo prazo"
              value={fmtDayMonth(nextDeadline.nextDeadline!.date)}
              hint={`${fmtDueIn(nextDeadline.nextDeadline!.date)} · ${nextDeadline.nextDeadline!.title}`}
              icon={<Hourglass />}
              tone={deadlineDays !== undefined && deadlineDays <= 3 ? "danger" : undefined}
            />
          </StatLink>
        ) : (
          <MiniStat label="Próximo prazo" value="—" hint="Nenhum prazo em aberto" icon={<Hourglass />} />
        )}
        {finance ? (
          <StatLink label="Ver financeiro do cliente" onClick={() => onNavigate("financeiro")}>
            <MiniStat
              label="Honorários em aberto"
              value={formatCurrency(finance.open)}
              hint={
                finance.overdue ? (
                  <span className="text-danger">{formatCurrency(finance.overdue)} em atraso</span>
                ) : finance.contracted ? (
                  `de ${formatCurrency(finance.contracted)} contratados`
                ) : (
                  "Nenhum lançamento"
                )
              }
              icon={<Wallet />}
            />
          </StatLink>
        ) : (
          <MiniStat label="Honorários em aberto" value="—" hint="Sem acesso ao financeiro" icon={<Wallet />} />
        )}
        <StatLink label="Ver timeline do cliente" onClick={() => onNavigate("timeline")}>
          <MiniStat
            label="Última interação"
            value={lastLabel === "Hoje" || lastLabel === "Ontem" ? lastLabel : lastActivity ? fmtRelative(lastActivity.at) : "—"}
            hint={lastActivity ? `${lastActivity.actor ?? ""} ${lastActivity.message}`.trim() : "Nenhuma atividade registrada"}
            icon={<MessageSquare />}
          />
        </StatLink>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          <Panel>
            <PanelHeader title="Informações" description={client.kind === "PJ" ? "Dados cadastrais da empresa" : "Dados cadastrais do cliente"} />
            <div className="divide-y divide-border px-5 pb-2">
              <InfoRow icon={<Phone />} label="Telefone" value={client.phone} copy />
              <InfoRow
                icon={<MessageCircle />}
                label="WhatsApp"
                value={whatsappNumber(client) ? maskPhone(whatsappNumber(client)) : undefined}
                copy
              />
              <InfoRow icon={<Mail />} label="E-mail" value={client.email} copy />
              <InfoRow icon={<IdCard />} label={client.kind === "PJ" ? "CNPJ" : "CPF"} value={client.document} copy />
              <InfoRow icon={<MapPin />} label="Endereço" value={client.address === "Endereço a completar" ? "" : client.address} copy />
              <InfoRow
                icon={<CalendarDays />}
                label={client.kind === "PJ" ? "Data de fundação" : "Data de nascimento"}
                value={client.birthDate ? fmtLongDate(client.birthDate) : undefined}
              />
              <InfoRow
                icon={<UserRound />}
                label="Tipo · Área · Responsável"
                value={`${client.kind === "PJ" ? "Pessoa jurídica" : "Pessoa física"} · ${client.area} · ${owner.name}`}
              />
              {!!client.tags?.length && <InfoRow icon={<Tags />} label="Tags" value={client.tags.join(", ")} />}
              {client.notes && <InfoRow icon={<StickyNote />} label="Observações" value={client.notes} />}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Contato principal" />
            <div className="px-5 pb-5">
              <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-muted/40 p-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground ring-1 ring-border">
                  <UserRound className="size-4" />
                </span>
                {client.contact ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{client.contact.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {[client.contact.relation, client.contact.phone, client.contact.email].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ) : client.kind === "PJ" ? (
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">Nenhum representante cadastrado</p>
                    <p className="text-[12px] text-muted-foreground">Informe quem fala pela empresa em “Editar”.</p>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{client.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">O próprio cliente{client.phone ? ` · ${client.phone}` : ""}</p>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <WhatsAppPanel client={client} />
        </div>

        <div className="space-y-5 lg:col-span-7">
          {can("agenda.view") && (
            <Panel>
              <PanelHeader
                title="Próximos compromissos"
                action={
                  <>
                    {hub.appointments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onNavigate("compromissos")}
                        className="rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
                      >
                        Ver todos
                      </button>
                    )}
                    <Can permission="agenda.edit">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Novo compromisso"
                        onClick={() => openDialog("appointment", { clientId: client.id })}
                      >
                        <Plus />
                      </Button>
                    </Can>
                  </>
                }
              />
              {upcoming.length ? (
                <ul className="px-3 pb-3">
                  {upcoming.map((a) => {
                    const { category, style } = lookup(a.categoryId)
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => onNavigate("compromissos")}
                          className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent"
                        >
                          <span className="flex w-12 shrink-0 flex-col items-center rounded-[8px] border border-border bg-surface py-1">
                            <span className="text-[10px] font-semibold tracking-[0.1em] text-gold-dark">{fmtDayMonth(a.start).split(" ")[1]}</span>
                            <span className="tabular text-[16px] font-semibold leading-tight">{fmtDayMonth(a.start).split(" ")[0]}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium">{a.title}</span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                              <span className="size-1.5 rounded-full" style={style.dot} />
                              {category ? `${category.name} · ` : ""}
                              {fmtDayLabel(a.start)}, {fmtTime(a.start)}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState compact title="Nenhum compromisso agendado." description="Agende uma consulta ou reunião com o cliente." />
              )}
            </Panel>
          )}

          {can("tasks.view") && (
            <Panel>
              <PanelHeader
                title="Tarefas"
                description={pendingTasks ? `${pendingTasks} pendente${pendingTasks > 1 ? "s" : ""}` : undefined}
                action={
                  <>
                    {hub.tasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onNavigate("tarefas")}
                        className="rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
                      >
                        Ver todas
                      </button>
                    )}
                    <Can permission="tasks.edit">
                      <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" onClick={() => openDialog("task", { clientId: client.id })}>
                        <Plus />
                      </Button>
                    </Can>
                  </>
                }
              />
              {tasks.length ? (
                <ul className="px-3 pb-3">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} showAssignee />
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="Nenhuma tarefa vinculada." description="Crie tarefas para organizar o atendimento deste cliente." />
              )}
            </Panel>
          )}

          <Panel>
            <PanelHeader
              title="Atividade recente"
              action={
                activities.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate("timeline")}
                    className="rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
                  >
                    Ver timeline
                  </button>
                )
              }
            />
            {activities.length ? (
              <ul className="px-5 pb-4">
                {activities.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-2">
                    <ActivityIcon type={a.type} />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[13px] leading-snug">
                        {a.actor && <span className="font-semibold">{a.actor} </span>}
                        {a.message}
                      </p>
                      {a.detail && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{a.detail}</p>}
                    </div>
                    <span className="tabular shrink-0 pt-0.5 text-[11.5px] text-subtle">{fmtActivityTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                title="Nenhuma atividade registrada."
                description="Processos, tarefas, documentos e pagamentos do cliente aparecem aqui."
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

/**
 * WhatsApp do cliente. Sem integração ativa, só abre a conversa pelo wa.me; quando
 * houver (Z-API ou outra), a conversa vinculada entra por `conversation`.
 */
function WhatsAppPanel({ client, conversation }: { client: Client; conversation?: WhatsAppConversation }) {
  const link = whatsappLink(client)
  const number = whatsappNumber(client)
  return (
    <Panel>
      <PanelHeader title="WhatsApp" description={number ? maskPhone(number) : "Nenhum celular cadastrado"} icon={<MessageCircle />} />
      <div className="space-y-3 px-5 pb-5">
        {conversation?.lastMessagePreview ? (
          <div className="rounded-[12px] border border-border bg-surface-muted/40 p-3.5">
            <p className="text-[11.5px] text-muted-foreground">
              Última mensagem{conversation.lastMessageAt ? ` · ${fmtNumericDate(conversation.lastMessageAt)}` : ""}
            </p>
            <p className="mt-1 line-clamp-2 text-[13px]">{conversation.lastMessagePreview}</p>
          </div>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            O histórico de conversas aparecerá aqui quando a integração com o WhatsApp for ativada.
          </p>
        )}
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}>
            <MessageCircle /> Abrir conversa
          </a>
        ) : (
          <p className="text-[12px] text-subtle">Cadastre um celular ou WhatsApp para abrir a conversa.</p>
        )}
      </div>
    </Panel>
  )
}
