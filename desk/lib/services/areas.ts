import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { areas, boards, contentLinks, pages, projects } from "@/lib/db/schema"
import { normalizeForSearch } from "@/lib/domain/search"
import { areaSchema, updateAreaSchema } from "@/lib/validation"
import type { z } from "zod"
import { notFound } from "./errors"
import { defined, parse } from "./util"

export type AreaItem = {
  id: string
  name: string
  description: string
  color: string
  position: number
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  openTasks: number
  activeProjects: number
  pages: number
}

export async function listAreas(opts: { includeArchived?: boolean } = {}): Promise<AreaItem[]> {
  const db = await getDb()
  return db
    .select({
      id: areas.id,
      name: areas.name,
      description: areas.description,
      color: areas.color,
      position: areas.position,
      archivedAt: areas.archivedAt,
      createdAt: areas.createdAt,
      updatedAt: areas.updatedAt,
      // Subconsultas correlacionadas com nomes qualificados: numa consulta de uma tabela só o
      // Drizzle escreve as colunas sem o nome da tabela, o que ficaria ambíguo aqui dentro.
      openTasks: sql<number>`(select count(*) from tasks t left join projects p on p.id = t.project_id
        where (t.area_id = "areas"."id" or p.area_id = "areas"."id") and t.status in ('todo', 'in_progress'))::int`,
      activeProjects: sql<number>`(select count(*) from projects p where p.area_id = "areas"."id" and p.status in ('active', 'planned', 'paused'))::int`,
      pages: sql<number>`(select count(*) from pages pg where pg.area_id = "areas"."id" and pg.archived_at is null)::int`,
    })
    .from(areas)
    .where(opts.includeArchived ? undefined : isNull(areas.archivedAt))
    .orderBy(sql`${areas.archivedAt} is not null`, asc(areas.position), asc(areas.name))
}

export async function getArea(id: string) {
  const db = await getDb()
  const [row] = await db.select().from(areas).where(eq(areas.id, id))
  return row ?? null
}

export async function areaOptions() {
  const db = await getDb()
  return db.select({ id: areas.id, name: areas.name, color: areas.color }).from(areas).where(isNull(areas.archivedAt)).orderBy(asc(areas.position), asc(areas.name))
}

export async function createArea(input: z.input<typeof areaSchema>) {
  const data = parse(areaSchema, input)
  const db = await getDb()
  const [{ max }] = (await db.select({ max: sql<number | null>`max(${areas.position})` }).from(areas)) as [{ max: number | null }]
  const [row] = await db
    .insert(areas)
    .values({
      name: data.name,
      description: data.description ?? "",
      color: data.color ?? "sage",
      position: (max ?? 0) + 1,
      searchText: normalizeForSearch(data.name, data.description),
    })
    .returning()
  return row!
}

export async function updateArea(id: string, input: z.input<typeof updateAreaSchema>) {
  const patch = parse(updateAreaSchema, input)
  const db = await getDb()
  const current = await getArea(id)
  if (!current) throw notFound("Área")
  const next = { ...current, ...defined(patch) }
  const [row] = await db
    .update(areas)
    .set({ ...defined(patch), searchText: normalizeForSearch(next.name, next.description), updatedAt: new Date() })
    .where(eq(areas.id, id))
    .returning()
  return row!
}

export async function setAreaArchived(id: string, archived: boolean) {
  const db = await getDb()
  const [row] = await db
    .update(areas)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(areas.id, id))
    .returning()
  if (!row) throw notFound("Área")
  return row
}

/** Troca a área de lugar com a vizinha (organização manual da lista). */
export async function moveArea(id: string, direction: "up" | "down") {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const list = await tx.select({ id: areas.id, position: areas.position }).from(areas).where(isNull(areas.archivedAt)).orderBy(asc(areas.position), asc(areas.name))
    const index = list.findIndex((a) => a.id === id)
    if (index < 0) throw notFound("Área")
    const swapWith = direction === "up" ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= list.length) return
    // Renumera para que posições repetidas não impeçam a troca.
    const reordered = [...list]
    ;[reordered[index], reordered[swapWith]] = [reordered[swapWith]!, reordered[index]!]
    for (const [i, area] of reordered.entries()) await tx.update(areas).set({ position: i + 1 }).where(eq(areas.id, area.id))
  })
}

/** Exclui a área; tarefas, projetos, páginas e quadros continuam existindo, só sem área. */
export async function deleteArea(id: string) {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(areas).where(eq(areas.id, id)).returning({ id: areas.id })
    if (deleted.length === 0) throw notFound("Área")
    await tx.delete(contentLinks).where(and(eq(contentLinks.targetType, "area"), eq(contentLinks.targetId, id)))
  })
}

export async function areaRelations(id: string) {
  const db = await getDb()
  const [pageRows, boardRows] = await Promise.all([
    db
      .select({ id: pages.id, title: pages.title, updatedAt: pages.updatedAt })
      .from(pages)
      .leftJoin(projects, eq(projects.id, pages.projectId))
      .where(and(isNull(pages.archivedAt), or(eq(pages.areaId, id), and(isNotNull(pages.projectId), eq(projects.areaId, id)))))
      .orderBy(desc(pages.updatedAt)),
    db
      .select({ id: boards.id, title: boards.title, updatedAt: boards.updatedAt })
      .from(boards)
      .leftJoin(projects, eq(projects.id, boards.projectId))
      .where(and(isNull(boards.archivedAt), or(eq(boards.areaId, id), and(isNotNull(boards.projectId), eq(projects.areaId, id)))))
      .orderBy(desc(boards.updatedAt)),
  ])
  return { pages: pageRows, boards: boardRows }
}
