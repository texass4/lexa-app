import { asc } from "drizzle-orm"
import { strToU8, zipSync } from "fflate"
import { getDb } from "@/lib/db/client"
import * as s from "@/lib/db/schema"
import { docToMarkdown, type DocNode } from "@/lib/domain/doc"
import { STATUS_LABEL, PRIORITY_LABEL, taskCode } from "@/lib/domain/tasks"

export const EXPORT_FORMAT_VERSION = 1

/** Cópia completa dos dados em JSON (todas as tabelas, sem nada derivado do navegador). */
export async function exportJson() {
  const db = await getDb()
  const [areas, projects, tasks, subtasks, tags, taskTags, pages, journal, contentLinks, boards, boardElements, boardConnections, inbox, settings] = await Promise.all([
    db.select().from(s.areas).orderBy(asc(s.areas.position)),
    db.select().from(s.projects).orderBy(asc(s.projects.createdAt)),
    db.select().from(s.tasks).orderBy(asc(s.tasks.number)),
    db.select().from(s.subtasks).orderBy(asc(s.subtasks.taskId), asc(s.subtasks.position)),
    db.select().from(s.tags),
    db.select().from(s.taskTags),
    db.select().from(s.pages).orderBy(asc(s.pages.createdAt)),
    db.select().from(s.journalEntries).orderBy(asc(s.journalEntries.entryDate)),
    db.select().from(s.contentLinks),
    db.select().from(s.boards).orderBy(asc(s.boards.createdAt)),
    db.select().from(s.boardElements),
    db.select().from(s.boardConnections),
    db.select().from(s.inboxItems).orderBy(asc(s.inboxItems.createdAt)),
    db.select().from(s.settings),
  ])
  // O texto de busca é derivado; não precisa ir para o arquivo.
  const strip = <T extends { searchText?: string }>(rows: T[]) =>
    rows.map((row) => {
      const copy: Partial<T> = { ...row }
      delete copy.searchText
      return copy
    })
  return {
    format: "mesa-export",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      areas: strip(areas),
      projects: strip(projects),
      tasks: strip(tasks),
      subtasks,
      tags,
      taskTags,
      pages: strip(pages),
      journalEntries: strip(journal),
      contentLinks,
      boards: strip(boards),
      boardElements,
      boardConnections,
      inboxItems: inbox,
      settings,
    },
  }
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "sem-titulo"

/** Conteúdo textual em Markdown: uma página por arquivo, um arquivo por dia do diário. */
export async function exportMarkdownZip(): Promise<Uint8Array> {
  const db = await getDb()
  const [pages, journal, tasks, projects] = await Promise.all([
    db.select().from(s.pages),
    db.select().from(s.journalEntries),
    db.select().from(s.tasks).orderBy(asc(s.tasks.number)),
    db.select().from(s.projects),
  ])
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  for (const page of pages) {
    let name = `paginas/${slug(page.title)}.md`
    if (used.has(name)) name = `paginas/${slug(page.title)}-${page.id.slice(0, 8)}.md`
    used.add(name)
    const front = [`---`, `id: ${page.id}`, `titulo: ${JSON.stringify(page.title)}`, `criada: ${page.createdAt.toISOString()}`, `atualizada: ${page.updatedAt.toISOString()}`]
    if (page.archivedAt) front.push(`arquivada: ${page.archivedAt.toISOString()}`)
    front.push(`---`, ``)
    files[name] = strToU8(`${front.join("\n")}# ${page.title || "Sem título"}\n\n${docToMarkdown(page.content as DocNode)}`)
  }
  for (const entry of journal) {
    files[`diario/${entry.entryDate}.md`] = strToU8(`# Diário · ${entry.entryDate}\n\n${docToMarkdown(entry.content as DocNode)}`)
  }
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]))
  const taskLines = tasks.map((t) => {
    const parts = [STATUS_LABEL[t.status], `prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()}`]
    if (t.dueDate) parts.push(`prazo ${t.dueDate}`)
    if (t.projectId) parts.push(`projeto: ${projectTitle.get(t.projectId) ?? "?"}`)
    const desc = t.description ? `\n  ${t.description.replace(/\n/g, "\n  ")}` : ""
    return `- [${t.status === "done" ? "x" : " "}] **${taskCode(t.number)}** ${t.title} — ${parts.join(", ")}${desc}`
  })
  files["tarefas.md"] = strToU8(`# Tarefas\n\n${taskLines.join("\n")}\n`)
  return zipSync(files, { level: 6 })
}
