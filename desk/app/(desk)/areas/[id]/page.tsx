import { FileText, FolderKanban, Waypoints } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AREA_COLORS } from "@/components/areas/colors"
import { CreateAndOpenButton } from "@/components/layout/create-buttons"
import { Page, PageHeader, SectionTitle } from "@/components/layout/page"
import { NewProjectButton } from "@/components/projects/project-form"
import { NewTaskButton } from "@/components/tasks/new-task-button"
import { TaskList } from "@/components/tasks/task-row"
import { EmptyState } from "@/components/ui/empty"
import { ProgressBar } from "@/components/ui/progress"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { UUID_RE } from "@/lib/domain/refs"
import { areaRelations, getArea } from "@/lib/services/areas"
import { listProjects } from "@/lib/services/projects"
import { listTasks } from "@/lib/services/tasks"

export async function generateMetadata({ params }: PageProps<"/areas/[id]">) {
  const { id } = await params
  const area = UUID_RE.test(id) ? await getArea(id) : null
  return { title: area?.name ?? "Área" }
}

export default async function AreaPage({ params }: PageProps<"/areas/[id]">) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const [area, ctx] = await Promise.all([getArea(id), getRequestContext()])
  if (!area) notFound()
  const [tasks, projects, relations] = await Promise.all([listTasks({ areaId: id }), listProjects({ areaId: id, includeArchived: false }), areaRelations(id)])
  return (
    <Page wide>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className={cn("size-2 rounded-full", AREA_COLORS[area.color] ?? "bg-sage")} />
            Área{area.archivedAt ? " · arquivada" : ""}
          </span>
        }
        title={area.name}
        description={area.description || undefined}
        actions={
          <Link href="/areas" className="text-sm text-ink-3 hover:text-ink">
            Todas as áreas
          </Link>
        }
      />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-10">
          <section>
            <SectionTitle title="Projetos" count={projects.length || undefined} action={<NewProjectButton variant="ghost" label="+ Projeto" defaultAreaId={id} />} />
            {projects.length === 0 ? (
              <EmptyState compact title="Nenhum projeto nesta área" />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="block rounded-md border border-line bg-white p-4 hover:border-line-strong">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="size-4 text-ink-4" />
                        <span className="truncate text-ink">{p.title}</span>
                      </div>
                      <ProgressBar progress={p.progress} className="mt-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionTitle title="Tarefas abertas" count={tasks.length} action={<NewTaskButton defaults={{ areaId: id }} label="Tarefa" />} />
            <TaskList tasks={tasks} today={ctx.today} empty={<EmptyState compact title="Nenhuma tarefa aberta nesta área" />} />
          </section>
        </div>
        <aside className="flex flex-col gap-10">
          <section>
            <SectionTitle title="Páginas" count={relations.pages.length || undefined} action={<CreateAndOpenButton kind="page" areaId={id} label="Página" />} />
            <ul className="flex flex-col">
              {relations.pages.map((p) => (
                <li key={p.id}>
                  <Link href={`/pages/${p.id}`} className="flex items-center gap-2 py-1.5 text-sm text-ink-2 hover:text-ink hover:underline">
                    <FileText className="size-3.5 text-ink-4" /> <span className="truncate">{p.title || "Sem título"}</span>
                  </Link>
                </li>
              ))}
              {relations.pages.length === 0 ? <li className="text-sm text-ink-4">Sem páginas.</li> : null}
            </ul>
          </section>
          <section>
            <SectionTitle title="Quadros" count={relations.boards.length || undefined} action={<CreateAndOpenButton kind="board" areaId={id} label="Quadro" />} />
            <ul className="flex flex-col">
              {relations.boards.map((b) => (
                <li key={b.id}>
                  <Link href={`/canvas/${b.id}`} className="flex items-center gap-2 py-1.5 text-sm text-ink-2 hover:text-ink hover:underline">
                    <Waypoints className="size-3.5 text-ink-4" /> <span className="truncate">{b.title || "Quadro sem título"}</span>
                  </Link>
                </li>
              ))}
              {relations.boards.length === 0 ? <li className="text-sm text-ink-4">Sem quadros.</li> : null}
            </ul>
          </section>
        </aside>
      </div>
    </Page>
  )
}
