import { Extension, type Editor, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"
import { AtSign, Code2, Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, Minus, Pilcrow, Quote, type LucideIcon } from "lucide-react"
import type { SuggestionItem } from "../suggestion-list"
import { renderSuggestion } from "./render-suggestion"

type Command = SuggestionItem & { keywords: string; run: (editor: Editor, range: Range) => void }

const COMMANDS: Command[] = [
  { id: "p", title: "Texto", subtitle: "Parágrafo simples", icon: Pilcrow, keywords: "texto paragrafo p", run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { id: "h1", title: "Título 1", icon: Heading1, hint: "#", keywords: "titulo h1 heading", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { id: "h2", title: "Título 2", icon: Heading2, hint: "##", keywords: "titulo h2 subtitulo", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { id: "h3", title: "Título 3", icon: Heading3, hint: "###", keywords: "titulo h3", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { id: "ul", title: "Lista com marcadores", icon: List, hint: "-", keywords: "lista marcadores bullet", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: "ol", title: "Lista numerada", icon: ListOrdered, hint: "1.", keywords: "lista numerada ordenada", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: "todo", title: "Checklist", icon: ListChecks, hint: "[]", keywords: "checklist tarefas caixa todo", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { id: "quote", title: "Citação", icon: Quote, hint: ">", keywords: "citacao quote", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: "hr", title: "Divisor", icon: Minus, hint: "---", keywords: "divisor linha separador hr", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { id: "code", title: "Bloco de código", icon: Code2, hint: "```", keywords: "codigo code", run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  {
    id: "ref",
    title: "Referência",
    subtitle: "Tarefa, página, projeto, diário ou quadro",
    icon: AtSign,
    hint: "@",
    keywords: "referencia link mencao tarefa pagina projeto",
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run(),
  },
]

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/** Menu de blocos aberto com "/" — o mesmo para páginas e diário. */
export const SlashCommands = Extension.create({
  name: "slashCommands",
  addProseMirrorPlugins() {
    return [
      Suggestion<Command, Command>({
        editor: this.editor,
        pluginKey: new PluginKey("slash-commands"),
        char: "/",
        placement: "bottom-start",
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => {
          const q = normalize(query.trim())
          return COMMANDS.filter((c) => !q || normalize(c.title).includes(q) || c.keywords.includes(q))
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: renderSuggestion("Nenhum bloco com esse nome.") as never,
      }),
    ]
  },
})

export type { LucideIcon }
