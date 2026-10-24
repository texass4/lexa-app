import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm"
import { getDb, type Executor } from "@/lib/db/client"
import { areas, boardConnections, boardElements, boards, contentLinks, projects, type Viewport } from "@/lib/db/schema"
import { normalizeForSearch } from "@/lib/domain/search"
import type { RefType } from "@/lib/domain/refs"
import { boardSchema, boardSnapshotSchema, type BoardConnectionInput, type BoardElementInput, type BoardSnapshotInput } from "@/lib/validation"
import type { z } from "zod"
import { invalid, notFound } from "./errors"
import { defined, parse } from "./util"

export type BoardElementKind = (typeof boardElements.kind.enumValues)[number]
export type BoardElementDto = {
  id: string
  kind: BoardElementKind
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  parentId: string | null
  data: Record<string, unknown>
  ref: { type: RefType; id: string } | null
}
export type BoardConnectionDto = BoardConnectionInput
export type BoardItem = {
  id: string
  title: string
  description: string
  projectId: string | null
  projectTitle: string | null
  areaId: string | null
  areaName: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  elementCount: number
}
export type BoardDetail = BoardItem & { viewport: Viewport; version: number; elements: BoardElementDto[]; connections: BoardConnectionDto[] }

const columns = {
  id: boards.id,
  title: boards.title,
  description: boards.description,
  projectId: boards.projectId,
  projectTitle: projects.title,
  areaId: boards.areaId,
  areaName: areas.name,
  archivedAt: boards.archivedAt,
  createdAt: boards.createdAt,
  updatedAt: boards.updatedAt,
  elementCount: sql<number>`(select count(*) from ${boardElements} where ${boardElements.boardId} = ${boards.id})::int`,
}

export async function listBoards(filter: { archived?: boolean; projectId?: string; limit?: number } = {}): Promise<BoardItem[]> {
  const db = await getDb()
  const where = [filter.archived ? isNotNull(boards.archivedAt) : isNull(boards.archivedAt)]
  if (filter.projectId) where.push(eq(boards.projectId, filter.projectId))
  return db
    .select(columns)
    .from(boards)
    .leftJoin(projects, eq(projects.id, boards.projectId))
    .leftJoin(areas, eq(areas.id, boards.areaId))
    .where(and(...where))
    .orderBy(desc(boards.updatedAt))
    .limit(filter.limit ?? 200)
}

export async function getBoard(id: string): Promise<BoardDetail | null> {
  const db = await getDb()
  const [row] = await db
    .select({ ...columns, viewport: boards.viewport, version: boards.version })
    .from(boards)
    .leftJoin(projects, eq(projects.id, boards.projectId))
    .leftJoin(areas, eq(areas.id, boards.areaId))
    .where(eq(boards.id, id))
  if (!row) return null
  const [elements, connections] = await Promise.all([
    db.select().from(boardElements).where(eq(boardElements.boardId, id)).orderBy(asc(boardElements.zIndex), asc(boardElements.createdAt)),
    db.select().from(boardConnections).where(eq(boardConnections.boardId, id)).orderBy(asc(boardConnections.createdAt)),
  ])
  return {
    ...row,
    elements: elements.map((e) => ({
      id: e.id,
      kind: e.kind,
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
      zIndex: e.zIndex,
      parentId: e.parentId,
      data: e.data,
      ref: e.refType && e.refId ? { type: e.refType, id: e.refId } : null,
    })),
    connections: connections.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceHandle: c.sourceHandle,
      targetHandle: c.targetHandle,
      label: c.label,
      style: c.style as BoardConnectionInput["style"],
    })),
  }
}

export async function createBoard(input: z.input<typeof boardSchema> = {}) {
  const data = parse(boardSchema, input)
  const db = await getDb()
  const title = data.title ?? ""
  const [row] = await db
    .insert(boards)
    .values({ title, description: data.description ?? "", projectId: data.projectId ?? null, areaId: data.areaId ?? null, searchText: boardSearchText(title, data.description ?? "", "") })
    .returning({ id: boards.id })
  return (await getBoard(row!.id))!
}

export async function updateBoardMeta(id: string, input: z.input<typeof boardSchema>) {
  const data = parse(boardSchema, input)
  const db = await getDb()
  const [current] = await db.select({ title: boards.title, description: boards.description }).from(boards).where(eq(boards.id, id))
  if (!current) throw notFound("Quadro")
  const elements = await db.select({ data: boardElements.data }).from(boardElements).where(eq(boardElements.boardId, id))
  const text = elements.map((e) => dataText(e.data)).filter(Boolean).join("\n")
  await db
    .update(boards)
    .set({ ...defined(data), searchText: boardSearchText(data.title ?? current.title, data.description ?? current.description, text), updatedAt: new Date() })
    .where(eq(boards.id, id))
}

const boardSearchText = (title: string, description: string, elementsText: string) => normalizeForSearch(title, description, elementsText)

function dataText(d: Record<string, unknown>): string {
  return [d.title, d.body, d.text].filter((v): v is string => typeof v === "string" && v.length > 0).join(" ")
}

/** Confere a consistência interna do retrato do quadro antes de gravar. */
function checkSnapshot(snapshot: BoardSnapshotInput) {
  const ids = new Set<string>()
  const kinds = new Map<string, string>()
  for (const e of snapshot.elements) {
    if (ids.has(e.id)) throw invalid("Há elementos repetidos no quadro.")
    ids.add(e.id)
    kinds.set(e.id, e.kind)
  }
  for (const e of snapshot.elements) {
    if (e.parentId === null) continue
    if (e.parentId === e.id || kinds.get(e.parentId) !== "frame" || e.kind === "frame") throw invalid("Agrupamento inválido no quadro.")
  }
  const connIds = new Set<string>()
  for (const c of snapshot.connections) {
    if (connIds.has(c.id)) throw invalid("Há conexões repetidas no quadro.")
    connIds.add(c.id)
    if (!ids.has(c.sourceId) || !ids.has(c.targetId)) throw invalid("Uma conexão aponta para um elemento que não está no quadro.")
  }
}

