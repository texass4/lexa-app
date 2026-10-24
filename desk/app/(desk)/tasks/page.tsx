import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { Page, PageHeader, SectionTitle } from "@/components/layout/page"
import { Kanban } from "@/components/tasks/kanban"
import { MonthCalendar } from "@/components/tasks/month-calendar"
import { NewTaskButton } from "@/components/tasks/new-task-button"
import { TaskFilters } from "@/components/tasks/task-filters"
import { TaskList } from "@/components/tasks/task-row"
import { EmptyState } from "@/components/ui/empty"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { addDays, addMonths, formatLocalDate, monthGrid, relativeDayLabel, startOfMonth, weekdayName } from "@/lib/domain/dates"
import { compareTasks, type TaskStatus } from "@/lib/domain/tasks"
import { listTags, listTasks, type TaskItem } from "@/lib/services/tasks"
import { baseFilter, parseTaskParams, TASK_VIEWS, taskHref, type TaskSearchParams } from "@/lib/task-views"

export const metadata = { title: "Tarefas" }

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const params = parseTaskParams(await searchParams)
  const ctx = await getRequestContext()
  const { today } = ctx
  const tags = (await listTags()).map((t) => t.name)
  const filter = baseFilter(params, today, ctx.weekStartsOn)

  let body: React.ReactNode
  switch (params.view) {
    case "today": {
      const [due, overdue] = await Promise.all([
        listTasks({ ...filter, status: ["todo", "in_progress", "done"], dueFrom: today, dueTo: today }),
        listTasks({ ...filter, status: ["todo", "in_progress"], dueFrom: undefined, dueTo: addDays(today, -1), noDueDate: undefined }),
      ])
      body = (
        <div className="flex flex-col gap-10">
          {overdue.length ? (
            <section>
              <SectionTitle title={<span className="text-clay">Atrasadas</span>} count={overdue.length} />
              <TaskList tasks={overdue} today={today} />
            </section>
          ) : null}
          <section>
            <SectionTitle title={`Hoje · ${formatLocalDate(today, { weekday: "long", day: "numeric", month: "long" })}`} count={due.length} action={<NewTaskButton defaults={{ dueDate: today }} label="Tarefa" />} />
            <TaskList tasks={due} today={today} options={{ hideDue: true }} empty={<EmptyState compact title="Nada com prazo para hoje" />} />
          </section>
        </div>
      )
      break
    }
    case "upcoming": {
      const tasks = await listTasks({ ...filter, status: ["todo", "in_progress"], dueFrom: addDays(today, 1), dueTo: undefined, noDueDate: undefined })
      body = tasks.length ? <UpcomingList tasks={tasks} today={today} /> : <EmptyState title="Nada programado à frente">Tarefas com prazo a partir de amanhã aparecem aqui, agrupadas por dia.</EmptyState>
      break
    }
    case "overdue": {
      const tasks = await listTasks({ ...filter, status: ["todo", "in_progress"], dueFrom: undefined, dueTo: addDays(today, -1), noDueDate: undefined })
      body = <TaskList tasks={tasks} today={today} empty={<EmptyState title="Nenhuma tarefa atrasada">Atrasada é uma tarefa aberta com prazo antes de hoje. Tarefas sem prazo nunca entram aqui.</EmptyState>} />
      break
    }
    case "board": {
      const showArchived = params.status === "archived" || params.status === "all"
      const columns: TaskStatus[] = showArchived ? ["todo", "in_progress", "done", "archived"] : ["todo", "in_progress", "done"]
      const tasks = await listTasks({ ...filter, status: columns })
      body = <Kanban tasks={tasks} today={today} columns={columns} />
      break
    }
    case "calendar": {
      const month = params.month ? `${params.month}-01` : startOfMonth(today)
      const grid = monthGrid(month, ctx.weekStartsOn)
      const tasks = await listTasks({ ...filter, status: filter.status, dueFrom: grid[0]![0], dueTo: grid[grid.length - 1]![6], noDueDate: undefined })
      body = (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Link href={taskHref(params, { month: addMonths(month, -1).slice(0, 7) })} className="rounded-sm p-1.5 text-ink-3 hover:bg-white hover:text-ink" aria-label="Mês anterior">
              <ChevronLeft className="size-4" />
            </Link>
            <h2 className="min-w-44 text-center font-serif text-xl text-ink capitalize">{formatLocalDate(month, { month: "long", year: "numeric" })}</h2>
            <Link href={taskHref(params, { month: addMonths(month, 1).slice(0, 7) })} className="rounded-sm p-1.5 text-ink-3 hover:bg-white hover:text-ink" aria-label="Próximo mês">
              <ChevronRight className="size-4" />
            </Link>
            {month.slice(0, 7) !== today.slice(0, 7) ? (
              <Link href={taskHref(params, { month: "" })} className="ml-2 text-xs text-cobalt-ink hover:underline">
                Hoje
              </Link>
            ) : null}
            <span className="meta ml-auto hidden sm:inline">Arraste uma tarefa para outro dia para mudar o prazo</span>
          </div>
          <MonthCalendar tasks={tasks} today={today} month={month} weekStartsOn={ctx.weekStartsOn} />
        </div>
      )
      break
    }
    case "grouped": {
      const tasks = await listTasks(filter)
      body = <GroupedList tasks={tasks} today={today} params={params} />
      break
    }
    default: {
      const tasks = await listTasks(filter)
      body = (
        <TaskList
          tasks={tasks}
          today={today}
          empty={
            <EmptyState title={params.q || params.project || params.area || params.tag ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa aberta"} action={<NewTaskButton variant="primary" />}>
              Crie uma tarefa com <kbd className="font-mono text-xs">N</kbd> em qualquer tela ou pelo botão acima.
            </EmptyState>
          }
        />
      )
    }
  }

  const statusFilterAllowed = params.view === "list" || params.view === "grouped" || params.view === "calendar" || params.view === "board"
  return (
    <Page wide={params.view === "board" || params.view === "calendar"}>
      <PageHeader eyebrow="Tarefas" title={TASK_VIEWS.find((v) => v.id === params.view)!.label} actions={<NewTaskButton variant="primary" />}>
        <nav aria-label="Visualizações" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px">
          {TASK_VIEWS.map((v) => (
            <Link
              key={v.id}
              href={taskHref(params, { view: v.id, month: "" })}
              aria-current={params.view === v.id ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm transition-colors",
                params.view === v.id ? "border-cobalt text-ink" : "border-transparent text-ink-4 hover:text-ink",
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <TaskFilters params={params} tags={tags} showStatus={statusFilterAllowed} showDue={params.view === "list" || params.view === "grouped" || params.view === "board"} />
      </PageHeader>
      {body}
    </Page>
  )
}

function UpcomingList({ tasks, today }: { tasks: TaskItem[]; today: string }) {
  const byDay = new Map<string, TaskItem[]>()
  for (const t of tasks) byDay.set(t.dueDate!, [...(byDay.get(t.dueDate!) ?? []), t])
  return (
    <div className="flex flex-col gap-8">
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day}>
          <SectionTitle
            title={
              <span>
                <span className="capitalize">{relativeDayLabel(day, today)}</span>
                <span className="ml-2 font-normal text-ink-4 normal-case">{weekdayName(day)}</span>
              </span>
            }
            count={list.length}
            action={<NewTaskButton defaults={{ dueDate: day }} label="Tarefa" />}
          />
          <TaskList tasks={list} today={today} options={{ hideDue: true }} />
        </section>
      ))}
    </div>
  )
}

