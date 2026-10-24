import { and, asc, desc, eq, exists, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm"
import { getDb, type Executor } from "@/lib/db/client"
import { areas, contentLinks, projects, subtasks, tags, taskTags, tasks, type Recurrence } from "@/lib/db/schema"
import type { LocalDate } from "@/lib/domain/dates"
import { likePattern, normalizeForSearch } from "@/lib/domain/search"
import { completionForStatus, nextOccurrenceDates, positionBetween, type TaskPriority, type TaskStatus } from "@/lib/domain/tasks"
import {
  createTaskSchema,
  moveTaskSchema,
  subtaskSchema,
  taskFilterSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type TaskFilter,
  type UpdateTaskInput,
} from "@/lib/validation"
import { invalid, notFound } from "./errors"
import { defined, parse } from "./util"

export type TaskTag = { id: string; name: string }
export type TaskItem = {
  id: string
  number: number
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  startDate: LocalDate | null
  dueDate: LocalDate | null
  areaId: string | null
  areaName: string | null
  projectId: string | null
  projectTitle: string | null
  estimateMinutes: number | null
  recurrence: Recurrence | null
  completedAt: Date | null
  position: number
  createdAt: Date
  updatedAt: Date
  tags: TaskTag[]
  subtaskTotal: number
  subtaskDone: number
}
export type Subtask = { id: string; title: string; done: boolean; position: number }
export type TaskDetail = TaskItem & { subtasks: Subtask[] }

const taskColumns = {
  id: tasks.id,
  number: tasks.number,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  startDate: tasks.startDate,
  dueDate: tasks.dueDate,
  areaId: tasks.areaId,
  areaName: areas.name,
  projectId: tasks.projectId,
  projectTitle: projects.title,
  estimateMinutes: tasks.estimateMinutes,
  recurrence: tasks.recurrence,
  completedAt: tasks.completedAt,
  position: tasks.position,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
}

const searchTextFor = (t: { title: string; description: string }) => normalizeForSearch(t.title, t.description)

async function decorate(db: Executor, rows: Omit<TaskItem, "tags" | "subtaskTotal" | "subtaskDone">[]): Promise<TaskItem[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [tagRows, subRows] = await Promise.all([
    db
      .select({ taskId: taskTags.taskId, id: tags.id, name: tags.name })
      .from(taskTags)
      .innerJoin(tags, eq(tags.id, taskTags.tagId))
      .where(inArray(taskTags.taskId, ids))
      .orderBy(asc(tags.name)),
    db
      .select({
        taskId: subtasks.taskId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${subtasks.done})::int`,
      })
      .from(subtasks)
      .where(inArray(subtasks.taskId, ids))
      .groupBy(subtasks.taskId),
  ])
  const tagMap = new Map<string, TaskTag[]>()
  for (const t of tagRows) tagMap.set(t.taskId, [...(tagMap.get(t.taskId) ?? []), { id: t.id, name: t.name }])
  const subMap = new Map(subRows.map((s) => [s.taskId, s]))
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [], subtaskTotal: subMap.get(r.id)?.total ?? 0, subtaskDone: subMap.get(r.id)?.done ?? 0 }))
}

function baseQuery(db: Executor) {
  return db.select(taskColumns).from(tasks).leftJoin(projects, eq(projects.id, tasks.projectId)).leftJoin(areas, eq(areas.id, tasks.areaId))
}

/** Lista de tarefas com filtros. Sem filtro de status, as arquivadas ficam de fora. */
export async function listTasks(filterInput: TaskFilter = {}, opts: { limit?: number } = {}): Promise<TaskItem[]> {
  const filter = parse(taskFilterSchema, filterInput)
  const db = await getDb()
  const where: SQL[] = []
  where.push(filter.status?.length ? inArray(tasks.status, filter.status) : ne(tasks.status, "archived"))
  if (filter.priority?.length) where.push(inArray(tasks.priority, filter.priority))
  if (filter.projectId === "none") where.push(isNull(tasks.projectId))
  else if (filter.projectId) where.push(eq(tasks.projectId, filter.projectId))
  if (filter.areaId === "none") where.push(and(isNull(tasks.areaId), or(isNull(tasks.projectId), isNull(projects.areaId)))!)
  // A tarefa pertence à área diretamente ou pelo projeto.
  else if (filter.areaId) where.push(or(eq(tasks.areaId, filter.areaId), eq(projects.areaId, filter.areaId))!)
  if (filter.tag) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskTags)
          .innerJoin(tags, eq(tags.id, taskTags.tagId))
          .where(and(eq(taskTags.taskId, tasks.id), sql`lower(${tags.name}) = lower(${filter.tag})`)),
      ),
    )
  }
  if (filter.dueFrom) where.push(gte(tasks.dueDate, filter.dueFrom))
  if (filter.dueTo) where.push(lte(tasks.dueDate, filter.dueTo))
  if (filter.noDueDate) where.push(isNull(tasks.dueDate))
  if (filter.query) where.push(sql`${tasks.searchText} like ${likePattern(filter.query)}`)

  const rows = await baseQuery(db)
    .where(and(...where))
    .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.priority), asc(tasks.number))
    .limit(opts.limit ?? 2000)
  return decorate(db, rows)
}

export async function getTask(id: string): Promise<TaskDetail | null> {
  const db = await getDb()
  const [row] = await baseQuery(db).where(eq(tasks.id, id))
  if (!row) return null
  const [item] = await decorate(db, [row])
  const subs = await db
    .select({ id: subtasks.id, title: subtasks.title, done: subtasks.done, position: subtasks.position })
    .from(subtasks)
    .where(eq(subtasks.taskId, id))
    .orderBy(asc(subtasks.position), asc(subtasks.createdAt))
  return { ...item!, subtasks: subs }
}

async function assertLinks(db: Executor, input: { projectId?: string | null; areaId?: string | null }) {
  if (input.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId))
    if (!p) throw invalid("O projeto escolhido não existe mais.")
  }
  if (input.areaId) {
    const [a] = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, input.areaId))
    if (!a) throw invalid("A área escolhida não existe mais.")
  }
}

/** Associa as tags pelo nome (cria as que ainda não existem). Nomes repetidos contam uma vez. */
async function setTags(db: Executor, taskId: string, names: string[]) {
  const byKey = new Map<string, string>()
  for (const name of names.map((n) => n.trim()).filter(Boolean)) if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name)
  const unique = [...byKey.values()]
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId))
  if (unique.length === 0) return
  await db
    .insert(tags)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing()
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(
      inArray(
        sql`lower(${tags.name})`,
        unique.map((n) => n.toLowerCase()),
      ),
    )
  await db.insert(taskTags).values(rows.map((r) => ({ taskId, tagId: r.id })))
}

export async function createTask(input: CreateTaskInput, now = new Date()): Promise<TaskDetail> {
  const data = parse(createTaskSchema, input)
  const db = await getDb()
  const id = await db.transaction(async (tx) => {
    await assertLinks(tx, data)
    const status = data.status ?? "todo"
    const [row] = await tx
      .insert(tasks)
      .values({
        title: data.title,
        description: data.description ?? "",
        status,
        priority: data.priority ?? "medium",
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        areaId: data.areaId ?? null,
        projectId: data.projectId ?? null,
        estimateMinutes: data.estimateMinutes ?? null,
        recurrence: data.recurrence ?? null,
        completedAt: status === "done" ? now : null,
        position: now.getTime(),
        searchText: searchTextFor({ title: data.title, description: data.description ?? "" }),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tasks.id })
    if (data.tags?.length) await setTags(tx, row!.id, data.tags)
    if (data.subtasks?.length) {
      await tx.insert(subtasks).values(data.subtasks.map((title, i) => ({ taskId: row!.id, title, position: (i + 1) * 1024 })))
    }
    return row!.id
  })
  return (await getTask(id))!
}

export type UpdateTaskResult = { task: TaskDetail; spawned: TaskDetail | null }

/**
 * Atualiza campos da tarefa. Mudar o status aplica as regras de conclusão: concluir registra
 * a data, reabrir a apaga, e concluir uma tarefa recorrente cria a próxima ocorrência.
 */
export async function updateTask(id: string, patchInput: UpdateTaskInput, ctx: { today: LocalDate; now?: Date }): Promise<UpdateTaskResult> {
  const patch = parse(updateTaskSchema, patchInput)
  const now = ctx.now ?? new Date()
  const db = await getDb()
  const spawnedId = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update")
    if (!current) throw notFound("Tarefa")
    await assertLinks(tx, patch)

    const next = { ...current, ...defined(patch) }
    if ((next.startDate ?? null) && (next.dueDate ?? null) && next.startDate! > next.dueDate!) {
      throw invalid("A data de início precisa ser anterior ao prazo.")
    }
    const statusChanged = patch.status !== undefined && patch.status !== current.status
    const completedAt = patch.status !== undefined ? completionForStatus(patch.status, current, now) : current.completedAt
    const { tags: tagNames, ...fields } = patch
    let recurrence = patch.recurrence !== undefined ? patch.recurrence : current.recurrence

    let spawned: string | null = null
    if (statusChanged && patch.status === "done" && recurrence) {
      spawned = await spawnNextOccurrence(tx, { ...current, ...defined(fields), recurrence }, recurrence, ctx.today, now)
      // A regra passa para a nova ocorrência; esta fica concluída sem repetir de novo.
      recurrence = null
    }

    await tx
      .update(tasks)
      .set({
        ...defined(fields),
        recurrence,
        completedAt,
        searchText: searchTextFor({ title: next.title, description: next.description }),
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
    if (tagNames) await setTags(tx, id, tagNames)
    return spawned
  })
  const task = (await getTask(id))!
  return { task, spawned: spawnedId ? await getTask(spawnedId) : null }
}

async function spawnNextOccurrence(
  tx: Executor,
  source: typeof tasks.$inferSelect,
  recurrence: Recurrence,
  today: LocalDate,
  now: Date,
): Promise<string> {
  const dates = nextOccurrenceDates(source, recurrence, today)
  const [row] = await tx
    .insert(tasks)
    .values({
      title: source.title,
      description: source.description,
      status: "todo",
      priority: source.priority,
      startDate: dates.startDate,
      dueDate: dates.dueDate,
      areaId: source.areaId,
      projectId: source.projectId,
      estimateMinutes: source.estimateMinutes,
      recurrence,
      position: now.getTime(),
      searchText: source.searchText,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id })
  const tagRows = await tx.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, source.id))
  if (tagRows.length) await tx.insert(taskTags).values(tagRows.map((t) => ({ taskId: row!.id, tagId: t.tagId })))
  const subRows = await tx.select().from(subtasks).where(eq(subtasks.taskId, source.id))
  if (subRows.length) {
    await tx.insert(subtasks).values(subRows.map((s) => ({ taskId: row!.id, title: s.title, position: s.position, done: false })))
  }
  return row!.id
}

export const setTaskStatus = (id: string, status: TaskStatus, ctx: { today: LocalDate; now?: Date }) => updateTask(id, { status }, ctx)

/** Kanban: muda a coluna (status) e a posição entre dois vizinhos. */
export async function moveTask(id: string, input: { status: TaskStatus; beforeId?: string | null; afterId?: string | null }, ctx: { today: LocalDate }) {
  const move = parse(moveTaskSchema, input)
  const db = await getDb()
  const neighbours = [move.beforeId, move.afterId].filter((v): v is string => !!v)
  const rows = neighbours.length ? await db.select({ id: tasks.id, position: tasks.position }).from(tasks).where(inArray(tasks.id, neighbours)) : []
  const pos = (nid: string | null | undefined) => (nid ? (rows.find((r) => r.id === nid)?.position ?? null) : null)
  const position = positionBetween(pos(move.beforeId), pos(move.afterId))
  const result = await updateTask(id, { status: move.status }, ctx)
  await db.update(tasks).set({ position }).where(eq(tasks.id, id))
  return { ...result, task: { ...result.task, position } }
}

/** Exclui a tarefa. Vínculos no canvas passam a aparecer como "referência indisponível". */
export async function deleteTask(id: string): Promise<void> {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id })
    if (deleted.length === 0) throw notFound("Tarefa")
    await tx.delete(contentLinks).where(and(eq(contentLinks.targetType, "task"), eq(contentLinks.targetId, id)))
  })
}

// ——— Subtarefas ——————————————————————————————————————————————————————————————

async function touchTask(db: Executor, taskId: string) {
  await db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId))
}

export async function addSubtask(taskId: string, input: { title: string }) {
  const { title } = parse(subtaskSchema, input)
  const db = await getDb()
  return db.transaction(async (tx) => {
    const [task] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId))
    if (!task) throw notFound("Tarefa")
    const [{ max }] = (await tx
      .select({ max: sql<number | null>`max(${subtasks.position})` })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))) as [{ max: number | null }]
    const [row] = await tx
      .insert(subtasks)
      .values({ taskId, title, position: (max ?? 0) + 1024 })
      .returning()
    await touchTask(tx, taskId)
    return row!
  })
}

export async function updateSubtask(id: string, patch: { title?: string; done?: boolean }) {
  const db = await getDb()
  const values: Partial<typeof subtasks.$inferInsert> = { updatedAt: new Date() }
  if (patch.title !== undefined) values.title = parse(subtaskSchema, { title: patch.title }).title
  if (patch.done !== undefined) values.done = Boolean(patch.done)
  const [row] = await db.update(subtasks).set(values).where(eq(subtasks.id, id)).returning()
  if (!row) throw notFound("Subtarefa")
  await touchTask(db, row.taskId)
  return row
}

export async function deleteSubtask(id: string) {
  const db = await getDb()
  const [row] = await db.delete(subtasks).where(eq(subtasks.id, id)).returning()
  if (!row) throw notFound("Subtarefa")
  await touchTask(db, row.taskId)
}

// ——— Tags ————————————————————————————————————————————————————————————————————

export async function listTags(): Promise<(TaskTag & { count: number })[]> {
  const db = await getDb()
  return db
    .select({ id: tags.id, name: tags.name, count: sql<number>`count(${taskTags.taskId})::int` })
    .from(tags)
    .leftJoin(taskTags, eq(taskTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(sql`lower(${tags.name})`))
}

export async function renameTag(id: string, name: string) {
  const clean = name.trim()
  if (!clean || clean.length > 40) throw invalid("Use um nome de 1 a 40 caracteres.")
  const db = await getDb()
  const [row] = await db.update(tags).set({ name: clean }).where(eq(tags.id, id)).returning()
  if (!row) throw notFound("Tag")
  return row
}

export async function deleteTag(id: string) {
  const db = await getDb()
  await db.delete(tags).where(eq(tags.id, id))
}

/** Contagens para a navegação e o dashboard. */
export async function countOpenTasks(today: LocalDate) {
  const db = await getDb()
  const [row] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})::int`,
      today: sql<number>`count(*) filter (where ${tasks.dueDate} = ${today})::int`,
      open: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(inArray(tasks.status, ["todo", "in_progress"]))
  return row!
}
