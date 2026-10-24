import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Backlinks } from "@/components/layout/backlinks"
import { Page } from "@/components/layout/page"
import { TaskEditor } from "@/components/tasks/task-editor"
import { getRequestContext } from "@/lib/context"
import { formatInstant } from "@/lib/domain/dates"
import { UUID_RE } from "@/lib/domain/refs"
import { taskCode } from "@/lib/domain/tasks"
import { getTask } from "@/lib/services/tasks"

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params
  const task = UUID_RE.test(id) ? await getTask(id) : null
  return { title: task ? task.title : "Tarefa" }
}

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const [task, ctx] = await Promise.all([getTask(id), getRequestContext()])
  if (!task) notFound()
  const when = (d: Date) => formatInstant(d, ctx.timezone, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  return (
    <Page>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Tarefas
        </Link>
        <span className="meta">{taskCode(task.number)}</span>
      </div>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <TaskEditor task={task} />
        <aside className="flex flex-col gap-8 lg:pt-16">
          <Backlinks target={{ type: "task", id: task.id }} />
          <section>
            <h2 className="eyebrow mb-2">Registro</h2>
            <dl className="flex flex-col gap-1.5 text-xs text-ink-3">
              <div className="flex justify-between gap-3">
                <dt>Criada</dt>
                <dd className="meta">{when(task.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Atualizada</dt>
                <dd className="meta">{when(task.updatedAt)}</dd>
              </div>
              {task.completedAt ? (
                <div className="flex justify-between gap-3">
                  <dt>Concluída</dt>
                  <dd className="meta text-sage-ink">{when(task.completedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </Page>
  )
}
