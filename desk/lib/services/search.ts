import { and, desc, isNull, ne, sql, type AnyColumn } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { areas, boards, journalEntries, pages, projects, tasks } from "@/lib/db/schema"
import { formatLocalDate } from "@/lib/domain/dates"
import { hrefFor, type RefType } from "@/lib/domain/refs"
import { likePattern, snippetAround } from "@/lib/domain/search"
import { STATUS_LABEL, taskCode } from "@/lib/domain/tasks"
import { PROJECT_STATUS_LABEL } from "./projects"

export type SearchResult = {
  type: RefType
  id: string
  title: string
  href: string
  meta?: string
  snippet?: string | null
}

const ALL: RefType[] = ["task", "project", "area", "page", "journal", "board"]

/**
 * Busca global por título e conteúdo, sem diferenciar acentos nem maiúsculas. Cada tipo é
 * consultado no próprio registro (nada de índice paralelo com cópias).
 */
export async function globalSearch(query: string, opts: { types?: RefType[]; limitPerType?: number; includeArchived?: boolean } = {}): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length === 0) return []
  if (q.length > 200) return []
  const db = await getDb()
  const pattern = likePattern(q)
  const limit = opts.limitPerType ?? 6
  const types = new Set(opts.types ?? ALL)
  const match = (column: AnyColumn) => sql`${column} like ${pattern}`
  // Quem tem o termo no título vem antes de quem só o tem no conteúdo.
  const titleFirst = (title: AnyColumn) => sql`case when lower(${title}) like lower(${"%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"}) then 0 else 1 end`

  const jobs: Promise<SearchResult[]>[] = []
  if (types.has("task")) {
    jobs.push(
      db
        .select({ id: tasks.id, number: tasks.number, title: tasks.title, status: tasks.status, description: tasks.description })
        .from(tasks)
        .where(and(match(tasks.searchText), opts.includeArchived ? undefined : ne(tasks.status, "archived")))
        .orderBy(titleFirst(tasks.title), desc(tasks.updatedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((t) => ({
            type: "task" as const,
            id: t.id,
            title: t.title,
            href: hrefFor("task", t.id),
            meta: `${taskCode(t.number)} · ${STATUS_LABEL[t.status]}`,
            snippet: snippetAround(t.description, q),
          })),
        ),
    )
  }
  if (types.has("project")) {
    jobs.push(
      db
        .select({ id: projects.id, title: projects.title, status: projects.status, description: projects.description })
        .from(projects)
        .where(match(projects.searchText))
        .orderBy(titleFirst(projects.title), desc(projects.updatedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((p) => ({ type: "project" as const, id: p.id, title: p.title, href: hrefFor("project", p.id), meta: PROJECT_STATUS_LABEL[p.status], snippet: snippetAround(p.description, q) })),
        ),
    )
  }
  if (types.has("area")) {
    jobs.push(
      db
        .select({ id: areas.id, name: areas.name, description: areas.description })
        .from(areas)
        .where(and(match(areas.searchText), isNull(areas.archivedAt)))
        .orderBy(titleFirst(areas.name))
        .limit(limit)
        .then((rows) => rows.map((a) => ({ type: "area" as const, id: a.id, title: a.name, href: hrefFor("area", a.id), snippet: snippetAround(a.description, q) }))),
    )
  }
  if (types.has("page")) {
    jobs.push(
      db
        .select({ id: pages.id, title: pages.title, text: pages.contentText })
        .from(pages)
        .where(and(match(pages.searchText), opts.includeArchived ? undefined : isNull(pages.archivedAt)))
        .orderBy(titleFirst(pages.title), desc(pages.updatedAt))
        .limit(limit)
        .then((rows) => rows.map((p) => ({ type: "page" as const, id: p.id, title: p.title || "Sem título", href: hrefFor("page", p.id), snippet: snippetAround(p.text, q) }))),
    )
  }
  if (types.has("journal")) {
    jobs.push(
      db
        .select({ id: journalEntries.id, date: journalEntries.entryDate, text: journalEntries.contentText })
        .from(journalEntries)
        .where(and(match(journalEntries.searchText), sql`length(${journalEntries.contentText}) > 0`))
        .orderBy(desc(journalEntries.entryDate))
        .limit(limit)
        .then((rows) =>
          rows.map((j) => ({
            type: "journal" as const,
            id: j.id,
            title: formatLocalDate(j.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
            href: hrefFor("journal", j.id, { entryDate: j.date }),
            snippet: snippetAround(j.text, q),
          })),
        ),
    )
  }
  if (types.has("board")) {
    jobs.push(
      db
        .select({ id: boards.id, title: boards.title, description: boards.description })
        .from(boards)
        .where(and(match(boards.searchText), opts.includeArchived ? undefined : isNull(boards.archivedAt)))
        .orderBy(titleFirst(boards.title), desc(boards.updatedAt))
        .limit(limit)
        .then((rows) => rows.map((b) => ({ type: "board" as const, id: b.id, title: b.title || "Quadro sem título", href: hrefFor("board", b.id), snippet: snippetAround(b.description, q) }))),
    )
  }
  return (await Promise.all(jobs)).flat()
}
