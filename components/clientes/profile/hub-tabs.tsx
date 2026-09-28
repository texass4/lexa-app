"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { CalendarClock, CalendarPlus, FilePlus, ListChecks, Plus, Scale } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ProcessListItem } from "@/components/shared/process-list-item"
import { DocumentList } from "@/components/shared/document-list"
import { GroupedTimeline } from "@/components/shared/grouped-timeline"
import { activityToEntry } from "@/components/shared/activity-timeline"
import { TaskItem } from "@/components/tasks/task-item"
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet"
import { TaskFormDialog } from "@/components/tasks/task-form-dialog"
import { useToggleTask } from "@/components/tasks/task-row"
import { AppointmentDetail } from "@/components/agenda/appointment-detail"
import { useCategoryLookup } from "@/components/agenda/use-category"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { describeRelated, type ClientHub } from "@/lib/selectors"
import { fmtDayLabel, fmtDayMonthParts, fmtTime, getNow, parse } from "@/lib/dates"
import { getUser } from "@/lib/account"
import type { Activity, ActivityType, Appointment, Client, Task } from "@/types"
import { Can } from "@/lib/auth/session"

/* -------------------------------- Processos ------------------------------- */

export function ProcessesTab({ client, hub }: { client: Client; hub: ClientHub }) {
  const { openDialog } = useUI()
  const { processes, activeProcesses } = hub
  const create = (
    <Can permission="processes.edit">
      <Button size="sm" onClick={() => openDialog("process", { clientId: client.id })}>
        <Plus /> Novo processo
      </Button>
    </Can>
  )

  if (!processes.length) {
    return (
      <Panel>
        <EmptyState
          icon={<Scale />}
          title="Nenhum processo vinculado."
          description="Cadastre ou consulte um processo pelo CNJ — ele já nasce vinculado a este cliente."
          action={create}
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{activeProcesses.length}</span> {activeProcesses.length === 1 ? "ativo" : "ativos"} ·{" "}
          {processes.length} no total
        </p>
        {create}
      </div>
      {processes.map((p) => (
        <ProcessListItem key={p.id} process={p} />
      ))}
    </div>
  )
}

/* ------------------------------- Documentos ------------------------------- */

export function DocumentsTab({ client, hub }: { client: Client; hub: ClientHub }) {
  const { openDialog } = useUI()
  const { documents } = hub
  return (
    <Panel>
      <PanelHeader
        title="Documentos"
        description={`${documents.length} ${documents.length === 1 ? "arquivo" : "arquivos"} · inclui os dos processos do cliente`}
        action={
          <Can permission="documents.edit">
            <Button size="sm" onClick={() => openDialog("document", { clientId: client.id })}>
              <FilePlus /> Adicionar documento
            </Button>
          </Can>
        }
      />
      {documents.length ? (
        <div className="border-t border-border">
          <DocumentList documents={documents} />
        </div>
      ) : (
        <EmptyState
          compact
          icon={<FilePlus />}
          title="Nenhum documento."
          description="Adicione RG, procuração, contrato e demais arquivos do cliente."
        />
      )}
    </Panel>
  )
}

/* --------------------------------- Tarefas -------------------------------- */

type TaskFilter = "pendentes" | "concluidas" | "todas"

export function TasksTab({ client, hub }: { client: Client; hub: ClientHub }) {
  const data = useDemoData()
  const { deleteTask } = useDemoActions()
  const { openDialog } = useUI()
  const toggle = useToggleTask()
  const [filter, setFilter] = React.useState<TaskFilter>("pendentes")
  const [openId, setOpenId] = React.useState<string>()
  const [editing, setEditingState] = React.useState<{ task?: Task; open: boolean }>({ open: false })
  const [toDelete, setToDelete] = React.useState<Task | null>(null)
  const setEditing = (t?: Task) => setEditingState((s) => (t ? { task: t, open: true } : { ...s, open: false }))

  const pending = hub.tasks.filter((t) => t.status === "pendente")
  const done = hub.tasks.filter((t) => t.status === "concluida").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
  const visible = filter === "pendentes" ? pending : filter === "concluidas" ? done : [...pending, ...done]
  const openTask = openId ? hub.tasks.find((t) => t.id === openId) : undefined
  // O vínculo com o próprio cliente não precisa aparecer; o processo, sim.
  const relatedOf = (t: Task) => (t.related?.type === "process" ? describeRelated(data, t.related) : undefined)
  const remove = (t: Task) => {
    deleteTask(t.id)
    toast.success("Tarefa excluída.", { description: t.title })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          ariaLabel="Filtrar tarefas do cliente"
          layoutId="client-tasks-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pendentes", label: "Pendentes", count: pending.length },
            { value: "concluidas", label: "Concluídas", count: done.length },
            { value: "todas", label: "Todas", count: hub.tasks.length },
          ]}
        />
        <Can permission="tasks.edit">
          <Button size="sm" className="self-start" onClick={() => openDialog("task", { clientId: client.id })}>
            <Plus /> Nova tarefa
          </Button>
        </Can>
      </div>

      {visible.length ? (
        <ul className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
          <AnimatePresence initial={false}>
            {visible.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                related={relatedOf(t)}
                onToggle={() => toggle(t)}
                onEdit={() => setEditing(t)}
                onOpen={() => setOpenId(t.id)}
                onDelete={() => setToDelete(t)}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <Panel>
          <EmptyState
            compact
            icon={<ListChecks />}
            title={
              hub.tasks.length ? (filter === "pendentes" ? "Nenhuma tarefa pendente." : "Nenhuma tarefa concluída.") : "Nenhuma tarefa vinculada."
            }
            description={hub.tasks.length ? undefined : "Crie tarefas para organizar o atendimento deste cliente."}
          />
        </Panel>
      )}

      <TaskDetailSheet
        task={openTask}
        related={openTask ? describeRelated(data, openTask.related) : undefined}
        open={!!openTask}
        onOpenChange={(o) => !o && setOpenId(undefined)}
        onToggle={(t) => toggle(t)}
        onEdit={(t) => {
          setOpenId(undefined)
          window.setTimeout(() => setEditing(t), 180)
        }}
        onDelete={(t) => {
          setOpenId(undefined)
          remove(t)
        }}
      />
      <TaskFormDialog open={editing.open} onOpenChange={(o) => !o && setEditing()} task={editing.task} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir "${toDelete?.title}"?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => toDelete && remove(toDelete)}
      />
    </div>
  )
}