function GroupedList({ tasks, today, params }: { tasks: TaskItem[]; today: string; params: TaskSearchParams }) {
  const key = (t: TaskItem) => (params.group === "project" ? (t.projectId ?? "") : (t.areaId ?? ""))
  const label = (t: TaskItem) => (params.group === "project" ? (t.projectTitle ?? "Sem projeto") : (t.areaName ?? "Sem área"))
  const groups = new Map<string, { label: string; tasks: TaskItem[] }>()
  for (const t of [...tasks].sort(compareTasks)) {
    const g = groups.get(key(t)) ?? { label: label(t), tasks: [] }
    g.tasks.push(t)
    groups.set(key(t), g)
  }
  const ordered = [...groups.entries()].sort(([a, ga], [b, gb]) => (a === "" ? 1 : b === "" ? -1 : ga.label.localeCompare(gb.label, "pt-BR")))
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-1 text-sm">
        <span className="mr-1 text-ink-4">Agrupar por</span>
        {(["project", "area"] as const).map((g) => (
          <Link
            key={g}
            href={taskHref(params, { group: g })}
            aria-current={params.group === g ? "true" : undefined}
            className={cn("rounded-sm px-2.5 py-1 text-xs", params.group === g ? "bg-ink text-paper" : "text-ink-3 hover:bg-white")}
          >
            {g === "project" ? "Projeto" : "Área"}
          </Link>
        ))}
      </div>
      {ordered.length === 0 ? <EmptyState title="Nenhuma tarefa" /> : null}
      {ordered.map(([id, g]) => (
        <section key={id || "none"}>
          <SectionTitle
            title={
              id ? (
                <Link href={params.group === "project" ? `/projects/${id}` : `/areas/${id}`} className="hover:underline">
                  {g.label}
                </Link>
              ) : (
                <span className="text-ink-4">{g.label}</span>
              )
            }
            count={g.tasks.length}
            action={<NewTaskButton defaults={params.group === "project" ? { projectId: id || null } : { areaId: id || null }} label="Tarefa" />}
          />
          <TaskList tasks={g.tasks} today={today} options={{ hideProject: params.group === "project" }} />
        </section>
      ))}
    </div>
  )
}
