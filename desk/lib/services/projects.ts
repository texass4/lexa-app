import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { areas, boards, contentLinks, pages, projects, tasks } from "@/lib/db/schema"
import { normalizeForSearch } from "@/lib/domain/search"
import { projectProgress, type Progress } from "@/lib/domain/tasks"
import { PROJECT_STATUSES, projectSchema, updateProjectSchema } from "@/lib/validation"
import type { z } from "zod"
import { invalid, notFound } from "./errors"
import { defined, parse } from "./util"

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planejado",
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluído",
  archived: "Arquivado",
}

export type ProjectItem = {
  id: string
  title: string
  description: string
  status: ProjectStatus
  areaId: string | null
  areaName: string | null
  startDate: string | null
  targetDate: string | null
  createdAt: Date
  updatedAt: Date
  progress: Progress
  openTasks: number
}

const columns = {
  id: projects.id,
  title: projects.title,
  description: projects.description,
  status: projects.status,
  areaId: projects.areaId,
  areaName: areas.name,
  startDate: projects.startDate,
  targetDate: projects.targetDate,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
}

/** Contagem por status das tarefas de cada projeto, para o progresso. */
async function taskCounts(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, { status: (typeof tasks.status.enumValues)[number]; n: number }[]>()
  const db = await getDb()
  const rows = await db
    .select({ projectId: tasks.projectId, status: tasks.status, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(inArray(tasks.projectId, projectIds))
    .groupBy(tasks.projectId, tasks.status)
  const map = new Map<string, { status: (typeof tasks.status.enumValues)[number]; n: number }[]>()
  for (const r of rows) map.set(r.projectId!, [...(map.get(r.projectId!) ?? []), { status: r.status, n: r.n }])
  return map
}

function withProgress(row: Omit<ProjectItem, "progress" | "openTasks">, counts: { status: (typeof tasks.status.enumValues)[number]; n: number }[] = []): ProjectItem {
  const expanded = counts.flatMap((c) => Array.from({ length: c.n }, () => ({ status: c.status })))
  const openTasks = counts.filter((c) => c.status === "todo" || c.status === "in_progress").reduce((s, c) => s + c.n, 0)
  return { ...row, progress: projectProgress(expanded), openTasks }
}

export async function listProjects(filter: { status?: ProjectStatus[]; areaId?: string; includeArchived?: boolean } = {}): Promise<ProjectItem[]> {
  const db = await getDb()
  const where = []
  if (filter.status?.length) where.push(inArray(projects.status, filter.status))
  else if (!filter.includeArchived) where.push(ne(projects.status, "archived"))
  if (filter.areaId) where.push(eq(projects.areaId, filter.areaId))
  const rows = await db
    .select(columns)
    .from(projects)
    .leftJoin(areas, eq(areas.id, projects.areaId))
    .where(and(...where))
    .orderBy(sql`case ${projects.status} when 'active' then 0 when 'planned' then 1 when 'paused' then 2 when 'completed' then 3 else 4 end`, desc(projects.updatedAt))
  const counts = await taskCounts(rows.map((r) => r.id))
  return rows.map((r) => withProgress(r, counts.get(r.id)))
}

export async function getProject(id: string): Promise<ProjectItem | null> {
  const db = await getDb()
  const [row] = await db.select(columns).from(projects).leftJoin(areas, eq(areas.id, projects.areaId)).where(eq(projects.id, id))
  if (!row) return null
  const counts = await taskCounts([id])
  return withProgress(row, counts.get(id))
}

async function assertArea(areaId: string | null | undefined) {
  if (!areaId) return
  const db = await getDb()
  const [a] = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, areaId))
  if (!a) throw invalid("A área escolhida não existe mais.")
}

export async function createProject(input: z.input<typeof projectSchema>) {
  const data = parse(projectSchema, input)
  await assertArea(data.areaId)
  const db = await getDb()
  const [row] = await db
    .insert(projects)
    .values({
      title: data.title,
      description: data.description ?? "",
      status: data.status ?? "active",
      areaId: data.areaId ?? null,
      startDate: data.startDate ?? null,
      targetDate: data.targetDate ?? null,
      searchText: normalizeForSearch(data.title, data.description),
    })
    .returning({ id: projects.id })
  return (await getProject(row!.id))!
}

export async function updateProject(id: string, input: z.input<typeof updateProjectSchema>) {
  const patch = parse(updateProjectSchema, input)
  await assertArea(patch.areaId)
  const db = await getDb()
  const [current] = await db.select().from(projects).where(eq(projects.id, id))
  if (!current) throw notFound("Projeto")
  const next = { ...current, ...defined(patch) }
  if (next.startDate && next.targetDate && next.startDate > next.targetDate) throw invalid("O início precisa ser anterior à meta.")
  await db
    .update(projects)
    .set({ ...defined(patch), searchText: normalizeForSearch(next.title, next.description), updatedAt: new Date() })
    .where(eq(projects.id, id))
  return (await getProject(id))!
}

/**
 * Exclui o projeto sem apagar nada do que estava nele: tarefas, páginas e quadros ficam
 * sem projeto (chave estrangeira com `on delete set null`). Devolve quantos foram desvinculados.
 */
export async function deleteProject(id: string) {
  const db = await getDb()
  return db.transaction(async (tx) => {
    const [counts] = await tx
      .select({
        tasks: sql<number>`(select count(*) from ${tasks} where ${tasks.projectId} = ${id})::int`,
        pages: sql<number>`(select count(*) from ${pages} where ${pages.projectId} = ${id})::int`,
        boards: sql<number>`(select count(*) from ${boards} where ${boards.projectId} = ${id})::int`,
      })
      .from(sql`(select 1) as one`)
    const deleted = await tx.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id })
    if (deleted.length === 0) throw notFound("Projeto")
    await tx.delete(contentLinks).where(and(eq(contentLinks.targetType, "project"), eq(contentLinks.targetId, id)))
    return counts!
  })
}

/** Páginas e quadros do projeto (as tarefas vêm de `listTasks({ projectId })`). */
export async function projectRelations(id: string) {
  const db = await getDb()
  const [pageRows, boardRows] = await Promise.all([
    db
      .select({ id: pages.id, title: pages.title, updatedAt: pages.updatedAt })
      .from(pages)
      .where(and(eq(pages.projectId, id), isNull(pages.archivedAt)))
      .orderBy(desc(pages.updatedAt)),
    db
      .select({ id: boards.id, title: boards.title, updatedAt: boards.updatedAt })
      .from(boards)
      .where(and(eq(boards.projectId, id), isNull(boards.archivedAt)))
      .orderBy(desc(boards.updatedAt)),
  ])
  return { pages: pageRows, boards: boardRows }
}

export async function projectOptions() {
  const db = await getDb()
  return db
    .select({ id: projects.id, title: projects.title, status: projects.status, areaId: projects.areaId })
    .from(projects)
    .where(ne(projects.status, "archived"))
    .orderBy(asc(projects.title))
}