export type BoardSaveResult = { ok: true; version: number; updatedAt: string } | { ok: false; conflict: true; version: number; updatedAt: string }

/**
 * Grava o quadro inteiro (elementos, conexões e câmera) numa transação. Só a geometria e a
 * aparência são gravadas: registros vinculados (tarefas, páginas…) nunca são alterados aqui.
 */
export async function saveBoardSnapshot(id: string, input: BoardSnapshotInput): Promise<BoardSaveResult> {
  const snapshot = parse(boardSnapshotSchema, input)
  checkSnapshot(snapshot)
  const db = await getDb()
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({ version: boards.version, title: boards.title, description: boards.description, updatedAt: boards.updatedAt })
      .from(boards)
      .where(eq(boards.id, id))
      .for("update")
    if (!board) throw notFound("Quadro")
    if (!snapshot.force && board.version !== snapshot.baseVersion) return { ok: false, conflict: true, version: board.version, updatedAt: board.updatedAt.toISOString() }

    const elementIds = snapshot.elements.map((e) => e.id)
    const connectionIds = snapshot.connections.map((c) => c.id)
    if (elementIds.length) {
      const foreign = await tx
        .select({ id: boardElements.id })
        .from(boardElements)
        .where(and(inArray(boardElements.id, elementIds), ne(boardElements.boardId, id)))
        .limit(1)
      if (foreign.length) throw invalid("Um dos elementos pertence a outro quadro.")
    }
    if (connectionIds.length) {
      const foreign = await tx
        .select({ id: boardConnections.id })
        .from(boardConnections)
        .where(and(inArray(boardConnections.id, connectionIds), ne(boardConnections.boardId, id)))
        .limit(1)
      if (foreign.length) throw invalid("Uma das conexões pertence a outro quadro.")
    }

    await tx
      .delete(boardConnections)
      .where(and(eq(boardConnections.boardId, id), connectionIds.length ? notInArray(boardConnections.id, connectionIds) : undefined))
    await tx.delete(boardElements).where(and(eq(boardElements.boardId, id), elementIds.length ? notInArray(boardElements.id, elementIds) : undefined))

    const now = new Date()
    await upsertElements(tx, id, snapshot.elements, now)
    await upsertConnections(tx, id, snapshot.connections, now)

    const text = snapshot.elements.map((e) => dataText(e.data as Record<string, unknown>)).filter(Boolean).join("\n")
    const [row] = await tx
      .update(boards)
      .set({
        viewport: snapshot.viewport,
        version: board.version + 1,
        updatedAt: now,
        searchText: boardSearchText(board.title, board.description, text),
      })
      .where(eq(boards.id, id))
      .returning({ version: boards.version, updatedAt: boards.updatedAt })
    return { ok: true, version: row!.version, updatedAt: row!.updatedAt.toISOString() }
  })
}

const CHUNK = 400
const chunks = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK))

async function upsertElements(tx: Executor, boardId: string, elements: BoardElementInput[], now: Date) {
  // Frames primeiro: a ordem não importa para o banco, mas mantém a leitura previsível.
  for (const part of chunks(elements)) {
    await tx
      .insert(boardElements)
      .values(
        part.map((e) => ({
          id: e.id,
          boardId,
          kind: e.kind,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          zIndex: e.zIndex,
          parentId: e.parentId,
          data: e.data as Record<string, unknown>,
          refType: e.ref?.type ?? null,
          refId: e.ref?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: boardElements.id,
        set: {
          kind: sql`excluded.kind`,
          x: sql`excluded.x`,
          y: sql`excluded.y`,
          width: sql`excluded.width`,
          height: sql`excluded.height`,
          zIndex: sql`excluded.z_index`,
          parentId: sql`excluded.parent_id`,
          data: sql`excluded.data`,
          refType: sql`excluded.ref_type`,
          refId: sql`excluded.ref_id`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: sql`${boardElements.boardId} = excluded.board_id`,
      })
  }
}

async function upsertConnections(tx: Executor, boardId: string, connections: BoardConnectionInput[], now: Date) {
  for (const part of chunks(connections)) {
    await tx
      .insert(boardConnections)
      .values(part.map((c) => ({ ...c, boardId, createdAt: now, updatedAt: now })))
      .onConflictDoUpdate({
        target: boardConnections.id,
        set: {
          sourceId: sql`excluded.source_id`,
          targetId: sql`excluded.target_id`,
          sourceHandle: sql`excluded.source_handle`,
          targetHandle: sql`excluded.target_handle`,
          label: sql`excluded.label`,
          style: sql`excluded.style`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: sql`${boardConnections.boardId} = excluded.board_id`,
      })
  }
}

export async function setBoardArchived(id: string, archived: boolean) {
  const db = await getDb()
  const [row] = await db
    .update(boards)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(boards.id, id))
    .returning({ id: boards.id })
  if (!row) throw notFound("Quadro")
}

export async function deleteBoard(id: string) {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(boards).where(eq(boards.id, id)).returning({ id: boards.id })
    if (deleted.length === 0) throw notFound("Quadro")
    await tx.delete(contentLinks).where(and(eq(contentLinks.targetType, "board"), eq(contentLinks.targetId, id)))
  })
}
