import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DocumentEditor } from "@/components/editor/document-editor"
import { Backlinks } from "@/components/layout/backlinks"
import { SearchField } from "@/components/layout/search-field"
import { cn } from "@/lib/cn"
import { getRequestContext } from "@/lib/context"
import { addDays, addMonths, diffDays, formatLocalDate, isLocalDate, monthGrid, startOfMonth, weekdayName } from "@/lib/domain/dates"
import { EMPTY_DOC, extractRefs } from "@/lib/domain/doc"
import { resolveRefs } from "@/lib/services/refs"
import { adjacentEntries, entryDatesBetween, getEntry, listEntries } from "@/lib/services/journal"

export async function generateMetadata({ params }: PageProps<"/journal/[date]">) {
  const { date } = await params
  return { title: isLocalDate(date) ? `Diário · ${formatLocalDate(date, { day: "numeric", month: "short", year: "numeric" })}` : "Diário" }
}

export default async function JournalDayPage({ params, searchParams }: PageProps<"/journal/[date]">) {
  const { date } = await params
  const { q } = await searchParams
  if (!isLocalDate(date)) notFound()
  const query = typeof q === "string" ? q.slice(0, 200) : ""
  const ctx = await getRequestContext()
  const month = startOfMonth(date)
  const grid = monthGrid(month, ctx.weekStartsOn)
  const [entry, adjacent, history, written] = await Promise.all([getEntry(date), adjacentEntries(date), listEntries({ query, limit: query ? 40 : 30 }), entryDatesBetween(grid[0]![0]!, grid[grid.length - 1]![6]!)])
  const content = entry?.content ?? EMPTY_DOC
  const refs = await resolveRefs(extractRefs(content), ctx.today)
  const isToday = date === ctx.today
  const distance = diffDays(ctx.today, date)
  const relative = isToday ? "Hoje" : distance === -1 ? "Ontem" : distance === 1 ? "Amanhã" : distance < 0 ? `Há ${-distance} dias` : `Daqui a ${distance} dias`

  const navBtn = "flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-white hover:text-ink"
  return (
    <div className="mx-auto grid w-full grid-cols-[minmax(0,1fr)] max-w-[1200px] gap-10 px-4 pt-4 pb-32 sm:px-8 md:px-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
      <article className="mx-auto w-full max-w-[42rem] lg:pl-6">
        <nav aria-label="Navegar entre dias" className="mb-2 flex items-center gap-0.5">
          {adjacent.previous ? (
            <Link href={`/journal/${adjacent.previous}`} className={navBtn} aria-label="Entrada anterior com texto" title="Entrada anterior com texto">
              <ChevronsLeft className="size-4" />
            </Link>
          ) : null}
          <Link href={`/journal/${addDays(date, -1)}`} className={navBtn} aria-label="Dia anterior" title="Dia anterior">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={`/journal/${addDays(date, 1)}`} className={navBtn} aria-label="Dia seguinte" title="Dia seguinte">
            <ChevronRight className="size-4" />
          </Link>
          {adjacent.next ? (
            <Link href={`/journal/${adjacent.next}`} className={navBtn} aria-label="Próxima entrada com texto" title="Próxima entrada com texto">
              <ChevronsRight className="size-4" />
            </Link>
          ) : null}
          {!isToday ? (
            <Link href={`/journal/${ctx.today}`} className="ml-2 rounded-sm px-2 py-1 text-xs text-cobalt-ink hover:bg-white">
              Ir para hoje
            </Link>
          ) : null}
        </nav>
        <DocumentEditor
          key={date}
          saveUrl={`/api/journal/${date}`}
          draftKey={`journal:${date}`}
          initialContent={content}
          initialVersion={entry?.version ?? 0}
          initialRefs={refs}
          autofocus={isToday}
          placeholder={isToday ? "Como foi o dia? O que está na cabeça? (/ para blocos, @ para citar)" : "Escreva sobre este dia…"}
          header={
            <header className="mb-8">
              <p className="eyebrow">
                {relative} · {weekdayName(date)}
              </p>
              <h1 className="mt-2 font-serif text-[2.4rem] leading-[1.1] tracking-tight text-ink md:text-[2.8rem]">{formatLocalDate(date, { day: "numeric", month: "long", year: "numeric" })}</h1>
              {!entry ? <p className="mt-2 text-sm text-ink-4">A entrada deste dia é criada assim que você começar a escrever.</p> : null}
            </header>
          }
        />
      </article>
      <aside className="flex flex-col gap-8 lg:pt-12">
        <section aria-label="Calendário do diário">
          <div className="mb-2 flex items-center justify-between">
            <Link href={`/journal/${addMonths(month, -1)}`} className="rounded-xs p-1 text-ink-4 hover:text-ink" aria-label="Mês anterior">
              <ChevronLeft className="size-3.5" />
            </Link>
            <span className="text-xs font-medium text-ink-2 capitalize">{formatLocalDate(month, { month: "long", year: "numeric" })}</span>
            <Link href={`/journal/${addMonths(month, 1)}`} className="rounded-xs p-1 text-ink-4 hover:text-ink" aria-label="Próximo mês">
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-px text-center">
            {grid[0]!.map((d) => (
              <span key={d} className="meta pb-1 text-[10px]">
                {weekdayName(d, "short").slice(0, 1).toUpperCase()}
              </span>
            ))}
            {grid.flat().map((d) => (
              <Link
                key={d}
                href={`/journal/${d}`}
                aria-label={formatLocalDate(d, { day: "numeric", month: "long" })}
                aria-current={d === date ? "date" : undefined}
                className={cn(
                  "relative flex h-7 items-center justify-center rounded-xs font-mono text-[11px] tabular-nums",
                  d === date ? "bg-ink text-paper" : d === ctx.today ? "text-cobalt-ink ring-1 ring-cobalt/50 ring-inset" : d.slice(0, 7) === month.slice(0, 7) ? "text-ink-2 hover:bg-white" : "text-ink-5 hover:bg-white",
                )}
              >
                {Number(d.slice(8))}
                {written.includes(d) && d !== date ? <span className="absolute bottom-0.5 size-1 rounded-full bg-cobalt" aria-hidden /> : null}
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="Histórico">
          <h2 className="eyebrow mb-2">Histórico</h2>
          <SearchField placeholder="Buscar no diário" initial={query} className="mb-3" />
          {history.length === 0 ? (
            <p className="text-sm text-ink-4">{query ? "Nada encontrado." : "Nenhuma entrada escrita ainda."}</p>
          ) : (
            <ol className="flex flex-col">
              {history.map((h) => (
                <li key={h.id}>
                  <Link href={`/journal/${h.entryDate}${query ? `?q=${encodeURIComponent(query)}` : ""}`} className={cn("block rounded-sm px-2 py-1.5 -mx-2 hover:bg-white", h.entryDate === date && "bg-white")}>
                    <span className="meta block text-ink-3">{formatLocalDate(h.entryDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="line-clamp-2 font-serif text-sm text-ink-2">{h.snippet ?? h.excerpt}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
        {entry ? <Backlinks target={{ type: "journal", id: entry.id }} /> : null}
      </aside>
    </div>
  )
}
