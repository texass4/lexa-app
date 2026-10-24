import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { exportJson, exportMarkdownZip } from "@/lib/services/export"
import { saveEntry } from "@/lib/services/journal"
import { createPage, savePageContent } from "@/lib/services/pages"
import { createTask } from "@/lib/services/tasks"
import { setupTestDb } from "./helpers/db"

setupTestDb()

describe("exportação", () => {
  it("JSON traz todas as tabelas, sem o texto de busca derivado", async () => {
    await createTask({ title: "Exportar isto", dueDate: "2026-10-30" })
    const data = await exportJson()
    expect(data.format).toBe("mesa-export")
    expect(data.data.tasks).toHaveLength(1)
    expect(data.data.tasks[0]).toMatchObject({ title: "Exportar isto", dueDate: "2026-10-30" })
    expect("searchText" in data.data.tasks[0]!).toBe(false)
    expect(Object.keys(data.data)).toEqual(expect.arrayContaining(["areas", "projects", "pages", "journalEntries", "boards", "boardElements", "boardConnections", "inboxItems"]))
  })

  it("Markdown gera um arquivo por página e por dia do diário", async () => {
    const page = await createPage({ title: "Notas de estúdio" })
    await savePageContent(page.id, { content: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Microfones" }] }] }, baseVersion: page.version })
    await saveEntry("2026-10-24", { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dia bom." }] }] }, baseVersion: 0 })
    await createTask({ title: "Comprar cabo" })
    const files = unzipSync(await exportMarkdownZip())
    expect(Object.keys(files).sort()).toEqual(["diario/2026-10-24.md", "paginas/notas-de-estudio.md", "tarefas.md"])
    expect(strFromU8(files["paginas/notas-de-estudio.md"]!)).toContain("## Microfones")
    expect(strFromU8(files["diario/2026-10-24.md"]!)).toContain("Dia bom.")
    expect(strFromU8(files["tarefas.md"]!)).toContain("- [ ] **T-1** Comprar cabo")
  })
})
