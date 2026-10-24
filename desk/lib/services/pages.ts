import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { areas, contentLinks, pages, projects } from "@/lib/db/schema"
import { EMPTY_DOC, excerpt, type DocNode } from "@/lib/domain/doc"
import { likePattern, normalizeForSearch, snippetAround } from "@/lib/domain/search"
import { pageMetaSchema, saveDocSchema } from "@/lib/validation"
import type { z } from "zod"
import { prepareDoc, type SaveResult } from "./documents"
import { invalid, notFound } from "./errors"
import { syncContentLinks } from "./refs"
import { defined, parse } from "./util"

export type PageItem = {
  id: string
  title: string
  excerpt: string
  projectId: string | null
  projectTitle: string | null
  areaId: string | null
  areaName: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
export type PageDetail = PageItem & { content: DocNode; version: number }

const columns = {
  id: pages.id,
  title: pages.title,
  contentText: pages.contentText,
  projectId: pages.projectId,
  projectTitle: projects.title,
  areaId: pages.areaId,
  areaName: areas.name,
  archivedAt: pages.archivedAt,
  createdAt: pages.createdAt,
  updatedAt: pages.updatedAt,
}

const toItem = ({ contentText, ...row }: { contentText: string } & Omit<PageItem, "excerpt">): PageItem => ({ ...row, excerpt: excerpt(contentText) })

export async function listPages(filter: { query?: string; projectId?: string; areaId?: string; archived?: boolean; limit?: number } = {}) {
  const db = await getDb()
  const where = [filter.archived ? isNotNull(pages.archivedAt) : isNull(pages.archivedAt)]
  if (filter.query?.trim()) where.push(sql`${pages.searchText} like ${likePattern(filter.query)}`)
  if (filter.projectId) where.push(eq(pages.projectId, filter.projectId))
  if (filter.areaId) where.push(or(eq(pages.areaId, filter.areaId), eq(projects.areaId, filter.areaId))!)
  const rows = await db
    .select(columns)
    .from(pages)
    .leftJoin(projects, eq(projects.id, pages.projectId))
    .leftJoin(areas, eq(areas.id, pages.areaId))
    .where(and(...where))
    .orderBy(desc(pages.updatedAt))
    .limit(filter.limit ?? 500)
  // Com busca, o trecho mostra onde o termo aparece no conteúdo (não só o começo).
  return rows.map((row) => ({ ...toItem(row), snippet: filter.query?.trim() ? snippetAround(row.contentText, filter.query) : null }))
}

export async function getPage(id: string): Promise<PageDetail | null> {
  const db = await getDb()
  const [row] = await db
    .select({ ...columns, content: pages.content, version: pages.version })
    .from(pages)
    .leftJoin(projects, eq(projects.id, pages.projectId))
    .leftJoin(areas, eq(areas.id, pages.areaId))
    .where(eq(pages.id, id))
  if (!row) return null
  const { content, version, ...rest } = row
  return { ...toItem(rest), content: content as DocNode, version }
}

async function assertLinks(input: { projectId?: string | null; areaId?: string | null }) {
  const db = await getDb()
  if (input.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId))
    if (!p) throw invalid("O projeto escolhido não existe mais.")
  }
  if (input.areaId) {
    const [a] = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, input.areaId))
    if (!a) throw invalid("A área escolhida não existe mais.")
  }
}

export async function createPage(input: z.input<typeof pageMetaSchema> & { content?: unknown } = {}) {
  const meta = parse(pageMetaSchema, input)
  await assertLinks(meta)
  const prepared = prepareDoc(input.content ?? EMPTY_DOC)
  const title = meta.title ?? ""
  const db = await getDb()
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pages)
      .values({
        title,
        content: prepared.doc,
        contentText: prepared.text,
        searchText: normalizeForSearch(title, prepared.text),
        projectId: meta.projectId ?? null,
        areaId: meta.areaId ?? null,
      })
      .returning({ id: pages.id })
    await syncContentLinks(tx, { type: "page", id: row!.id }, prepared.refs)
    return row!.id
  })
  return (await getPage(id))!
}

/** Título e associações (projeto, área). Não mexe no conteúdo nem na versão. */
export async function updatePageMeta(id: string, input: z.input<typeof pageMetaSchema>) {
  const meta = parse(pageMetaSchema, input)
  await assertLinks(meta)
  const db = await getDb()
  const [current] = await db.select({ title: pages.title, text: pages.contentText }).from(pages).where(eq(pages.id, id))
  if (!current) throw notFound("Página")
  const title = meta.title ?? current.title
  await db
    .update(pages)
    .set({ ...defined(meta), searchText: normalizeForSearch(title, current.text), updatedAt: new Date() })
    .where(eq(pages.id, id))
  return (await getPage(id))!
}

/**
 * Salvamento automático do conteúdo. Só grava se `baseVersion` for a versão atual: assim
 * uma resposta atrasada (ou outra aba) nunca sobrescreve uma alteração mais nova.
 */
export async function savePageContent(id: string, input: z.input<typeof saveDocSchema>): Promise<SaveResult> {
  const data = parse(saveDocSchema, input)
  const prepared = prepareDoc(data.content)
  const db = await getDb()
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ version: pages.version, title: pages.title, content: pages.content, updatedAt: pages.updatedAt }).from(pages).where(eq(pages.id, id)).for("update")
    if (!current) throw notFound("Página")
    if (!data.force && current.version !== data.baseVersion) {
      return { ok: false, conflict: true, version: current.version, content: current.content as DocNode, updatedAt: current.updatedAt.toISOString() }
    }
    const now = new Date()
    const [row] = await tx
      .update(pages)
      .set({
        content: prepared.doc,
        contentText: prepared.text,
        searchText: normalizeForSearch(current.title, prepared.text),
        version: current.version + 1,
        updatedAt: now,
      })
      .where(eq(pages.id, id))
      .returning({ version: pages.version, updatedAt: pages.updatedAt })
    await syncContentLinks(tx, { type: "page", id }, prepared.refs)
    return { ok: true, version: row!.version, updatedAt: row!.updatedAt.toISOString() }
  })
}

export async function setPageArchived(id: string, archived: boolean) {
  const db = await getDb()
  const [row] = await db
    .update(pages)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(pages.id, id))
    .returning({ id: pages.id })
  if (!row) throw notFound("Página")
}

export async function deletePage(id: string) {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(pages).where(eq(pages.id, id)).returning({ id: pages.id })
    if (deleted.length === 0) throw notFound("Página")
    await tx.delete(contentLinks).where(or(and(eq(contentLinks.sourceType, "page"), eq(contentLinks.sourceId, id)), and(eq(contentLinks.targetType, "page"), eq(contentLinks.targetId, id))))
  })
}
