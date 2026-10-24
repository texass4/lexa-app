import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Backlinks } from "@/components/layout/backlinks"
import { DocumentEditor } from "@/components/editor/document-editor"
import { PageMeta, PageTitle } from "@/components/pages/page-meta"
import { getRequestContext } from "@/lib/context"
import { extractRefs } from "@/lib/domain/doc"
import { formatInstant } from "@/lib/domain/dates"
import { UUID_RE } from "@/lib/domain/refs"
import { getPage } from "@/lib/services/pages"
import { resolveRefs } from "@/lib/services/refs"

export async function generateMetadata({ params }: PageProps<"/pages/[id]">) {
  const { id } = await params
  const page = UUID_RE.test(id) ? await getPage(id) : null
  return { title: page?.title || "Página" }
}

export default async function PageEditorPage({ params }: PageProps<"/pages/[id]">) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const [page, ctx] = await Promise.all([getPage(id), getRequestContext()])
  if (!page) notFound()
  const refs = await resolveRefs(extractRefs(page.content), ctx.today)
  return (
    <div className="mx-auto grid w-full grid-cols-[minmax(0,1fr)] max-w-[1200px] gap-10 px-4 pt-4 pb-32 sm:px-8 md:px-12 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
      <article className="mx-auto w-full max-w-[44rem] lg:pl-6">
        <div className="mb-2 flex items-center gap-2">
          <Link href={page.projectId ? `/projects/${page.projectId}` : "/pages"} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" /> {page.projectTitle ?? "Páginas"}
          </Link>
        </div>
        {/* key: cada página tem seu próprio editor e rascunho */}
        <DocumentEditor
          key={page.id}
          saveUrl={`/api/pages/${page.id}/content`}
          draftKey={`page:${page.id}`}
          initialContent={page.content}
          initialVersion={page.version}
          initialRefs={refs}
          autofocus={!page.title && page.excerpt === ""}
          header={
            <>
              <PageTitle page={page} />
              <PageMeta page={page} />
            </>
          }
        />
      </article>
      <aside className="flex flex-col gap-8 lg:pt-24">
        <Backlinks target={{ type: "page", id: page.id }} />
        <section>
          <h2 className="eyebrow mb-2">Registro</h2>
          <dl className="flex flex-col gap-1.5 text-xs text-ink-3">
            <div className="flex justify-between gap-3">
              <dt>Criada</dt>
              <dd className="meta">{formatInstant(page.createdAt, ctx.timezone, { day: "numeric", month: "short", year: "numeric" })}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Atualizada</dt>
              <dd className="meta">{formatInstant(page.updatedAt, ctx.timezone)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-4">
            Digite <kbd className="font-mono">/</kbd> para blocos, <kbd className="font-mono">@</kbd> para citar registros. Alt+Shift+↑/↓ move o bloco.
          </p>
        </section>
      </aside>
    </div>
  )
}
