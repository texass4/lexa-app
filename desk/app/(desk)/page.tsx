import { ArrowUpRight, BookOpen, FolderKanban, Plus, Waypoints } from "lucide-react"
import Link from "next/link"
import { QuickCapture } from "@/components/dashboard/quick-capture"
import { NewTaskButton } from "@/components/tasks/new-task-button"
import { Page, SectionTitle } from "@/components/layout/page"
import { REF_ICON } from "@/components/shell/ref-icons"
import { TaskList } from "@/components/tasks/task-row"
import { EmptyState } from "@/components/ui/empty"
import { ProgressBar } from "@/components/ui/progress"
import { getRequestContext } from "@/lib/context"
import { formatInstant, formatLocalDate, relativeDayLabel } from "@/lib/domain/dates"
import { getDashboard } from "@/lib/services/dashboard"

export const metadata = { title: "Início" }

function greeting(hour: number) {
  if (hour < 5) return "Boa noite"
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

export default async function DashboardPage() {
  const ctx = await getRequestContext()
  const d = await getDashboard(ctx.today)
  const dateLine = formatLocalDate(ctx.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const openToday = d.todayTasks.filter((t) => t.status !== "done").length

  return (
    <Page wide>
      <header className="mb-12 flex flex-col gap-7">
        <div>
          <p className="eyebrow">{dateLine}</p>
          <h1 className="mt-3 font-serif text-[2.4rem] leading-[1.05] tracking-tight text-ink md:text-[3.1rem]">
            {greeting(ctx.hour)}
            {ctx.ownerName ? `, ${ctx.ownerName}` : ""}.
          </h1>
          <p className="mt-3 max-w-xl text-[0.9375rem] text-ink-3">
            {openToday === 0 && d.overdue.length === 0
              ? "Nada pendente para hoje. Bom momento para planejar ou escrever."
              : [openToday ? `${openToday} ${openToday === 1 ? "tarefa" : "tarefas"} para hoje` : null, d.overdue.length ? `${d.overdue.length} em atraso` : null].filter(Boolean).join(" · ") + "."}
            {d.inboxCount > 0 ? (
              <>
                {" "}
                <Link href="/inbox" className="text-cobalt-ink underline decoration-cobalt/40 underline-offset-2 hover:decoration-cobalt">
                  {d.inboxCount} {d.inboxCount === 1 ? "item" : "itens"} na caixa de entrada
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
        <div className="max-w-3xl">
          <QuickCapture today={ctx.today} />
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-14">
        <div className="flex flex-col gap-12">
          <section aria-labelledby="hoje">
            <SectionTitle index="01" title={<span id="hoje">Hoje</span>} count={d.todayTasks.length || undefined} action={<NewTaskButton defaults={{ dueDate: ctx.today }} label="Tarefa" />} />
            <TaskList
              tasks={d.todayTasks}
              today={ctx.today}
              options={{ hideDue: true }}
              empty={
                <EmptyState compact title="Nenhuma tarefa para hoje">
                  Dê um prazo de hoje a uma tarefa ou capture uma nova acima.
                </EmptyState>
              }
            />
          </section>

          {d.overdue.length > 0 ? (
            <section aria-labelledby="atrasadas">
              <SectionTitle
                index="02"
                title={
                  <span id="atrasadas" className="text-clay">
                    Atrasadas
                  </span>
                }
                count={d.overdue.length}
                action={
                  <Link href="/tasks?view=overdue" className="meta hover:text-ink">
                    ver todas →
                  </Link>
                }
              />
              <TaskList tasks={d.overdue.slice(0, 8)} today={ctx.today} />
            </section>
          ) : null}

          <section aria-labelledby="prazos">
            <SectionTitle
              index={d.overdue.length ? "03" : "02"}
              title={<span id="prazos">Próximos prazos</span>}
              action={
                <Link href="/planning" className="meta hover:text-ink">
                  planejamento →
                </Link>
              }
            />
            {d.deadlines.length === 0 ? (
              <EmptyState compact title="Sem prazos nas próximas duas semanas">
                Prazos de tarefas e metas de projetos aparecem aqui.
              </EmptyState>
            ) : (
              <ol className="relative border-l border-line pl-5">
                {d.deadlines.map((item) => {
                  const Icon = REF_ICON[item.type]
                  return (
                    <li key={`${item.type}:${item.id}`} className="relative pb-3 last:pb-0">
                      <span className="absolute top-2 -left-[23.5px] size-[7px] rounded-full border border-ink-4 bg-paper" aria-hidden />
                      <Link href={item.href} className="group flex items-baseline gap-3 rounded-sm py-0.5">
                        <span className="meta w-24 shrink-0 text-ink-3">{relativeDayLabel(item.date, ctx.today)}</span>
                        <Icon className="size-3.5 shrink-0 translate-y-0.5 text-ink-4" />
                        <span className="min-w-0 flex-1 truncate text-ink group-hover:underline">{item.title}</span>
                        {item.meta ? <span className="hidden truncate text-xs text-ink-4 sm:inline">{item.meta}</span> : null}
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {d.activity.length >= 3 ? (
            <section aria-labelledby="atividade">
              <SectionTitle title={<span id="atividade">Atividade recente</span>} />
              <ul className="flex flex-col">
                {d.activity.map((a) => {
                  const Icon = REF_ICON[a.type]
                  return (
                    <li key={`${a.type}:${a.id}`}>
                      <Link href={a.href} className="group flex items-center gap-3 rounded-sm py-1.5 text-sm">
                        <Icon className="size-3.5 text-ink-4" />
                        <span className="min-w-0 flex-1 truncate text-ink-2 group-hover:text-ink group-hover:underline">{a.title}</span>
                        <span className="hidden text-xs text-ink-4 sm:inline">{a.verb}</span>
                        <span className="meta shrink-0 text-right whitespace-nowrap sm:w-28">{formatInstant(a.updatedAt, ctx.timezone)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-10">
          <section aria-labelledby="diario">
            <SectionTitle title={<span id="diario">Diário de hoje</span>} />
            <Link
              href={`/journal/${ctx.today}`}
              className="group block rounded-md border border-line bg-white px-5 py-4 transition-colors hover:border-line-strong"
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-lg text-ink">{formatLocalDate(ctx.today, { day: "numeric", month: "long" })}</span>
                <BookOpen className="size-4 text-ink-4 transition-colors group-hover:text-cobalt" />
              </div>
              {d.journal?.excerpt ? (
                <p className="mt-2 line-clamp-4 font-serif text-[0.975rem] leading-relaxed text-ink-3">{d.journal.excerpt}</p>
              ) : (
                <p className="mt-2 text-sm text-ink-4">Ainda não há nada escrito hoje. Comece pelo que está na cabeça.</p>
              )}
              <span className="meta mt-3 inline-flex items-center gap-1 text-cobalt-ink">
                {d.journal ? "continuar escrevendo" : "escrever"} <ArrowUpRight className="size-3" />
              </span>
            </Link>
          </section>

          <section aria-labelledby="projetos">
            <SectionTitle
              title={<span id="projetos">Projetos ativos</span>}
              count={d.activeProjects.length || undefined}
              action={
                <Link href="/projects" className="meta hover:text-ink">
                  todos →
                </Link>
              }
            />
            {d.activeProjects.length === 0 ? (
              <EmptyState
                compact
                title="Nenhum projeto ativo"
                action={
                  <Link href="/projects?new=1" className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line bg-white px-2.5 text-xs hover:border-line-strong">
                    <Plus className="size-3.5" /> Criar projeto
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col gap-1">
                {d.activeProjects.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="group block rounded-sm px-2 py-2 -mx-2 hover:bg-white">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="size-3.5 text-ink-4" />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink group-hover:underline">{p.title}</span>
                        {p.areaName ? <span className="truncate text-xs text-ink-4">{p.areaName}</span> : null}
                      </div>
                      <ProgressBar progress={p.progress} className="mt-1.5 pl-5.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="quadros">
            <SectionTitle
              title={<span id="quadros">Quadros recentes</span>}
              action={
                <Link href="/canvas" className="meta hover:text-ink">
                  todos →
                </Link>
              }
            />
            {d.recentBoards.length === 0 ? (
              <EmptyState compact title="Nenhum quadro ainda">
                Desenhe fluxos, ideias e processos ligados às suas tarefas.
              </EmptyState>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {d.recentBoards.map((b) => (
                  <li key={b.id}>
                    <Link href={`/canvas/${b.id}`} className="grid-paper group flex h-24 flex-col justify-between rounded-md border border-line bg-white p-3 transition-colors hover:border-cobalt">
                      <Waypoints className="size-4 text-ink-4 group-hover:text-cobalt" />
                      <div>
                        <p className="truncate text-sm text-ink">{b.title || "Quadro sem título"}</p>
                        <p className="meta">{b.elementCount} elementos</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </Page>
  )
}
