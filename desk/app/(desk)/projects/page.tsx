import Link from "next/link"
import { Page, PageHeader } from "@/components/layout/page"
import { NewProjectButton } from "@/components/projects/project-form"
import { PROJECT_TONE } from "@/components/projects/status"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty"
import { ProgressBar } from "@/components/ui/progress"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { relativeDayLabel } from "@/lib/domain/dates"
import { listProjects, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/services/projects"

export const metadata = { title: "Projetos" }

const FILTERS: { key: string; label: string; status?: ProjectStatus[] }[] = [
  { key: "", label: "Em andamento" },
  { key: "completed", label: "Concluídos", status: ["completed"] },
  { key: "archived", label: "Arquivados", status: ["archived"] },
]

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const { show, new: isNew } = await searchParams
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0]!
  const [projects, ctx] = await Promise.all([listProjects({ status: filter.status ?? ["active", "planned", "paused"] }), getRequestContext()])
  return (
    <Page>
      <PageHeader eyebrow="Projetos" title="Projetos" description="Resultados com começo e fim. O progresso vem das tarefas não arquivadas de cada projeto." actions={<NewProjectButton autoOpen={isNew === "1"} />}>
        <nav className="flex gap-1 border-b border-line" aria-label="Filtro">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/projects?show=${f.key}` : "/projects"}
              aria-current={f === filter ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-2.5 py-2 text-sm", f === filter ? "border-cobalt text-ink" : "border-transparent text-ink-4 hover:text-ink")}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      {projects.length === 0 ? (
        <EmptyState title={filter.key ? "Nada por aqui" : "Nenhum projeto em andamento"} action={filter.key ? undefined : <NewProjectButton variant="secondary" label="Criar o primeiro projeto" />}>
          {filter.key ? undefined : "Um projeto reúne tarefas, páginas e quadros em torno de um resultado."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="group flex h-full flex-col rounded-md border border-line bg-white p-5 transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-xl leading-snug text-ink group-hover:underline">{p.title}</h2>
                  <Badge tone={PROJECT_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                </div>
                {p.description ? <p className="mt-1.5 line-clamp-2 text-sm text-ink-3">{p.description}</p> : null}
                <div className="mt-auto pt-5">
                  <ProgressBar progress={p.progress} />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {p.areaName ? <span className="text-xs text-ink-4">{p.areaName}</span> : null}
                    {p.openTasks ? <span className="meta">{p.openTasks} abertas</span> : null}
                    {p.targetDate ? <span className={cn("meta", p.targetDate < ctx.today && p.status !== "completed" && "text-clay")}>meta {relativeDayLabel(p.targetDate, ctx.today)}</span> : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
