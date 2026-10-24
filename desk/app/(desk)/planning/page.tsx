import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { Page, PageHeader } from "@/components/layout/page"
import { WeekPlanner } from "@/components/planning/week-planner"
import { getRequestContext } from "@/lib/context"
import { addDays, formatLocalDate, isLocalDate, startOfWeek, weekDays } from "@/lib/domain/dates"
import { entryDatesBetween } from "@/lib/services/journal"
import { listProjects } from "@/lib/services/projects"
import { listTasks } from "@/lib/services/tasks"

export const metadata = { title: "Planejamento" }

export default async function PlanningPage({ searchParams }: PageProps<"/planning">) {
  const { week } = await searchParams
  const ctx = await getRequestContext()
  const anchor = isLocalDate(week) ? week : ctx.today
  const days = weekDays(anchor, ctx.weekStartsOn)
  const from = days[0]!
  const to = days[6]!
  const [scheduled, backlog, projects, journalDays] = await Promise.all([
    listTasks({ status: ["todo", "in_progress", "done"], dueFrom: from, dueTo: to }),
    listTasks({ status: ["todo", "in_progress"], noDueDate: true }, { limit: 200 }),
    listProjects({ status: ["active", "planned"] }),
    entryDatesBetween(from, to),
  ])
  const milestones = projects.filter((p) => p.targetDate && p.targetDate >= from && p.targetDate <= to).map((p) => ({ id: p.id, title: p.title, date: p.targetDate! }))
  const thisWeek = startOfWeek(ctx.today, ctx.weekStartsOn) === from
  const range = `${formatLocalDate(from, { day: "numeric", month: "short" })} – ${formatLocalDate(to, { day: "numeric", month: "short", year: "numeric" })}`

  return (
    <Page wide>
      <PageHeader
        eyebrow="Planejamento"
        title={thisWeek ? "Esta semana" : range}
        description={thisWeek ? range : undefined}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/planning?week=${addDays(from, -7)}`} className="rounded-sm border border-line bg-white p-1.5 text-ink-3 hover:text-ink" aria-label="Semana anterior">
              <ChevronLeft className="size-4" />
            </Link>
            {!thisWeek ? (
              <Link href="/planning" className="rounded-sm border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:text-ink">
                Hoje
              </Link>
            ) : null}
            <Link href={`/planning?week=${addDays(from, 7)}`} className="rounded-sm border border-line bg-white p-1.5 text-ink-3 hover:text-ink" aria-label="Próxima semana">
              <ChevronRight className="size-4" />
            </Link>
            <Link href="/tasks?view=calendar" className="ml-2 rounded-sm px-3 py-1.5 text-xs text-cobalt-ink hover:underline">
              Ver o mês
            </Link>
          </div>
        }
      />
      <WeekPlanner days={days} tasks={[...scheduled, ...backlog]} today={ctx.today} milestones={milestones} journalDays={journalDays} />
    </Page>
  )
}
