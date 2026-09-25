"use client"

import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarPlus,
  Copy,
  FilePlus,
  Hourglass,
  ListChecks,
  Plus,
  Scale,
  UserRound,
  Activity as ActivityGlyph,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge, Tag } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/motion"
import { DocumentList } from "@/components/shared/document-list"
import { TaskRow } from "@/components/tasks/task-row"
import { ProcessPartiesPanel, ProcessSummaryPanel, ProcessSyncPanel } from "./process-source-panel"
import { ProcessTimeline } from "./process-timeline"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { PROCESS_STATUS } from "@/lib/config"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { getNow, diffInDays, fmtDayLabel, fmtDayMonth, fmtDueIn, fmtNumericDate, fmtTime, parse } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import { getUser } from "@/lib/account"
import { interpretMovements } from "@/lib/services/processes/movement-interpreter"

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-medium text-foreground sm:text-right">{children}</dd>
    </div>
  )
}

export function ProcessProfile({ id }: { id: string }) {
  const data = useDemoData()
  const { openDialog } = useUI()
  const lookup = useCategoryLookup()
  const ready = data.hydrated
  const process = data.processes.find((p) => p.id === id)

  if (!process && data.hydrated) {
    return (
      <Panel className="mt-4">
        <EmptyState
          icon={<Scale />}
          title="Processo não encontrado."
          description="Verifique o número informado ou volte para a lista de processos."
          action={
            <Link href="/processos" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Voltar para processos
            </Link>
          }
        />
      </Panel>
    )
  }

  // Enquanto os processos salvos no navegador carregam, mostra o esqueleto.
  if (!ready || !process) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando processo">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-[420px] max-w-full" />
          <Skeleton className="h-4 w-60" />
        </div>
        <SkeletonStats />
        <div className="grid gap-5 lg:grid-cols-12">
          <SkeletonCard className="lg:col-span-7" lines={5} />
          <SkeletonCard className="lg:col-span-5" lines={4} />
        </div>
      </div>
    )
  }

  const client = data.clients.find((c) => c.id === process.clientId)
  const owner = getUser(process.ownerId)
  const status = PROCESS_STATUS[process.status]
  const tasks = data.tasks
    .filter((t) => t.related?.type === "process" && t.related.id === process.id)
    .sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === "pendente" ? -1 : 1))
  const documents = data.documents.filter((d) => d.processId === process.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const appointments = data.appointments
    .filter((a) => a.processId === process.id && parse(a.end) > getNow())
    .sort((a, b) => a.start.localeCompare(b.start))
  const deadlineDiff = process.nextDeadline ? diffInDays(parse(process.nextDeadline.date), getNow()) : undefined
  const lastMovement = process.movements[0]
  // Memoizado por identidade do array dentro do interpretador.
  const movements = interpretMovements(process.movements, process.id)

  return (
    <div className="space-y-6">
      <FadeIn>
        <Link
          href="/processos"
          className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline md:hidden"
        >
          <ArrowLeft className="size-3.5" /> Processos
        </Link>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-dark">Processo {process.code}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="break-all font-mono text-[22px] font-medium tracking-[-0.02em] text-foreground sm:text-[28px]">{process.number}</h1>
              <button
                type="button"
                aria-label="Copiar número do processo"
                onClick={() => {
                  navigator.clipboard?.writeText(process.number).catch(() => {})
                  toast.success("Número copiado.", { description: process.number })
                }}
                className="flex size-8 items-center justify-center rounded-[8px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <p className="mt-2 font-serif text-[20px] leading-snug text-foreground sm:text-[22px]">{process.type}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              {client && (
                <Link href={`/clientes/${client.id}`} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
                  <Tag icon={<UserRound />} className="hover:border-border-strong hover:text-foreground">
                    {client.name}
                  </Tag>
                </Link>
              )}
              <Tag>{process.area}</Tag>
              {process.tribunal && <Tag>{process.tribunal}</Tag>}
              <Tag>{process.judicialUnit ?? process.court}</Tag>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openDialog("appointment", { processId: process.id, clientId: process.clientId })}>
              <CalendarPlus /> Compromisso
            </Button>
            <Button variant="secondary" onClick={() => openDialog("document", { processId: process.id, clientId: process.clientId })}>
              <FilePlus /> Documento
            </Button>
            <Button onClick={() => openDialog("task", { processId: process.id })}>
              <ListChecks /> Nova tarefa
            </Button>
          </div>
        </div>
      </FadeIn>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          className={cn(
            "col-span-2 rounded-[14px] border p-4 shadow-card sm:col-span-1",
            deadlineDiff !== undefined && deadlineDiff <= 3 ? "border-danger/25 bg-danger-soft/50" : "border-border bg-card",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted-foreground">Próximo prazo</span>
            <Hourglass className={cn("size-4", deadlineDiff !== undefined && deadlineDiff <= 3 ? "text-danger" : "text-subtle")} />
          </div>
          {process.nextDeadline && process.status !== "concluido" ? (
            <>
              <p
                className={cn(
                  "tabular mt-2.5 text-[22px] font-semibold leading-none tracking-[-0.025em]",
                  deadlineDiff !== undefined && deadlineDiff <= 3 && "text-danger",
                )}
              >
                {fmtDayMonth(process.nextDeadline.date)}
              </p>
              <p className="mt-2 truncate text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{fmtDueIn(process.nextDeadline.date)}</span> · {process.nextDeadline.title}
              </p>
            </>
          ) : (
            <p className="mt-2.5 text-[15px] font-medium text-subtle">Sem prazos</p>
          )}
        </div>
        <div className="rounded-[14px] border border-border bg-card p-4 shadow-card">
          <span className="text-[12px] font-medium text-muted-foreground">Responsável</span>
          <div className="mt-2.5 flex items-center gap-2.5">
            <UserAvatar name={owner.name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{owner.name}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">{owner.oab ?? owner.role}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[14px] border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted-foreground">Última movimentação</span>
            <ActivityGlyph className="size-4 text-subtle" />
          </div>
          <p className="mt-2.5 text-[22px] font-semibold leading-none tracking-[-0.025em]">{fmtDayLabel(process.lastMovementAt)}</p>
          <p className="mt-2 truncate text-[12px] text-muted-foreground">{lastMovement?.title}</p>
        </div>
        <div className="col-span-2 rounded-[14px] border border-border bg-card p-4 shadow-card sm:col-span-1 lg:col-span-1">
          <span className="text-[12px] font-medium text-muted-foreground">Valor da causa</span>
          <p className="tabular mt-2.5 truncate text-[22px] font-semibold leading-none tracking-[-0.025em]">{formatCurrency(process.claimValue)}</p>
          <p className="mt-2 truncate text-[12px] text-muted-foreground">Distribuído em {fmtNumericDate(process.distributedAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-7">
          <PanelHeader
            title="Movimentações"
            description={`${process.movements.length} registros · atualizado ${fmtDayLabel(process.lastMovementAt).toLowerCase()}, ${fmtTime(process.lastMovementAt)}`}
          />
          <div className="px-5 pt-2 pb-6 sm:px-6">
            <ProcessTimeline movements={movements} />
          </div>
        </Panel>

        <div className="space-y-5 lg:col-span-5">
          <ProcessSyncPanel process={process} />
          <ProcessSummaryPanel process={process} />

          <Panel>
            <PanelHeader
              title="Tarefas do processo"
              description={`${tasks.filter((t) => t.status === "pendente").length} pendentes`}
              action={
                <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" onClick={() => openDialog("task", { processId: process.id })}>
                  <Plus />
                </Button>
              }
            />
            {tasks.length ? (
              <ul className="px-3 pb-3">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} showAssignee />
                ))}
              </ul>
            ) : (
              <EmptyState compact title="Nenhuma tarefa vinculada." description="Crie tarefas para não perder nenhum prazo." />
            )}
          </Panel>

          {appointments.length > 0 && (
            <Panel>
              <PanelHeader title="Agenda do processo" />
              <ul className="px-3 pb-3">
                {appointments.map((a) => {
                  const { category, style } = lookup(a.categoryId)
                  return (
                    <li key={a.id} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5">
                      <span className="h-9 w-[3px] shrink-0 rounded-full" style={style.dot} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{a.title}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {category ? `${category.name} · ` : ""}
                          {fmtDayLabel(a.start)}, {fmtTime(a.start)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}

          <ProcessPartiesPanel process={process} />

          <Panel>
            <PanelHeader title="Detalhes" />
            <dl className="divide-y divide-border px-5 pb-3">
              <Detail label="Juízo">{process.court}</Detail>
              <Detail label="Comarca">{process.district}</Detail>
              <Detail label="Parte contrária">{process.opposingParty}</Detail>
              <Detail label="Área">{process.area}</Detail>
              {client && (
                <Detail label="Cliente">
                  <Link href={`/clientes/${client.id}`} className="inline-flex items-center gap-1 hover:underline">
                    {client.name} <ArrowUpRight className="size-3.5 text-subtle" />
                  </Link>
                </Detail>
              )}
            </dl>
          </Panel>

          <Panel>
            <PanelHeader
              title="Documentos"
              description={`${documents.length} arquivos`}
              action={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Adicionar documento"
                  onClick={() => openDialog("document", { processId: process.id, clientId: process.clientId })}
                >
                  <Plus />
                </Button>
              }
            />
            {documents.length ? (
              <div className="border-t border-border">
                <DocumentList documents={documents} />
              </div>
            ) : (
              <EmptyState compact title="Nenhum documento anexado." />
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
