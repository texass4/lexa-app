import { desc, isNull, ne, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { boards, journalEntries, pages, projects, tasks } from "@/lib/db/schema"
import { addDays, type LocalDate } from "@/lib/domain/dates"
import { docToText, excerpt } from "@/lib/domain/doc"
import { hrefFor, type RefType } from "@/lib/domain/refs"
import { listBoards } from "./boards"
import { countInbox } from "./inbox"
import { getEntry } from "./journal"
import { listProjects } from "./projects"
import { listTasks } from "./tasks"

export type ActivityItem = { type: RefType; id: string; title: string; href: string; updatedAt: Date; verb: string }
export type Deadline = { type: "task" | "project"; id: string; title: string; href: string; date: LocalDate; meta?: string }

/** Tudo que o dashboard mostra, lido dos registros reais. Nada é calculado "para enfeitar". */
export async function getDashboard(today: LocalDate) {
  const horizon = addDays(today, 14)
  const [todayTasks, overdue, upcomingTasks, activeProjects, journal, recentBoards, inboxCount, activity, upcomingProjects] = await Promise.all([
    listTasks({ status: ["todo", "in_progress"], dueFrom: today, dueTo: today }),
    listTasks({ status: ["todo", "in_progress"], dueTo: addDays(today, -1) }),
    listTasks({ status: ["todo", "in_progress"], dueFrom: addDays(today, 1), dueTo: horizon }, { limit: 12 }),
    listProjects({ status: ["active"] }),
    getEntry(today),
    listBoards({ limit: 4 }),
    countInbox(),
    recentActivity(8),
    projectDeadlines(today, horizon),
  ])
  const deadlines: Deadline[] = [
    ...upcomingTasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, href: hrefFor("task", t.id), date: t.dueDate!, meta: t.projectTitle ?? undefined })),
    ...upcomingProjects,
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  // Concluídas hoje continuam visíveis no bloco "Hoje", riscadas, para dar a sensação de avanço.
  const doneToday = await listTasks({ status: ["done"], dueFrom: today, dueTo: today })
  return {
    todayTasks: [...todayTasks, ...doneToday],
    overdue,
    deadlines: deadlines.slice(0, 10),
    activeProjects,
    journal: journal ? { id: journal.id, excerpt: excerpt(docToText(journal.content), 220), updatedAt: journal.updatedAt } : null,
    recentBoards,
    inboxCount,
    activity,
  }
}

async function projectDeadlines(from: LocalDate, to: LocalDate): Promise<Deadline[]> {
  const db = await getDb()
  const rows = await db
    .select({ id: projects.id, title: projects.title, date: projects.targetDate })
    .from(projects)
    .where(sql`${projects.status} in ('active', 'planned') and ${projects.targetDate} between ${from} and ${to}`)
  return rows.map((p) => ({ type: "project" as const, id: p.id, title: p.title, href: hrefFor("project", p.id), date: p.date!, meta: "Meta do projeto" }))
}

/** Últimos registros alterados, de todos os módulos. */
export async function recentActivity(limit: number): Promise<ActivityItem[]> {
  const db = await getDb()
  const [t, p, j, b, pr] = await Promise.all([
    db
      .select({ id: tasks.id, title: tasks.title, updatedAt: tasks.updatedAt, createdAt: tasks.createdAt, status: tasks.status, completedAt: tasks.completedAt })
      .from(tasks)
      .where(ne(tasks.status, "archived"))
      .orderBy(desc(tasks.updatedAt))
      .limit(limit),
    db.select({ id: pages.id, title: pages.title, updatedAt: pages.updatedAt, createdAt: pages.createdAt }).from(pages).where(isNull(pages.archivedAt)).orderBy(desc(pages.updatedAt)).limit(limit),
    db.select({ id: journalEntries.id, date: journalEntries.entryDate, updatedAt: journalEntries.updatedAt }).from(journalEntries).where(sql`length(${journalEntries.contentText}) > 0`).orderBy(desc(journalEntries.updatedAt)).limit(limit),
    db.select({ id: boards.id, title: boards.title, updatedAt: boards.updatedAt, createdAt: boards.createdAt }).from(boards).where(isNull(boards.archivedAt)).orderBy(desc(boards.updatedAt)).limit(limit),
    db.select({ id: projects.id, title: projects.title, updatedAt: projects.updatedAt, createdAt: projects.createdAt }).from(projects).where(ne(projects.status, "archived")).orderBy(desc(projects.updatedAt)).limit(limit),
  ])
  const created = (c: Date, u: Date) => Math.abs(u.getTime() - c.getTime()) < 2000
  const items: ActivityItem[] = [
    ...t.map((x) => ({
      type: "task" as const,
      id: x.id,
      title: x.title,
      href: hrefFor("task", x.id),
      updatedAt: x.updatedAt,
      verb: x.status === "done" && x.completedAt && Math.abs(x.completedAt.getTime() - x.updatedAt.getTime()) < 2000 ? "concluída" : created(x.createdAt, x.updatedAt) ? "criada" : "editada",
    })),
    ...p.map((x) => ({ type: "page" as const, id: x.id, title: x.title || "Sem título", href: hrefFor("page", x.id), updatedAt: x.updatedAt, verb: created(x.createdAt, x.updatedAt) ? "criada" : "editada" })),
    ...j.map((x) => ({ type: "journal" as const, id: x.id, title: `Diário de ${x.date.split("-").reverse().slice(0, 2).join("/")}`, href: hrefFor("journal", x.id, { entryDate: x.date }), updatedAt: x.updatedAt, verb: "escrito" })),
    ...b.map((x) => ({ type: "board" as const, id: x.id, title: x.title || "Quadro sem título", href: hrefFor("board", x.id), updatedAt: x.updatedAt, verb: created(x.createdAt, x.updatedAt) ? "criado" : "editado" })),
    ...pr.map((x) => ({ type: "project" as const, id: x.id, title: x.title, href: hrefFor("project", x.id), updatedAt: x.updatedAt, verb: created(x.createdAt, x.updatedAt) ? "criado" : "editado" })),
  ]
  return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit)
}

