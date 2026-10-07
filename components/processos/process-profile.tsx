"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarPlus,
  Copy,
  Ellipsis,
  FilePlus,
  Hourglass,
  ListChecks,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  UserRound,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { DocumentList } from "@/components/shared/document-list"
import { TaskRow } from "@/components/tarefas/task-row"
import { ProcessPartiesPanel, ProcessSummaryPanel, ProcessSyncPanel } from "./process-source-panel"
import { ProcessTimeline } from "./process-timeline"
import { useProcessRefresh } from "./use-process-refresh"
import { usePagedHistory, useProcessDetail } from "@/lib/store/on-demand"
import { activitiesOf, activityKey, NO_WINDOW } from "@/lib/store/history-lists"
import { LimitedList } from "@/components/ui/show-more"
import { LatestMovement } from "./latest-movement"
import { ProcessAIPanel } from "@/components/ai/process-ai-panel"
import { ProcessAIDock } from "./process-ai-dock"
import { ProcessJurisprudencePanel } from "@/components/jurisprudencia/process-jurisprudence"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useUI } from "@/lib/store/ui-store"
import { PROCESS_STATUS } from "@/lib/core/config"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { getNow, diffInDays, fmtDayLabel, fmtDayMonth, fmtDueIn, fmtNumericDate, fmtTime, parse } from "@/lib/core/dates"
import { formatCurrency } from "@/lib/core/format"
import { getUser, userTitle } from "@/lib/auth/account"
import { interpretMovements } from "@/lib/services/processos/movement-interpreter"
import { Can, useSession } from "@/lib/auth/session"
import { PRAZO_ALERT_DAYS, processSignals } from "@/lib/dashboard/attention"
import { nextPrazo } from "@/lib/prazos/prazos"
import { PrazosPanel } from "@/components/prazos/prazos-panel"
import { ActivityTimeline } from "@/components/shared/activity-timeline"

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-medium break-words text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Largura de conteúdo a partir da qual o detalhe usa duas colunas — a mesma de
 * `@4xl/main` (896 px). Abaixo disso (celular, tablet, 1024 px com a barra lateral
 * aberta) a tela é organizada em seções com abas, em vez de uma coluna sem fim.
 */
const WIDE_MIN = 896
/** Altura do topo fixo (64 px no celular): as abas grudam logo abaixo dele. */
const STICKY_OFFSET = 64

type Section = "movimentacoes" | "prazos" | "documentos" | "jurisprudencia" | "dados" | "historico"

/**
 * Largura do elemento, medida quando ele entra na tela (ref de callback, antes da
 * pintura — sem piscar o layout errado) e acompanhada depois por ResizeObserver.
 */