/* ------------------------------ Compromissos ------------------------------ */

export function AppointmentsTab({ client, hub }: { client: Client; hub: ClientHub }) {
  const data = useDemoData()
  const { openDialog } = useUI()
  const lookup = useCategoryLookup()
  const [selectedId, setSelectedId] = React.useState<string>()
  const now = getNow()
  const upcoming = hub.appointments.filter((a) => parse(a.end) > now)
  const past = hub.appointments.filter((a) => parse(a.end) <= now).reverse()
  const selected = selectedId ? hub.appointments.find((a) => a.id === selectedId) : undefined

  const row = (a: Appointment) => {
    const { category, style } = lookup(a.categoryId)
    const owner = getUser(a.ownerId)
    const process = a.processId ? data.processes.find((p) => p.id === a.processId) : undefined
    const { day, month } = fmtDayMonthParts(a.start)
    return (
      <li key={a.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedId(a.id)}
          onKeyDown={(e) => e.key === "Enter" && setSelectedId(a.id)}
          className="flex cursor-pointer items-center gap-3.5 px-4 py-3 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent sm:px-5"
        >
          <span className="flex w-11 shrink-0 flex-col items-center rounded-[8px] border border-border bg-surface py-1">
            <span className="text-[9.5px] font-semibold tracking-[0.1em] text-gold-dark">{month}</span>
            <span className="tabular text-[15px] font-semibold leading-tight">{day}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{a.title}</p>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
              <span className="tabular">
                {fmtDayLabel(a.start)}, {fmtTime(a.start)}–{fmtTime(a.end)}
              </span>
              <span className="text-subtle">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={style.dot} />
                {category?.name ?? "Sem categoria"}
              </span>
              {process && (
                <>
                  <span className="text-subtle">·</span>
                  <Link href={`/processos/${process.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-foreground hover:underline">
                    {process.code}
                  </Link>
                </>
              )}
            </p>
          </div>
          <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
            <UserAvatar name={owner.name} size="xs" />
            {owner.firstName}
          </span>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Próximos compromissos"
          description={`${upcoming.length} agendado${upcoming.length === 1 ? "" : "s"}`}
          action={
            <Can permission="agenda.edit">
              <Button size="sm" onClick={() => openDialog("appointment", { clientId: client.id })}>
                <CalendarPlus /> Novo compromisso
              </Button>
            </Can>
          }
        />
        {upcoming.length ? (
          <ul className="divide-y divide-border border-t border-border">{upcoming.map(row)}</ul>
        ) : (
          <EmptyState
            compact
            icon={<CalendarClock />}
            title="Nenhum compromisso agendado."
            description="Agende consultas, reuniões e audiências do cliente."
          />
        )}
      </Panel>
      {past.length > 0 && (
        <Panel>
          <PanelHeader title="Anteriores" description={`${past.length} realizado${past.length === 1 ? "" : "s"}`} />
          <ul className={cn("divide-y divide-border border-t border-border opacity-80")}>{past.map(row)}</ul>
        </Panel>
      )}
      <AppointmentDetail appointment={selected} onClose={() => setSelectedId(undefined)} />
    </div>
  )
}

/* -------------------------------- Timeline -------------------------------- */

type TimelineFilter = "todos" | "cadastro" | "processos" | "tarefas" | "documentos" | "agenda" | "financeiro"

const TIMELINE_GROUPS: Record<Exclude<TimelineFilter, "todos">, { label: string; types: ActivityType[] }> = {
  cadastro: { label: "Cadastro", types: ["client", "contract"] },
  processos: { label: "Processos", types: ["petition", "movement", "hearing", "summons"] },
  tarefas: { label: "Tarefas", types: ["task"] },
  documentos: { label: "Documentos", types: ["document"] },
  agenda: { label: "Agenda", types: ["appointment"] },
  financeiro: { label: "Financeiro", types: ["payment"] },
}

/** Timeline do cliente: só eventos registrados de verdade, com quem fez e quando. */
export function TimelineTab({ hub }: { hub: ClientHub }) {
  const [filter, setFilter] = React.useState<TimelineFilter>("todos")
  const inGroup = (a: Activity, f: TimelineFilter) => f === "todos" || TIMELINE_GROUPS[f].types.includes(a.type)
  const visible = hub.activities.filter((a) => inGroup(a, filter))
  const options = [
    { value: "todos" as const, label: "Tudo", count: hub.activities.length },
    ...(Object.keys(TIMELINE_GROUPS) as (keyof typeof TIMELINE_GROUPS)[])
      .map((key) => ({ value: key, label: TIMELINE_GROUPS[key].label, count: hub.activities.filter((a) => inGroup(a, key)).length }))
      .filter((o) => o.count > 0),
  ]

  const entries = visible.map((a) => {
    const entry = activityToEntry(a)
    // Quem fez: o nome já está na frase quando `actor` existe; senão, vai no detalhe.
    const by = !a.actor && a.actorUserId ? `por ${getUser(a.actorUserId).name}` : undefined
    return { ...entry, detail: [a.detail, by].filter(Boolean).join(" · ") || undefined }
  })

  return (
    <div className="space-y-4">
      {hub.activities.length > 0 && (
        <FilterTabs ariaLabel="Filtrar timeline" layoutId="client-timeline-filter" value={filter} onChange={setFilter} options={options} />
      )}
      <Panel className="p-5 sm:p-7">
        {entries.length ? (
          <GroupedTimeline entries={entries} />
        ) : (
          <EmptyState
            compact
            icon={<CalendarClock />}
            title="Nenhuma atividade registrada."
            description="Cadastro, processos, tarefas, documentos, compromissos e pagamentos do cliente aparecem aqui."
          />
        )}
      </Panel>
    </div>
  )
}
