import { Waypoints } from "lucide-react"
import Link from "next/link"
import { CreateAndOpenButton } from "@/components/layout/create-buttons"
import { Page, PageHeader } from "@/components/layout/page"
import { EmptyState } from "@/components/ui/empty"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { formatInstant } from "@/lib/domain/dates"
import { listBoards } from "@/lib/services/boards"

export const metadata = { title: "Quadros" }

export default async function BoardsPage({ searchParams }: PageProps<"/canvas">) {
  const { show } = await searchParams
  const archived = show === "archived"
  const [boards, ctx] = await Promise.all([listBoards({ archived }), getRequestContext()])
  return (
    <Page wide>
      <PageHeader
        eyebrow="Quadros visuais"
        title="Quadros"
        description="Desenhe fluxos, funis, processos e raciocínios. Traga tarefas, projetos e páginas reais para o quadro — eles continuam sendo os mesmos registros."
        actions={<CreateAndOpenButton kind="board" label="Novo quadro" variant="primary" />}
      >
        <nav className="flex gap-1 border-b border-line" aria-label="Filtro">
          {[
            ["", "Ativos"],
            ["archived", "Arquivados"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={key ? `/canvas?show=${key}` : "/canvas"}
              aria-current={(key === "archived") === archived ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-2.5 py-2 text-sm", (key === "archived") === archived ? "border-cobalt text-ink" : "border-transparent text-ink-4 hover:text-ink")}
            >
              {label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      {boards.length === 0 ? (
        <EmptyState title={archived ? "Nenhum quadro arquivado" : "Nenhum quadro ainda"} action={archived ? undefined : <CreateAndOpenButton kind="board" label="Criar o primeiro quadro" variant="secondary" />}>
          {archived ? undefined : "Um quadro branco infinito, ligado às suas tarefas e páginas."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((b) => (
            <li key={b.id}>
              <Link href={`/canvas/${b.id}`} className="group block overflow-hidden rounded-md border border-line bg-white transition-colors hover:border-cobalt">
                <div className="grid-paper relative flex h-32 items-center justify-center bg-paper/60">
                  <Waypoints className="size-6 text-ink-5 transition-colors group-hover:text-cobalt" />
                  <span className="meta absolute right-2 bottom-2">{b.elementCount} elementos</span>
                </div>
                <div className="border-t border-line-soft px-4 py-3">
                  <p className="truncate font-serif text-lg text-ink">{b.title || "Quadro sem título"}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-ink-4">{b.projectTitle ?? b.areaName ?? b.description ?? ""}</span>
                    <span className="meta shrink-0">{formatInstant(b.updatedAt, ctx.timezone, { day: "numeric", month: "short" })}</span>
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