function useElementWidth(): [(element: HTMLDivElement | null) => (() => void) | undefined, number | undefined] {
  const [width, setWidth] = React.useState<number>()
  const measure = React.useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    setWidth(Math.round(element.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [measure, width]
}

export function ProcessProfile({ id }: { id: string }) {
  const data = useOfficeData()
  const { deleteProcess } = useOfficeActions()
  const { openDialog } = useUI()
  const router = useRouter()
  const lookup = useCategoryLookup()
  const ready = data.hydrated
  const process = byId(data.processes, id)
  const [deleting, setDeleting] = React.useState(false)
  const { can } = useSession()
  const [measure, width] = useElementWidth()
  const narrow = width !== undefined && width < WIDE_MIN
  const [section, setSection] = React.useState<Section>("movimentacoes")
  const tabsAnchor = React.useRef<HTMLDivElement>(null)
  // O resumo (listas, Painel) já mostra o topo; o histórico e o que é do processo vêm agora.
  const detail = useProcessDetail(process?.id)
  // Histórico do escritório no processo: cresce sem limite — vem do banco em páginas.
  const processId = process?.id
  const activityList = React.useMemo(() => (processId ? activitiesOf({ processId }) : null), [processId])
  const activityHistory = usePagedHistory(activityList, NO_WINDOW, { auto: true })
  // Mostra o que está salvo na hora e atualiza em segundo plano quando vencido.
  const refresh = useProcessRefresh(process)

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
        <div className="grid gap-5 @4xl/main:grid-cols-12">
          <SkeletonCard className="@4xl/main:col-span-7" lines={5} />
          <SkeletonCard className="@4xl/main:col-span-5" lines={4} />
        </div>
      </div>
    )
  }

  const client = byId(data.clients, process.clientId)
  const owner = getUser(process.ownerId)
  const status = PROCESS_STATUS[process.status]
  const tasks = data.tasks
    .filter((t) => t.related?.type === "process" && t.related.id === process.id)
    .sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === "pendente" ? -1 : 1))
  const documents = data.documents.filter((d) => d.processId === process.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const appointments = data.appointments
    .filter((a) => a.processId === process.id && parse(a.end) > getNow())
    .sort((a, b) => a.start.localeCompare(b.start))
  // Próximo prazo = o aberto de menor data fatal (a coleção de prazos é a fonte de verdade).
  const next = process.status === "concluido" ? undefined : nextPrazo(data.deadlines, process.id)
  const deadlineDiff = next ? diffInDays(parse(next.fatalDate), getNow()) : undefined
  const urgentDeadline = deadlineDiff !== undefined && deadlineDiff <= PRAZO_ALERT_DAYS.soon
  // Timeline do processo: o que a equipe registrou (prazos cumpridos/perdidos, tarefas, documentos…).
  const activities = data.activities
    .filter((a) => a.processId === process.id && (activityHistory.cursor === null || activityKey(a) >= activityHistory.cursor))
    .sort((a, b) => b.at.localeCompare(a.at))
  const activityTotal = activityHistory.total ?? activities.length
  // Memoizado por identidade do array dentro do interpretador.
  const movements = interpretMovements(process.movements, process.id)

  const canAgenda = can("agenda.edit")
  const canDocuments = can("documents.edit")
  const canTasks = can("tasks.edit")
  const canProcess = can("processes.edit")
  const openPrazos = data.deadlines.filter((d) => d.processId === process.id && d.status === "aberto").length
  const pendingTasks = tasks.filter((t) => t.status === "pendente").length

  /* ------------------------------ blocos da tela ------------------------------ */
  // Cada bloco é montado uma vez e usado no layout de colunas (desktop) ou nas abas (celular).

  const identity = (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-brand-strong">Processo {process.code}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
        {process.number ? (
          <h1 className="min-w-0 break-all font-mono text-[clamp(16px,5vw,22px)] font-medium tracking-[-0.02em] text-foreground sm:text-[28px]">
            {process.number}
          </h1>
        ) : (
          // Cadastro manual sem número (ex.: segredo de justiça ainda sem CNJ informado).
          <h1 className="min-w-0 font-display text-[clamp(18px,5vw,24px)] font-semibold tracking-[-0.02em] text-muted-foreground sm:text-[28px]">
            Sem número informado
          </h1>
        )}
        {process.number && (
          <button
            type="button"
            aria-label="Copiar número do processo"
            onClick={() => {
              navigator.clipboard?.writeText(process.number).catch(() => {})
              toast.success("Número copiado.", { description: process.number })
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Copy className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-2 font-display text-[19px] leading-snug font-semibold tracking-[-0.015em] text-foreground sm:text-[21px]">{process.type}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        {process.secret && (
          <StatusBadge tone="warning" dot={false}>
            Segredo de justiça
          </StatusBadge>
        )}
        {client && (
          <Link
            href={`/clientes/${client.id}`}
            className="touch-target relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Tag icon={<UserRound />} className="hover:border-border-strong hover:text-foreground">
              {client.name}
            </Tag>
          </Link>
        )}
        {/* Celular: área, tribunal e juízo ficam em "Dados" (Detalhes e Resumo), sem repetir no topo. */}
        {!narrow && (
          <>
            <Tag>{process.area}</Tag>
            {process.tribunal && <Tag>{process.tribunal}</Tag>}
            <Tag>{process.judicialUnit ?? process.court}</Tag>
          </>
        )}
      </div>
    </div>
  )

  const deleteItem = (
    <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setDeleting(true)}>
      <Trash2 /> Excluir processo
    </DropdownMenuItem>
  )

  const desktopActions = (
    <div className="flex flex-wrap gap-2">
      <Can permission="agenda.edit">
        <Button variant="secondary" onClick={() => openDialog("appointment", { processId: process.id, clientId: process.clientId })}>
          <CalendarPlus /> Compromisso
        </Button>
      </Can>
      <Can permission="documents.edit">
        <Button variant="secondary" onClick={() => openDialog("document", { processId: process.id, clientId: process.clientId })}>
          <FilePlus /> Documento
        </Button>
      </Can>
      <Can permission="tasks.edit">
        <Button variant="secondary" onClick={() => openDialog("task", { processId: process.id })}>
          <ListChecks /> Nova tarefa
        </Button>
      </Can>
      <Can permission="processes.edit">
        <Button onClick={() => openDialog("prazo", { processId: process.id })}>
          <Hourglass /> Novo prazo
        </Button>
      </Can>
      <Can permission="processes.edit">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Mais ações" className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-[10px] p-1">
            <DropdownMenuGroup>{deleteItem}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Can>
    </div>
  )

  // Celular: as duas ações do dia a dia numa linha; compromisso, documento e excluir no "…".
  const mobileActions = (canProcess || canTasks || canAgenda || canDocuments) && (
    <div className="flex gap-2">
      {canProcess && (
        <Button className="min-w-0 flex-1" onClick={() => openDialog("prazo", { processId: process.id })}>
          <Hourglass /> Novo prazo
        </Button>
      )}
      {canTasks && (
        <Button variant="secondary" className="min-w-0 flex-1" onClick={() => openDialog("task", { processId: process.id })}>
          <ListChecks /> Nova tarefa
        </Button>
      )}
      {(canAgenda || canDocuments || canProcess) && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Mais ações" className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
            <DropdownMenuGroup>
              {canAgenda && (
                <DropdownMenuItem
                  className="h-9 px-2"
                  onClick={() => openDialog("appointment", { processId: process.id, clientId: process.clientId })}
                >
                  <CalendarPlus /> Novo compromisso
                </DropdownMenuItem>
              )}
              {canDocuments && (
                <DropdownMenuItem className="h-9 px-2" onClick={() => openDialog("document", { processId: process.id, clientId: process.clientId })}>
                  <FilePlus /> Novo documento
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {canProcess && (
              <>
                {(canAgenda || canDocuments) && <DropdownMenuSeparator />}
                <DropdownMenuGroup>{deleteItem}</DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )

  const facts = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div
        className={cn(
          "col-span-2 rounded-[14px] border p-4 shadow-card sm:col-span-1",
          urgentDeadline ? "border-danger/25 bg-danger-soft/50" : "border-border bg-card",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground">Próximo prazo</span>
          <Hourglass className={cn("size-4", urgentDeadline ? "text-danger" : "text-subtle")} />
        </div>
        {next ? (
          <>
            <p className={cn("tabular mt-2.5 text-[22px] font-semibold leading-none tracking-[-0.025em]", urgentDeadline && "text-danger")}>
              {fmtDayMonth(next.fatalDate)}
            </p>
            <p className="mt-2 truncate text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">{fmtDueIn(next.fatalDate)}</span> · {next.description}
            </p>
          </>
        ) : (
          <p className="mt-2.5 text-[15px] font-medium text-subtle">Sem prazos</p>
        )}
      </div>
      <div className="rounded-card border border-border/90 bg-card p-4 shadow-card">
        <span className="text-[12px] font-medium text-muted-foreground">Responsável</span>
        <div className="mt-2.5 flex items-center gap-2.5">
          {/* Celular: sem o avatar, para o nome caber inteiro. */}
          <UserAvatar name={owner.name} size="md" className="max-sm:hidden" />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold break-words max-sm:line-clamp-2 sm:truncate">{owner.name}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{owner.oab ?? userTitle(owner)}</p>
          </div>
        </div>
      </div>
      <div className="rounded-card border border-border/90 bg-card p-4 shadow-card">
        <span className="text-[12px] font-medium text-muted-foreground">Valor da causa</span>
        <p className="tabular mt-2.5 truncate text-[22px] font-semibold leading-none tracking-[-0.025em]">{formatCurrency(process.claimValue)}</p>
        <p className="mt-2 text-[12px] text-muted-foreground sm:truncate">Distribuído em {fmtNumericDate(process.distributedAt)}</p>
      </div>
    </div>
  )

  const signals = processSignals(data, process)
  // `key`: a pesquisa e os vínculos são de cada processo.
  const jurisprudencePanel = <ProcessJurisprudencePanel key={process.id} process={process} />
  /* `key`: cada processo tem suas próprias análises e conversa — nada vaza entre processos. */
  const aiPanel = <ProcessAIPanel key={process.id} process={process} client={client} signals={signals} compact={narrow} docked />

  const movementsPanel = (
    <Panel>
      <PanelHeader
        title="Movimentações"
        description={
          !detail.history ? (
            "Carregando o histórico…"
          ) : refresh.state.status === "refreshing" ? (
            <span className="inline-flex items-center gap-1.5" role="status">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden />
              Atualizando informações…
            </span>
          ) : (
            `${process.movements.length} registros · última em ${fmtDayLabel(process.lastMovementAt).toLowerCase()}, ${fmtTime(process.lastMovementAt)}`
          )
        }
        action={
          // Celular: "Atualizar" junto da timeline (o painel Andamento fica em "Dados").
          narrow &&
          refresh.enabled && (
            <Button variant="ghost" size="sm" onClick={refresh.refresh} disabled={refresh.state.status === "refreshing"}>
              <RefreshCw className={cn(refresh.state.status === "refreshing" && "animate-spin")} /> Atualizar
            </Button>
          )
        }
      />
      <div className={cn("pt-2 pb-6", narrow ? "px-4 sm:px-6" : "px-5 sm:px-6")}>
        {detail.history ? (
          <ProcessTimeline movements={movements} compact={narrow} />
        ) : (
          <div className="space-y-4 py-2" aria-busy="true" aria-label="Carregando movimentações">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
      </div>
    </Panel>
  )

  const historyPanel = activities.length > 0 && (
    <Panel>
      <PanelHeader title="Histórico do escritório" description="Prazos, tarefas e registros da equipe neste processo" />
      <div className="px-5 pt-2 pb-6 sm:px-6">
        <LimitedList items={activities} listKey={process.id} server={activityHistory} total={activityHistory.total}>
          {(items) => <ActivityTimeline activities={items} />}
        </LimitedList>
      </div>
    </Panel>
  )

  const tasksPanel = (
    <Panel>
      <PanelHeader
        title="Tarefas do processo"
        description={`${pendingTasks} pendentes`}
        action={
          <Can permission="tasks.edit">
            <Button variant="ghost" size="icon-sm" aria-label="Nova tarefa" onClick={() => openDialog("task", { processId: process.id })}>
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
        <EmptyState
          compact
          title="Nenhuma tarefa vinculada."
          description={
            next
              ? `O próximo prazo é ${fmtDueIn(next.fatalDate)}. Crie uma tarefa para não perdê-lo.`
              : "Crie tarefas para organizar os próximos passos deste processo."
          }
          action={
            <Can permission="tasks.edit">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  openDialog(
                    "task",
                    next && !next.taskId
                      ? {
                          processId: process.id,
                          title: next.description,
                          date: next.internalDate,
                          assigneeId: next.responsibleId,
                          prazoId: next.id,
                        }
                      : { processId: process.id },
                  )
                }
              >
                <Plus /> Criar tarefa
              </Button>
            </Can>
          }
        />
      )}
    </Panel>
  )

  const agendaPanel = appointments.length > 0 && (
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
  )

  const syncPanel = <ProcessSyncPanel process={process} state={refresh.state} canRefresh={refresh.enabled} onRefresh={refresh.refresh} />

  const detailsPanel = (
    <Panel>
      <PanelHeader title="Detalhes" />
      <dl className="divide-y divide-border px-5 pb-3">
        <Detail label="Juízo">{process.court}</Detail>
        {process.district && <Detail label="Comarca">{process.district}</Detail>}
        <Detail label="Parte contrária">{process.opposingParty}</Detail>
        <Detail label="Área">{process.area}</Detail>
        {client && (
          <Detail label="Cliente">
            <Link href={`/clientes/${client.id}`} className="touch-target relative inline-flex items-center gap-1 hover:underline">
              {client.name} <ArrowUpRight className="size-3.5 text-subtle" />
            </Link>
          </Detail>
        )}
        {process.notes && (
          <Detail label="Observações">
            <span className="whitespace-pre-line">{process.notes}</span>
          </Detail>
        )}
      </dl>
    </Panel>
  )

  const documentsPanel = (
    <Panel>
      <PanelHeader
        title="Documentos"
        description={`${documents.length} arquivos`}
        action={
          <Can permission="documents.edit">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Adicionar documento"
              onClick={() => openDialog("document", { processId: process.id, clientId: process.clientId })}
            >
              <Plus />
            </Button>
          </Can>
        }
      />
      {documents.length ? (
        <div className="border-t border-border">
          <DocumentList documents={documents} />
        </div>
      ) : (
        <EmptyState compact title="Nenhum documento anexado." description="Petições, decisões e comprovantes deste processo ficam reunidos aqui." />
      )}
    </Panel>
  )

  /* --------------------------------- celular --------------------------------- */

  const sections: { value: Section; label: string; count?: number }[] = [
    { value: "movimentacoes", label: "Movimentações", count: detail.history ? process.movements.length : undefined },
    { value: "prazos", label: "Prazos e tarefas", count: openPrazos + pendingTasks },
    { value: "documentos", label: "Documentos", count: documents.length },
    { value: "jurisprudencia", label: "Jurisprudência" },
    { value: "dados", label: "Dados" },
    ...(activityTotal ? [{ value: "historico" as const, label: "Histórico", count: activityTotal }] : []),
  ]
  const current = sections.some((s) => s.value === section) ? section : "movimentacoes"

  /** Troca de aba: se a pessoa já rolou para dentro do conteúdo, volta para o começo da aba. */
  const chooseSection = (value: Section) => {
    setSection(value)
    const anchor = tabsAnchor.current
    const top = anchor?.getBoundingClientRect().top ?? 0
    if (anchor && top < STICKY_OFFSET) window.scrollTo({ top: window.scrollY + top - STICKY_OFFSET })
  }

  const narrowLayout = (
    <>
      <FadeIn>
        <Link
          href="/processos"
          className="touch-target relative mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline md:hidden"
        >
          <ArrowLeft className="size-3.5" /> Processos
        </Link>
        {identity}
      </FadeIn>
      {/* Essencial: prazo, responsável e valor; depois as ações. */}
      {facts}
      {mobileActions}
      {/* Contexto: o que aconteceu por último e o que merece atenção (detalhes sob demanda). */}
      <LatestMovement movement={movements[0]} />
      {aiPanel}
      {/* Detalhes, organizados em abas: a timeline completa e o resto do processo a um toque. */}
      <div ref={tabsAnchor} aria-hidden />
      <div className="sticky top-16 z-10 -mx-4 -mt-2 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-[72px] lg:-mx-8 lg:px-8">
        <FilterTabs
          ariaLabel="Seções do processo"
          layoutId="process-section"
          value={current}
          onChange={chooseSection}
          options={sections}
          className="mx-0 px-0"
        />
      </div>
      <div role="tabpanel" aria-label={sections.find((s) => s.value === current)?.label} className="space-y-5">
        {current === "movimentacoes" && movementsPanel}
        {current === "prazos" && (
          <>
            <PrazosPanel process={process} />
            {tasksPanel}
            {agendaPanel}
          </>
        )}
        {current === "documentos" && documentsPanel}
        {current === "jurisprudencia" && jurisprudencePanel}
        {current === "dados" && (
          <>
            {detailsPanel}
            <ProcessSummaryPanel process={process} />
            <ProcessPartiesPanel process={process} />
            {syncPanel}
          </>
        )}
        {current === "historico" && historyPanel}
      </div>
    </>
  )

  /* --------------------------------- desktop --------------------------------- */

  const wideLayout = (
    <>
      <FadeIn>
        <div className="flex flex-col gap-5 @4xl/main:flex-row @4xl/main:items-end @4xl/main:justify-between">
          {identity}
          {desktopActions}
        </div>
      </FadeIn>

      <FadeIn delay={0.04}>
        <LatestMovement movement={movements[0]} />
      </FadeIn>

      {facts}

      {aiPanel}

      <div className="grid grid-cols-1 gap-5 @4xl/main:grid-cols-12">
        <div className="min-w-0 space-y-5 @4xl/main:col-span-7">
          {movementsPanel}
          {jurisprudencePanel}
          {historyPanel}
        </div>

        <div className="min-w-0 space-y-5 @4xl/main:col-span-5">
          <PrazosPanel process={process} />
          {tasksPanel}
          {agendaPanel}
          {syncPanel}
          <ProcessSummaryPanel process={process} />
          <ProcessPartiesPanel process={process} />
          {detailsPanel}
          {documentsPanel}
        </div>
      </div>
    </>
  )

  // A partir de 1536 px, a Íntegra IA fica fixa à direita (como no perfil do cliente).
  // A largura medida é a da tela toda, então o detalhe mantém as duas colunas ao lado dela.
  return (
    <div ref={measure} className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] 2xl:gap-7">
      <div className={cn("min-w-0", narrow ? "space-y-5" : "space-y-6")}>{width === undefined ? null : narrow ? narrowLayout : wideLayout}</div>

      <aside className="sticky top-[96px] hidden h-[calc(100dvh-120px)] min-h-[560px] 2xl:block">
        <ProcessAIDock key={process.id} process={process} signals={signals} className="h-full" />
      </aside>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir o processo ${process.number}?`}
        description="Esta ação não pode ser desfeita, incluindo o histórico de movimentações."
        onConfirm={() => {
          deleteProcess(process.id)
          toast.success("Processo excluído.", { description: process.number })
          router.push("/processos")
        }}
      />
    </div>
  )
}
