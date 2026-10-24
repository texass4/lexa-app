import { FileText, Waypoints } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Backlinks } from "@/components/layout/backlinks"
import { CreateAndOpenButton } from "@/components/layout/create-buttons"
import { Page, SectionTitle } from "@/components/layout/page"
import { ProjectHeader } from "@/components/projects/project-header"
import { NewTaskButton } from "@/components/tasks/new-task-button"
import { TaskList } from "@/components/tasks/task-row"
import { EmptyState } from "@/components/ui/empty"
import { getRequestContext } from "@/lib/context"
import { formatInstant } from "@/lib/domain/dates"
import { UUID_RE } from "@/lib/domain/refs"
import { getProject, projectRelations } from "@/lib/services/projects"
import { listTasks } from "@/lib/services/tasks"

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params
  const project = UUID_RE.test(id) ? await getProject(id) : null
  return { title: project?.title ?? "Projeto" }
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const [project, ctx] = await Promise.all([getProject(id), getRequestContext()])
  if (!project) notFound()
  const [open, done, relations] = await Promise.all([listTasks({ projectId: id, status: ["todo", "in_progress"] }), listTasks({ projectId: id, status: ["done"] }), projectRelations(id)])

  return (
    <Page wide>
      <ProjectHeader project={project} />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-10">
          <section>
            <SectionTitle title="Tarefas abertas" count={open.length} action={<NewTaskButton defaults={{ projectId: id, areaId: project.areaId }} label="Tarefa" />} />
            <TaskList tasks={open} today={ctx.today} options={{ hideProject: true }} empty={<EmptyState compact title="Nenhuma tarefa aberta neste projeto" />} />
          </section>
          {done.length ? (
            <details className="group">
              <summary className="mb-3 flex list-none items-center gap-3 text-[0.8125rem] font-semibold tracking-wide text-ink-3 uppercase">
                Concluídas <span className="meta">{done.length}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="meta group-open:hidden">mostrar</span>
              </summary>
              <TaskList tasks={done} today={ctx.today} options={{ hideProject: true }} />
            </details>
          ) : null}
        </div>
        <aside className="flex flex-col gap-10">
          <section>
            <SectionTitle title="Páginas" count={relations.pages.length || undefined} action={<CreateAndOpenButton kind="page" projectId={id} label="Página" />} />
            {relations.pages.length === 0 ? (
              <p className="text-sm text-ink-4">Documentação, notas e referências do projeto.</p>
            ) : (
              <ul className="flex flex-col">
                {relations.pages.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pages/${p.id}`} className="flex items-center gap-2 py-1.5 text-sm text-ink-2 hover:text-ink hover:underline">
                      <FileText className="size-3.5 text-ink-4" />
                      <span className="flex-1 truncate">{p.title || "Sem título"}</span>
                      <span className="meta">{formatInstant(p.updatedAt, ctx.timezone, { day: "numeric", month: "short" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionTitle title="Quadros" count={relations.boards.length || undefined} action={<CreateAndOpenButton kind="board" projectId={id} label="Quadro" />} />
            {relations.boards.length === 0 ? (
              <p className="text-sm text-ink-4">Fluxos e mapas visuais do projeto.</p>
            ) : (
              <ul className="flex flex-col">
                {relations.boards.map((b) => (
                  <li key={b.id}>
                    <Link href={`/canvas/${b.id}`} className="flex items-center gap-2 py-1.5 text-sm text-ink-2 hover:text-ink hover:underline">
                      <Waypoints className="size-3.5 text-ink-4" />
                      <span className="flex-1 truncate">{b.title || "Quadro sem título"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Backlinks target={{ type: "project", id }} />
        </aside>
      </div>
    </Page>
  )
}
