import { describe, expect, it } from "vitest"
import { docToMarkdown, docToText, extractRefs, textToDoc, validateDoc, type DocNode } from "@/lib/domain/doc"
import { normalizeForSearch, snippetAround } from "@/lib/domain/search"

const taskId = "4f9c2a1e-8d3b-4c6a-9e2f-1a2b3c4d5e6f"
const pageId = "0b1c2d3e-4f50-4617-8899-aabbccddeeff"

const doc: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Produção musical" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Próximo passo: " },
        { type: "reference", attrs: { refType: "task", refId: taskId, label: "Gravar os vocais" } },
        { type: "text", text: " e ver ", marks: [{ type: "bold" }] },
        { type: "text", text: "anotações", marks: [{ type: "link", attrs: { href: `/pages/${pageId}` } }] },
      ],
    },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Letra" }] }] },
        { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Arranjo" }] }] },
      ],
    },
    { type: "horizontalRule" },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Menos é mais." }] }] },
  ],
}

describe("documento em blocos", () => {
  it("aceita os blocos suportados e recusa o resto", () => {
    expect(validateDoc(doc).ok).toBe(true)
    expect(validateDoc({ type: "doc", content: [{ type: "script" }] }).ok).toBe(false)
    expect(validateDoc({ type: "doc", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }).ok).toBe(false)
    expect(validateDoc({ type: "paragraph" }).ok).toBe(false)
  })

  it("extrai referências por id (menções e links internos)", () => {
    expect(extractRefs(doc)).toEqual([
      { type: "task", id: taskId },
      { type: "page", id: pageId },
    ])
  })

  it("gera texto corrido com uma linha por bloco", () => {
    expect(docToText(doc)).toBe("Produção musical\nPróximo passo: Gravar os vocais e ver anotações\nLetra\nArranjo\nMenos é mais.")
  })

  it("exporta Markdown com checklist, citação e referência como link", () => {
    const md = docToMarkdown(doc)
    expect(md).toContain("# Produção musical")
    expect(md).toContain(`[Gravar os vocais](/tasks/${taskId})`)
    expect(md).toContain("- [x] Letra")
    expect(md).toContain("- [ ] Arranjo")
    expect(md).toContain("> Menos é mais.")
    expect(md).toContain("---")
  })

  it("converte texto puro em parágrafos", () => {
    expect(textToDoc("a\n\nb\n")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "b" }] }],
    })
  })

  it("busca ignora acentos e maiúsculas", () => {
    expect(normalizeForSearch("Reunião de Produção")).toBe("reuniao de producao")
    const snippet = snippetAround("Antes disso, a reunião de produção foi adiada para sexta.", "producao", 10)
    expect(snippet).toContain("de produção foi")
    expect(snippet!.startsWith("…")).toBe(true)
    expect(snippetAround("nada aqui", "producao")).toBeNull()
  })
})
