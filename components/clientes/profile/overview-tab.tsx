"use client"

import Link from "next/link"
import { cn } from "cn"
import { CalendarDays, ChevronRight, Copy, Hourglass, IdCard, Mail, MapPin, MessageSquare, Phone, Plus, Scale, UserRound, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MiniStat } from "@/components/shared/mini-stat"
import { ActivityIcon } from "@/components/shared/activity-icon"
import { TaskRow } from "@/components/tasks/task-row"
import { useDemoData } from "@/lib/store/demo-store"
import { StatusBadge } from "@/components/ui/status-badge"
import { PROCESS_STATUS } from "@/lib/config"
import { useUI } from "@/lib/store/ui-store"
import { clientFinance } from "@/lib/selectors"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { getNow, diffInDays, fmtActivityTime, fmtDayLabel, fmtDayMonth, fmtDueIn, fmtLongDate, fmtRelative, fmtTime, parse } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import type { Activity, Client } from "@/types"
import { Can } from "@/lib/auth/session"

function InfoRow({ icon, label, value, copy }: { icon: React.ReactNode; label: string; value: string; copy?: boolean }) {
  return (
    <div className="group flex items-start gap-3 py-3">
      <span className="mt-0.5 text-subtle [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-[13.5px] break-words text-foreground">{value}</p>
      </div>
      {copy && (
        <button
          type="button"
          aria-label={`Copiar ${label.toLowerCase()}`}
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {})
            toast.success(`${label} copiado.`)
          }}
          className="flex size-7 items-center justify-center rounded-[7px] text-subtle opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gold/40 group-hover:opacity-100 max-md:opacity-100"
        >
          <Copy className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function OverviewTab({ client, activities, onSeeTimeline }: { client: Client; activities: Activity[]; onSeeTimeline: () => void }) {
  const data = useDemoData()
  const { openDialog } = useUI()
  const lookup = useCategoryLookup()
  const processes = data.processes.filter((p) => p.clientId === client.id)
  const active = processes.filter((p) => p.status !== "concluido")
  const nextDeadline = active.filter((p) => p.nextDeadline).sort((a, b) => a.nextDeadline!.date.localeCompare(b.nextDeadline!.date))[0]
  const finance = clientFinance(data, client.id)
  const processIds = new Set(processes.map((p) => p.id))
  const tasks = data.tasks
    .filter((t) => (t.related?.type === "client" && t.related.id === client.id) || (t.related?.type === "process" && processIds.has(t.related.id)))
    .sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === "pendente" ? -1 : 1))
    .slice(0, 5)
  const upcoming = data.appointments
    .filter((a) => a.clientId === client.id && parse(a.end) > getNow())
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4)
  const lastActivity = activities[0]

  const lastLabel = lastActivity ? fmtDayLabel(lastActivity.at) : "—"

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Processos ativos" value={String(active.length).padStart(2, "0")} hint={`${processes.length} no total`} icon={<Scale />} />
        <MiniStat
          label="Próximo prazo"
          value={nextDeadline ? fmtDayMonth(nextDeadline.nextDeadline!.date) : "—"}
          hint={nextDeadline ? `${fmtDueIn(nextDeadline.nextDeadline!.date)} · ${nextDeadline.nextDeadline!.title}` : "Nenhum prazo em aberto"}
          icon={<Hourglass />}
          tone={nextDeadline && fmtDueIn(nextDeadline.nextDeadline!.date).match(/hoje|amanhã|em [1-3] dias/) ? "danger" : undefined}
        />
        <MiniStat
          label="Honorários em aberto"
          value={formatCurrency(finance.open)}
          hint={
            finance.overdue ? (
              <span className="text-danger">{formatCurrency(finance.overdue)} em atraso</span>
            ) : (
              `de ${formatCurrency(finance.contracted)} contratados`
            )
          }
          icon={<Wallet />}
        />
        <MiniStat
          label="Última interação"
          value={lastLabel === "Hoje" || lastLabel === "Ontem" ? lastLabel : lastActivity ? fmtRelative(lastActivity.at) : "—"}
          hint={lastActivity ? `${lastActivity.actor ?? ""} ${lastActivity.message}`.trim() : undefined}
          icon={<MessageSquare />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5 max-lg:order-last">
          <Panel>
            <PanelHeader title="Informações" description={client.kind === "PJ" ? "Dados cadastrais da empresa" : "Dados cadastrais do cliente"} />
            <div className="divide-y divide-border px-5 pb-2">
              <InfoRow icon={<Phone />} label="Telefone" value={client.phone} copy />
              <InfoRow icon={<Mail />} label="E-mail" value={client.email} copy />
              <InfoRow icon={<IdCard />} label={client.kind === "PJ" ? "CNPJ" : "CPF"} value={client.document} copy />
              <InfoRow icon={<MapPin />} label="Endereço" value={client.address} />
              {client.birthDate && <InfoRow icon={<CalendarDays />} label="Data de nascimento" value={fmtLongDate(client.birthDate)} />}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Contato principal" />
            <div className="px-5 pb-5">
              {client.contact ? (
                <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-muted/40 p-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground ring-1 ring-border">
                    <UserRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{client.contact.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {client.contact.relation} · {client.contact.phone}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-muted/40 p-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground ring-1 ring-border">
                    <UserRound className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">{client.name}</p>
                    <p className="text-[12px] text-muted-foreground">O próprio cliente · {client.phone}</p>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-5 lg:col-span-7">
          <Panel>
            <PanelHeader
              title="Processos"
              description={processes.length ? `${active.length} ativo${active.length === 1 ? "" : "s"} de ${processes.length}` : undefined}
              action={
                <Can permission="processes.edit">
                  <Button variant="ghost" size="icon-sm" aria-label="Novo processo" onClick={() => openDialog("process", { clientId: client.id })}>
                    <Plus />
                  </Button>
                </Can>
              }
            />
            {processes.length ? (
              <ul className="px-3 pb-3">
                {[...active, ...processes.filter((p) => p.status === "concluido")].slice(0, 5).map((p) => {
                  const status = PROCESS_STATUS[p.status]
                  const due = p.status !== "concluido" && p.nextDeadline ? diffInDays(parse(p.nextDeadline.date), getNow()) : undefined
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/processos/${p.id}`}
                        className="group flex items-center gap-3 rounded-[10px] px-2 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium text-foreground">{p.type}</span>
                            <StatusBadge tone={status.tone} size="sm">
                              {status.label}
                            </StatusBadge>
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                            <span className="font-mono">{p.code}</span>
                            {p.lastMovementAt && <> · movimentação {fmtRelative(p.lastMovementAt)}</>}
                          </span>
                        </span>
                        {due !== undefined && (
                          <span className={cn("shrink-0 text-right text-[12px]", due <= 3 ? "font-medium text-danger" : "text-muted-foreground")}>
                            Prazo {fmtDueIn(p.nextDeadline!.date)}
                          </span>
                        )}
                        <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                title="Nenhum processo deste cliente."
                description="Consulte pelo número CNJ: a LEXA passa a acompanhar prazos e movimentações."
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Atividade recente"
              action={
                <button
                  type="button"
                  onClick={onSeeTimeline}
                  className="rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
                >
                  Ver timeline
                </button>
              }
            />
            {activities.length === 0 && (
              <p className="px-5 pb-5 text-[13px] text-muted-foreground">
                Cadastros, tarefas, documentos e movimentações deste cliente aparecem aqui.
              </p>
            )}
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
          </Panel>
          <Panel>
            <PanelHeader
              title="Próximos compromissos"
              action={
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
              }
            />
            {upcoming.length ? (
              <ul className="px-3 pb-3">
                {upcoming.map((a) => {
                  const { category, style } = lookup(a.categoryId)
                  return (
                    <li key={a.id}>
                      <Link
                        href={a.processId ? `/processos/${a.processId}` : "/agenda"}
                        className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 outline-none hover:bg-accent/60 focus-visible:bg-accent"
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
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                title="Nenhum compromisso agendado."
                description="Consultas, reuniões e audiências com este cliente aparecem aqui."
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Tarefas"
              action={
                <Can permission="tasks.edit">
                  <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" onClick={() => openDialog("task", { clientId: client.id })}>
                    <Plus />
                  </Button>
                </Can>
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
        </div>
      </div>
    </div>
  )
}
