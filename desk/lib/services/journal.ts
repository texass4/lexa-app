import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { contentLinks, journalEntries } from "@/lib/db/schema"
import type { LocalDate } from "@/lib/domain/dates"
import { appendToDoc, EMPTY_DOC, excerpt, isDocEmpty, type DocNode } from "@/lib/domain/doc"
import { likePattern, normalizeForSearch, snippetAround } from "@/lib/domain/search"
import { localDateSchema, saveDocSchema } from "@/lib/validation"
import type { z } from "zod"
import { prepareDoc, type SaveResult } from "./documents"
import { syncContentLinks } from "./refs"
import { parse } from "./util"

export type JournalEntry = { id: string; entryDate: LocalDate; content: DocNode; version: number; createdAt: Date; updatedAt: Date }
export type JournalListItem = { id: string; entryDate: LocalDate; excerpt: string; updatedAt: Date }

const searchTextFor = (date: LocalDate, text: string) => normalizeForSearch(date, text)

export async function getEntry(dateInput: LocalDate): Promise<JournalEntry | null> {
  const date = parse(localDateSchema, dateInput)
  const db = await getDb()
  const [row] = await db
    .select({
      id: journalEntries.id,
      entryDate: journalEntries.entryDate,
      content: journalEntries.content,
      version: journalEntries.version,
      createdAt: journalEntries.createdAt,
      updatedAt: journalEntries.updatedAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.entryDate, date))
  return row ? { ...row, content: row.content as DocNode } : null
}

export async function getEntryById(id: string) {
  const db = await getDb()
  const [row] = await db.select({ id: journalEntries.id, entryDate: journalEntries.entryDate }).from(journalEntries).where(eq(journalEntries.id, id))
  return row ?? null
}

/**
 * Salva a entrada do dia. Não existe entrada vazia criada só por abrir o dia: ela nasce no
 * primeiro salvamento com conteúdo (baseVersion 0 = "ainda não existe").
 */
export async function saveEntry(dateInput: LocalDate, input: z.input<typeof saveDocSchema>): Promise<SaveResult & { id?: string }> {
  const date = parse(localDateSchema, dateInput)
  const data = parse(saveDocSchema, input)
  const prepared = prepareDoc(data.content)
  const db = await getDb()
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(journalEntries).where(eq(journalEntries.entryDate, date)).for("update")
    const now = new Date()
    if (!current) {
      if (!data.force && data.baseVersion !== 0) {
        // A entrada foi apagada em outro lugar: trata como conflito para não perder o texto.
        return { ok: false, conflict: true, version: 0, content: EMPTY_DOC, updatedAt: now.toISOString() }
      }
      const [row] = await tx
        .insert(journalEntries)
        .values({ entryDate: date, content: prepared.doc, contentText: prepared.text, searchText: searchTextFor(date, prepared.text), createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .returning()
      if (!row) {
        const [existing] = await tx.select().from(journalEntries).where(eq(journalEntries.entryDate, date))
        return { ok: false, conflict: true, version: existing!.version, content: existing!.content as DocNode, updatedAt: existing!.updatedAt.toISOString() }
      }
      await syncContentLinks(tx, { type: "journal", id: row.id }, prepared.refs)
      return { ok: true, id: row.id, version: row.version, updatedAt: row.updatedAt.toISOString() }
    }
    if (!data.force && current.version !== data.baseVersion) {
      return { ok: false, conflict: true, version: current.version, content: current.content as DocNode, updatedAt: current.updatedAt.toISOString() }
    }
    const [row] = await tx
      .update(journalEntries)
      .set({ content: prepared.doc, contentText: prepared.text, searchText: searchTextFor(date, prepared.text), version: current.version + 1, updatedAt: now })
      .where(eq(journalEntries.id, current.id))
      .returning()
    await syncContentLinks(tx, { type: "journal", id: current.id }, prepared.refs)
    return { ok: true, id: row!.id, version: row!.version, updatedAt: row!.updatedAt.toISOString() }
  })
}

/** Acrescenta blocos ao fim da entrada do dia (cria a entrada se preciso). */
export async function appendToEntry(dateInput: LocalDate, blocks: DocNode[]) {
  const date = parse(localDateSchema, dateInput)
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getEntry(date)
    const content = appendToDoc(current?.content ?? EMPTY_DOC, blocks)
    const result = await saveEntry(date, { content, baseVersion: current?.version ?? 0 })
    if (result.ok) return result
  }
  throw new Error("Não foi possível acrescentar ao diário agora. Tente de novo.")
}

export async function listEntries(opts: { query?: string; limit?: number; before?: LocalDate } = {}): Promise<(JournalListItem & { snippet?: string | null })[]> {
  const db = await getDb()
  const where = []
  if (opts.query?.trim()) where.push(sql`${journalEntries.searchText} like ${likePattern(opts.query)}`)
  if (opts.before) where.push(lt(journalEntries.entryDate, opts.before))
  // Entradas que ficaram vazias (texto apagado) não aparecem no histórico.
  where.push(sql`(length(${journalEntries.contentText}) > 0 or ${journalEntries.content}::text like '%horizontalRule%')`)
  const rows = await db
    .select({ id: journalEntries.id, entryDate: journalEntries.entryDate, text: journalEntries.contentText, updatedAt: journalEntries.updatedAt })
    .from(journalEntries)
    .where(and(...where))
    .orderBy(desc(journalEntries.entryDate))
    .limit(opts.limit ?? 60)
  return rows.map((r) => ({
    id: r.id,
    entryDate: r.entryDate,
    excerpt: excerpt(r.text, 120),
    updatedAt: r.updatedAt,
    snippet: opts.query ? snippetAround(r.text, opts.query) : undefined,
  }))
}

/** Datas com entrada imediatamente antes e depois de um dia (para pular dias vazios). */
export async function adjacentEntries(dateInput: LocalDate) {
  const date = parse(localDateSchema, dateInput)
  const db = await getDb()
  const nonEmpty = sql`length(${journalEntries.contentText}) > 0`
  const [prev] = await db.select({ d: journalEntries.entryDate }).from(journalEntries).where(and(lt(journalEntries.entryDate, date), nonEmpty)).orderBy(desc(journalEntries.entryDate)).limit(1)
  const [next] = await db.select({ d: journalEntries.entryDate }).from(journalEntries).where(and(gt(journalEntries.entryDate, date), nonEmpty)).orderBy(asc(journalEntries.entryDate)).limit(1)
  return { previous: prev?.d ?? null, next: next?.d ?? null }
}

/** Dias de um intervalo que têm texto escrito (para marcar no calendário do diário). */
export async function entryDatesBetween(from: LocalDate, to: LocalDate): Promise<LocalDate[]> {
  const db = await getDb()
  const rows = await db
    .select({ d: journalEntries.entryDate })
    .from(journalEntries)
    .where(and(sql`${journalEntries.entryDate} between ${from} and ${to}`, sql`length(${journalEntries.contentText}) > 0`))
  return rows.map((r) => r.d)
}

export async function deleteEntry(id: string) {
  const db = await getDb()
  await db.transaction(async (tx) => {
    await tx.delete(journalEntries).where(eq(journalEntries.id, id))
    await tx.delete(contentLinks).where(and(eq(contentLinks.sourceType, "journal"), eq(contentLinks.sourceId, id)))
  })
}

export const entryHasContent = (entry: JournalEntry | null) => !!entry && !isDocEmpty(entry.content)
