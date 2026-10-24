import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { inboxItems } from "@/lib/db/schema"
import type { LocalDate } from "@/lib/domain/dates"
import { textToDoc } from "@/lib/domain/doc"
import type { RefType } from "@/lib/domain/refs"
import { inboxCaptureSchema } from "@/lib/validation"
import type { z } from "zod"
import { invalid, notFound } from "./errors"
import { appendToEntry } from "./journal"
import { createPage } from "./pages"
import { createTask } from "./tasks"
import { parse } from "./util"

export type InboxKind = (typeof inboxItems.kind.enumValues)[number]
export type InboxItem = {
  id: string
  content: string
  kind: InboxKind
  processedAt: Date | null
  convertedType: RefType | null
  convertedId: string | null
  createdAt: Date
}

export async function listInbox(opts: { processed?: boolean; limit?: number } = {}): Promise<InboxItem[]> {
  const db = await getDb()
  return db
    .select({
      id: inboxItems.id,
      content: inboxItems.content,
      kind: inboxItems.kind,
      processedAt: inboxItems.processedAt,
      convertedType: inboxItems.convertedType,
      convertedId: inboxItems.convertedId,
      createdAt: inboxItems.createdAt,
    })
    .from(inboxItems)
    .where(opts.processed ? isNotNull(inboxItems.processedAt) : isNull(inboxItems.processedAt))
    .orderBy(opts.processed ? desc(inboxItems.processedAt) : asc(inboxItems.createdAt))
    .limit(opts.limit ?? 300)
}

export async function countInbox() {
  const db = await getDb()
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(inboxItems).where(isNull(inboxItems.processedAt))
  return row?.n ?? 0
}

export async function capture(input: z.input<typeof inboxCaptureSchema>) {
  const data = parse(inboxCaptureSchema, input)
  const db = await getDb()
  const [row] = await db
    .insert(inboxItems)
    .values({ content: data.content, kind: data.kind ?? "note" })
    .returning()
  return row!
}

async function getOpenItem(id: string) {
  const db = await getDb()
  const [item] = await db.select().from(inboxItems).where(eq(inboxItems.id, id))
  if (!item) throw notFound("Item da caixa de entrada")
  if (item.processedAt) throw invalid("Este item já foi organizado.")
  return item
}

async function markProcessed(id: string, converted: { type: RefType; id: string } | null) {
  const db = await getDb()
  const now = new Date()
  // Condição em processed_at: dois cliques rápidos não convertem o mesmo item duas vezes.
  const [row] = await db
    .update(inboxItems)
    .set({ processedAt: now, convertedType: converted?.type ?? null, convertedId: converted?.id ?? null, updatedAt: now })
    .where(and(eq(inboxItems.id, id), isNull(inboxItems.processedAt)))
    .returning({ id: inboxItems.id })
  return !!row
}

/** Primeira linha vira título; o resto, descrição. */
export function splitTitle(content: string): { title: string; rest: string } {
  const [first = "", ...rest] = content.trim().split(/\r?\n/)
  const title = first.trim().slice(0, 300) || "Sem título"
  const overflow = first.trim().length > 300 ? first.trim().slice(300) : ""
  return { title, rest: [overflow, ...rest].join("\n").trim() }
}

export async function convertToTask(id: string, overrides: { dueDate?: string | null; projectId?: string | null; areaId?: string | null } = {}) {
  const item = await getOpenItem(id)
  const { title, rest } = splitTitle(item.content)
  const task = await createTask({ title, description: rest, ...overrides })
  if (!(await markProcessed(id, { type: "task", id: task.id }))) throw invalid("Este item já foi organizado.")
  return task
}

export async function convertToPage(id: string) {
  const item = await getOpenItem(id)
  const { title, rest } = splitTitle(item.content)
  const page = await createPage({ title, content: textToDoc(rest) })
  if (!(await markProcessed(id, { type: "page", id: page.id }))) throw invalid("Este item já foi organizado.")
  return page
}

/** Leva a captura para o diário do dia como um parágrafo. */
export async function moveToJournal(id: string, date: LocalDate) {
  const item = await getOpenItem(id)
  const result = await appendToEntry(date, textToDoc(item.content).content ?? [])
  if (!result.id) throw new Error("Falha ao gravar no diário.")
  if (!(await markProcessed(id, { type: "journal", id: result.id }))) throw invalid("Este item já foi organizado.")
  return { id: result.id, date }
}

/** Marca como resolvido sem criar nada (ex.: ideia descartada). */
export async function dismissInboxItem(id: string) {
  await getOpenItem(id)
  await markProcessed(id, null)
}

export async function restoreInboxItem(id: string) {
  const db = await getDb()
  const [row] = await db
    .update(inboxItems)
    .set({ processedAt: null, convertedType: null, convertedId: null, updatedAt: new Date() })
    .where(and(eq(inboxItems.id, id), isNull(inboxItems.convertedId)))
    .returning({ id: inboxItems.id })
  if (!row) throw invalid("Itens convertidos continuam no registro criado; abra-o para editar.")
}

export async function updateInboxItem(id: string, content: string) {
  const data = parse(inboxCaptureSchema, { content })
  const db = await getDb()
  const [row] = await db.update(inboxItems).set({ content: data.content, updatedAt: new Date() }).where(eq(inboxItems.id, id)).returning()
  if (!row) throw notFound("Item da caixa de entrada")
  return row
}

export async function deleteInboxItem(id: string) {
  const db = await getDb()
  await db.delete(inboxItems).where(eq(inboxItems.id, id))
}
