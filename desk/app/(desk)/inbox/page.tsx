import Link from "next/link"
import { InboxCapture, InboxItemRow, ProcessedRow } from "@/components/inbox/inbox-items"
import { Page, PageHeader } from "@/components/layout/page"
import { EmptyState } from "@/components/ui/empty"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { refKey, type Ref } from "@/lib/domain/refs"
import { listInbox } from "@/lib/services/inbox"
import { resolveRefs } from "@/lib/services/refs"

export const metadata = { title: "Caixa de entrada" }

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { show } = await searchParams
  const processed = show === "processed"
  const [items, ctx] = await Promise.all([listInbox({ processed }), getRequestContext()])
  const refs = processed ? items.filter((i) => i.convertedType && i.convertedId).map((i) => ({ type: i.convertedType!, id: i.convertedId! }) as Ref) : []
  const summaries = refs.length ? await resolveRefs(refs, ctx.today) : {}

  return (
    <Page>
      <PageHeader eyebrow="Caixa de entrada" title={processed ? "Já organizados" : "Para organizar"} description="Capture sem pensar em onde guardar. Depois, transforme cada item em tarefa, página ou registro do diário.">
        <nav className="flex gap-1 border-b border-line" aria-label="Filtro">
          {[
            ["", "Para organizar"],
            ["processed", "Já organizados"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={key ? `/inbox?show=${key}` : "/inbox"}
              aria-current={(key === "processed") === processed ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-2.5 py-2 text-sm", (key === "processed") === processed ? "border-cobalt text-ink" : "border-transparent text-ink-4 hover:text-ink")}
            >
              {label}
            </Link>
          ))}
        </nav>
      </PageHeader>

      {!processed ? <InboxCapture /> : null}

      <div className="mt-8">
        {items.length === 0 ? (
          processed ? (
            <EmptyState title="Nada organizado ainda">Itens convertidos ou resolvidos aparecem aqui, com o link para o registro criado.</EmptyState>
          ) : (
            <EmptyState title="Caixa de entrada vazia">Tudo organizado. Use o campo acima, a tecla C ou o botão + para capturar algo novo.</EmptyState>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) =>
              processed ? (
                <ProcessedRow
                  key={item.id}
                  item={item}
                  timezone={ctx.timezone}
                  target={item.convertedType && item.convertedId ? (summaries[refKey({ type: item.convertedType, id: item.convertedId })] ?? null) : undefined}
                />
              ) : (
                <InboxItemRow key={item.id} item={item} timezone={ctx.timezone} />
              ),
            )}
          </ul>
        )}
      </div>
    </Page>
  )
}
