import { FileText } from "lucide-react"
import Link from "next/link"
import { CreateAndOpenButton } from "@/components/layout/create-buttons"
import { Page, PageHeader } from "@/components/layout/page"
import { SearchField } from "@/components/layout/search-field"
import { EmptyState } from "@/components/ui/empty"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { formatInstant } from "@/lib/domain/dates"
import { listPages } from "@/lib/services/pages"

export const metadata = { title: "Páginas" }

export default async function PagesPage({ searchParams }: PageProps<"/pages">) {
  const { q, show } = await searchParams
  const query = typeof q === "string" ? q.slice(0, 200) : ""
  const archived = show === "archived"
  const [pages, ctx] = await Promise.all([listPages({ query, archived }), getRequestContext()])
  return (
    <Page>
      <PageHeader eyebrow="Páginas" title="Notas e documentos" description="Estudos, referências, documentação de projetos. Cite tarefas e outras páginas com @." actions={<CreateAndOpenButton kind="page" label="Nova página" variant="primary" />}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
          <nav className="flex gap-1" aria-label="Filtro">
            {[
              ["", "Ativas"],
              ["archived", "Arquivadas"],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={key ? `/pages?show=${key}` : "/pages"}
                aria-current={(key === "archived") === archived ? "page" : undefined}
                className={cn("-mb-px border-b-2 px-2.5 py-2 text-sm", (key === "archived") === archived ? "border-cobalt text-ink" : "border-transparent text-ink-4 hover:text-ink")}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="pb-2">
            <SearchField placeholder="Buscar no título e no conteúdo" initial={query} />
          </div>
        </div>
      </PageHeader>
      {pages.length === 0 ? (
        <EmptyState title={query ? `Nada encontrado para “${query}”` : archived ? "Nenhuma página arquivada" : "Nenhuma página ainda"} action={query || archived ? undefined : <CreateAndOpenButton kind="page" label="Escrever a primeira" variant="secondary" />} />
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {pages.map((p) => {
            const snippet = p.snippet
            return (
              <li key={p.id}>
                <Link href={`/pages/${p.id}`} className="group flex items-start gap-4 py-4 hover:bg-white/60">
                  <FileText className="mt-1 size-4 shrink-0 text-ink-4" />
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-lg leading-snug text-ink group-hover:underline">{p.title || "Sem título"}</p>
                    {snippet || p.excerpt ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-3">{snippet ?? p.excerpt}</p> : null}
                    <div className="mt-1.5 flex flex-wrap gap-x-3">
                      {p.projectTitle ? <span className="text-xs text-ink-4">{p.projectTitle}</span> : null}
                      {p.areaName ? <span className="text-xs text-ink-4">{p.areaName}</span> : null}
                    </div>
                  </div>
                  <span className="meta shrink-0 pt-1.5">{formatInstant(p.updatedAt, ctx.timezone, { day: "numeric", month: "short" })}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}
