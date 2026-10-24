import { and, eq, inArray, isNull } from "drizzle-orm"
import { getDb, type Executor } from "@/lib/db/client"
import { areas, boardElements, boards, contentLinks, journalEntries, pages, projects, tasks } from "@/lib/db/schema"
import { formatLocalDate, type LocalDate } from "@/lib/domain/dates"
import { excerpt } from "@/lib/domain/doc"
import { hrefFor, refKey, type Ref, type RefSummary, type RefType } from "@/lib/domain/refs"
import { isOverdue, projectProgress, STATUS_LABEL, taskCode } from "@/lib/domain/tasks"
import { PROJECT_STATUS_LABEL } from "./projects"

/*
 * Resolve referências (tipo + id) para o estado atual de cada registro. É assim que o canvas,
 * o editor e o dashboard mostram sempre o título e o status de agora, sem guardar cópias.
 * Uma referência que não aparece no resultado aponta para algo que foi excluído.
 */

export async function resolveRefs(refs: Ref[], today: LocalDate): Promise<Record<string, RefSummary>> {
  const db = await getDb()
  const byType = new Map<RefType, string[]>()
  for (const ref of refs) byType.set(ref.type, [...new Set([...(byType.get(ref.type) ?? []), ref.id])])
  const out: Record<string, RefSummary> = {}
  const put = (s: RefSummary) => (out[refKey(s)] = s)

  const jobs: Promise<void>[] = []
  const ids = (type: RefType) => byType.get(type) ?? []

  if (ids("task").length) {
    jobs.push(
      db
        .select({
          id: tasks.id,
          number: tasks.number,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          projectTitle: projects.title,
        })
        .from(tasks)
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(inArray(tasks.id, ids("task")))
        .then((rows) =>
          rows.forEach((t) =>
            put({
              type: "task",
              id: t.id,
              title: t.title,
              href: hrefFor("task", t.id),
              status: STATUS_LABEL[t.status],
              statusTone: t.status === "done" ? "done" : t.status === "archived" ? "muted" : t.status === "in_progress" ? "active" : "neutral",
              priority: t.priority,
              dueDate: t.dueDate,
              overdue: isOverdue(t, today),
              meta: [taskCode(t.number), t.projectTitle].filter(Boolean).join(" · "),
              archived: t.status === "archived",
            }),
          ),
        ),
    )
  }
  if (ids("project").length) {
    jobs.push(
      (async () => {
        const rows = await db
          .select({ id: projects.id, title: projects.title, status: projects.status, targetDate: projects.targetDate })
          .from(projects)
          .where(inArray(projects.id, ids("project")))
        const counts = await db
          .select({ projectId: tasks.projectId, status: tasks.status })
          .from(tasks)
          .where(inArray(tasks.projectId, ids("project")))
        for (const p of rows) {
          put({
            type: "project",
            id: p.id,
            title: p.title,
            href: hrefFor("project", p.id),
            status: PROJECT_STATUS_LABEL[p.status],
            statusTone: p.status === "active" ? "active" : p.status === "completed" ? "done" : p.status === "archived" ? "muted" : "neutral",
            dueDate: p.targetDate,
            progress: projectProgress(counts.filter((c) => c.projectId === p.id)),
            archived: p.status === "archived",
          })
        }
      })(),
    )
  }
  if (ids("area").length) {
    jobs.push(
      db
        .select({ id: areas.id, name: areas.name, archivedAt: areas.archivedAt })
        .from(areas)
        .where(inArray(areas.id, ids("area")))
        .then((rows) => rows.forEach((a) => put({ type: "area", id: a.id, title: a.name, href: hrefFor("area", a.id), archived: !!a.archivedAt }))),
    )
  }
  if (ids("page").length) {
    jobs.push(
      db
        .select({ id: pages.id, title: pages.title, text: pages.contentText, updatedAt: pages.updatedAt, archivedAt: pages.archivedAt })
        .from(pages)
        .where(inArray(pages.id, ids("page")))
        .then((rows) =>
          rows.forEach((p) =>
            put({
              type: "page",
              id: p.id,
              title: p.title || "Sem título",
              href: hrefFor("page", p.id),
              excerpt: excerpt(p.text, 140),
              archived: !!p.archivedAt,
              status: p.archivedAt ? "Arquivada" : undefined,
              statusTone: p.archivedAt ? "muted" : undefined,
            }),
          ),
        ),
    )
  }
  if (ids("journal").length) {
    jobs.push(
      db
        .select({ id: journalEntries.id, date: journalEntries.entryDate, text: journalEntries.contentText })
        .from(journalEntries)
        .where(inArray(journalEntries.id, ids("journal")))
        .then((rows) =>
          rows.forEach((j) =>
            put({
              type: "journal",
              id: j.id,
              title: formatLocalDate(j.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
              href: hrefFor("journal", j.id, { entryDate: j.date }),
              dueDate: j.date,
              excerpt: excerpt(j.text, 140),
            }),
          ),
        ),
    )
  }
  if (ids("board").length) {
    jobs.push(
      db
        .select({ id: boards.id, title: boards.title, archivedAt: boards.archivedAt })
        .from(boards)
        .where(inArray(boards.id, ids("board")))
        .then((rows) => rows.forEach((b) => put({ type: "board", id: b.id, title: b.title || "Quadro sem título", href: hrefFor("board", b.id), archived: !!b.archivedAt }))),
    )
  }
  await Promise.all(jobs)
  return out
}

/** Grava as referências encontradas num documento (substitui as anteriores da mesma origem). */
export async function syncContentLinks(tx: Executor, source: { type: "page" | "journal"; id: string }, refs: Ref[]) {
  await tx.delete(contentLinks).where(and(eq(contentLinks.sourceType, source.type), eq(contentLinks.sourceId, source.id)))
  const unique = refs.filter((r) => !(r.type === source.type && r.id === source.id))
  if (unique.length === 0) return
  await tx
    .insert(contentLinks)
    .values(unique.map((r) => ({ sourceType: source.type, sourceId: source.id, targetType: r.type, targetId: r.id })))
    .onConflictDoNothing()
}

export type Backlink = { type: RefType; id: string; title: string; href: string }

/** Onde um registro é mencionado: páginas, entradas do diário e quadros. */
export async function backlinks(target: Ref): Promise<Backlink[]> {
  const db = await getDb()
  const [pageRows, journalRows, boardRows] = await Promise.all([
    db
      .select({ id: pages.id, title: pages.title })
      .from(contentLinks)
      .innerJoin(pages, eq(pages.id, contentLinks.sourceId))
      .where(and(eq(contentLinks.sourceType, "page"), eq(contentLinks.targetType, target.type), eq(contentLinks.targetId, target.id), isNull(pages.archivedAt))),
    db
      .select({ id: journalEntries.id, date: journalEntries.entryDate })
      .from(contentLinks)
      .innerJoin(journalEntries, eq(journalEntries.id, contentLinks.sourceId))
      .where(and(eq(contentLinks.sourceType, "journal"), eq(contentLinks.targetType, target.type), eq(contentLinks.targetId, target.id))),
    target.type === "task" || target.type === "project" || target.type === "page" || target.type === "journal"
      ? db
          .selectDistinct({ id: boards.id, title: boards.title })
          .from(boardElements)
          .innerJoin(boards, eq(boards.id, boardElements.boardId))
          .where(and(eq(boardElements.refType, target.type), eq(boardElements.refId, target.id), isNull(boards.archivedAt)))
      : Promise.resolve([] as { id: string; title: string }[]),
  ])
  return [
    ...pageRows.map((p) => ({ type: "page" as const, id: p.id, title: p.title || "Sem título", href: hrefFor("page", p.id) })),
    ...journalRows
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((j) => ({ type: "journal" as const, id: j.id, title: `Diário · ${formatLocalDate(j.date, { day: "numeric", month: "short", year: "numeric" })}`, href: hrefFor("journal", j.id, { entryDate: j.date }) })),
    ...boardRows.map((b) => ({ type: "board" as const, id: b.id, title: b.title || "Quadro sem título", href: hrefFor("board", b.id) })),
  ]
}
