"use client"

import * as React from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import {
  Code2,
  FilePlus2,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListPlus,
  ListTodo,
  Minus,
  Pilcrow,
  Quote,
} from "lucide-react"
import { useOfficeData } from "@/lib/store/office-store"
import { describeRelated } from "@/lib/store/selectors"
import { useSession } from "@/lib/auth/session"
import { usePages } from "@/lib/paginas/pages"
import { pageTitle, type DocNode } from "@/lib/paginas/model"
import type { PageSaver } from "@/lib/paginas/autosave"
import {
  BlockKeys,
  ChecklistItem,
  createMentionMenu,
  createSlashCommand,
  fold,
  insertBlock,
  Mention,
  setMenuProviders,
  TaskRef,
  type MentionItem,
  type SlashItem,
} from "./extensions"
import { MentionMenu, SlashMenu } from "./menus"
import { BubbleToolbar } from "./bubble-toolbar"
import { BlockHandle } from "./block-handle"
import { usePageEditor } from "./editor-context"
import "./page-editor.css"

const MENTIONS_PER_KIND = 5
const SlashCommand = createSlashCommand(SlashMenu)
const MentionMenuExtension = createMentionMenu(MentionMenu)

export interface PageEditorProps {
  pageId: string
  initialContent: DocNode
  editable: boolean
  saver: PageSaver
  /** Cria uma subpágina e devolve o id (ou null se falhou). */
  createSubpage: () => Promise<string | null>
  onReady?: (editor: Editor) => void
}

/**
 * Editor da página (Tiptap/ProseMirror). Cada alteração vai para o salvador, que agrupa
 * e grava no banco; o conteúdo nunca fica só no navegador.
 */
export default function PageEditor({ pageId, initialContent, editable, saver, createSubpage, onReady }: PageEditorProps) {
  const ctx = usePageEditor()
  const data = useOfficeData()
  const { can } = useSession()
  const { list: pages } = usePages()
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null)

  // Os menus leem sempre o estado mais recente (o editor é criado uma vez).
  const live = React.useRef({ ctx, data, pages, can, createSubpage, pageId })
  React.useEffect(() => {
    live.current = { ctx, data, pages, can, createSubpage, pageId }
  })

  const slashItems = React.useCallback((): SlashItem[] => {
    const { ctx: c } = live.current
    const base: SlashItem[] = [
      {
        id: "p",
        group: "Básico",
        label: "Texto",
        hint: "Parágrafo comum",
        keywords: "texto paragrafo",
        icon: Pilcrow,
        run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
      },
      {
        id: "h1",
        group: "Básico",
        label: "Título",
        hint: "Seção grande",
        keywords: "titulo h1 heading",
        icon: Heading1,
        run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        group: "Básico",
        label: "Subtítulo",
        hint: "Seção média",
        keywords: "subtitulo h2 heading",
        icon: Heading2,
        run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        group: "Básico",
        label: "Título menor",
        hint: "Seção pequena",
        keywords: "h3 heading",
        icon: Heading3,
        run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
      },
      {
        id: "ul",
        group: "Básico",
        label: "Lista com marcadores",
        keywords: "lista marcadores bullet",
        icon: List,
        run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
      },
      {
        id: "ol",
        group: "Básico",
        label: "Lista numerada",
        keywords: "lista numerada ordenada",
        icon: ListOrdered,
        run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
      },
      {
        id: "todo",
        group: "Básico",
        label: "Checklist",
        hint: "Passos para marcar — não são tarefas",
        keywords: "checklist verificacao passos todo",
        icon: ListTodo,
        run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
      },
      {
        id: "quote",
        group: "Básico",
        label: "Citação",
        keywords: "citacao quote",
        icon: Quote,
        run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
      },
      {
        id: "hr",
        group: "Básico",
        label: "Divisor",
        keywords: "divisor linha separador",
        icon: Minus,
        run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
      },
      {
        id: "code",
        group: "Básico",
        label: "Código",
        hint: "Texto em fonte fixa",
        keywords: "codigo code",
        icon: Code2,
        run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
      },
    ]
    const integra: SlashItem[] = []
    if (c.canEditTasks) {
      integra.push({
        id: "task",
        group: "Íntegra",
        label: "Nova tarefa",
        hint: "Tarefa real, com responsável e prazo",
        keywords: "tarefa nova criar task",
        icon: ListChecks,
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run()
          live.current.ctx.createTask({
            onCreated: (task) => insertBlock(e, { type: "taskRef", attrs: { taskId: task.id } }),
          })
        },
      })
    }
    integra.push(
      {
        id: "task-existing",
        group: "Íntegra",
        label: "Tarefa existente",
        hint: "Mostrar uma tarefa do quadro nesta página",
        keywords: "tarefa existente vincular",
        icon: ListPlus,
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run()
          live.current.ctx.pickTask((taskId) => insertBlock(e, { type: "taskRef", attrs: { taskId } }))
        },
      },
      {
        id: "mention",
        group: "Íntegra",
        label: "Mencionar",
        hint: "Cliente, processo, tarefa ou página (@)",
        keywords: "mencionar cliente processo link @",
        icon: Link2,
        run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run(),
      },
      {
        id: "subpage",
        group: "Íntegra",
        label: "Subpágina",
        hint: "Página dentro desta",
        keywords: "subpagina pagina nova",
        icon: FilePlus2,
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run()
          void live.current.createSubpage().then((id) => {
            if (id)
              e.chain()
                .focus()
                .insertContent([
                  { type: "mention", attrs: { kind: "page", id } },
                  { type: "text", text: " " },
                ])
                .run()
          })
        },
      },
    )
    return [...base, ...integra]
  }, [])

  const searchMentions = React.useCallback((query: string): MentionItem[] => {
    const { data: d, pages: ps, can: allowed, pageId: current } = live.current
    const q = fold(query.trim())
    const hit = (s: string) => !q || fold(s).includes(q)
    const out: MentionItem[] = []
    if (allowed("clients.view")) {
      out.push(
        ...d.clients
          .filter((c) => hit(c.name))
          .slice(0, MENTIONS_PER_KIND)
          .map((c) => ({ kind: "client" as const, id: c.id, label: c.name })),
      )
    }
    if (allowed("processes.view")) {
      out.push(
        ...d.processes
          .map((p) => ({ p, r: describeRelated(d, { type: "process", id: p.id }) }))
          .filter(({ p, r }) => hit(`${r?.label ?? ""} ${p.number ?? ""} ${p.code ?? ""}`))
          .slice(0, MENTIONS_PER_KIND)
          .map(({ p, r }) => ({ kind: "process" as const, id: p.id, label: r?.label ?? "Processo", detail: r?.kind })),
      )
    }
    out.push(
      ...d.tasks
        .filter((t) => t.status === "pendente" && hit(t.title))
        .slice(0, MENTIONS_PER_KIND)
        .map((t) => ({ kind: "task" as const, id: t.id, label: t.title })),
    )
    out.push(
      ...ps
        .filter((p) => p.id !== current && hit(pageTitle(p)))
        .slice(0, MENTIONS_PER_KIND)
        .map((p) => ({ kind: "page" as const, id: p.id, label: pageTitle(p) })),
    )
    return out
  }, [])

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      content: initialContent,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            defaultProtocol: "https",
            HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
          },
        }),
        TaskList,
        ChecklistItem,
        TaskRef,
        Mention,
        BlockKeys,
        Placeholder.configure({
          placeholder: ({ node, editor: e }) => {
            if (node.type.name === "heading") return "Título"
            return e.state.doc.childCount <= 1 ? "Escreva algo, ou digite / para inserir blocos e @ para mencionar…" : "Digite / para inserir blocos"
          },
          showOnlyCurrent: true,
        }),
        SlashCommand,
        MentionMenuExtension,
      ],
      editorProps: {
        attributes: {
          class: "page-prose",
          "aria-label": "Conteúdo da página",
          "aria-multiline": "true",
          role: "textbox",
          spellcheck: "true",
          lang: "pt-BR",
        },
      },
      onUpdate: ({ editor: e }) => saver.edit({ content: e.getJSON() as DocNode }),
    },
    [pageId],
  )

  React.useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

  React.useEffect(() => {
    if (editor) setMenuProviders(editor, { slash: slashItems, mention: searchMentions })
  }, [editor, slashItems, searchMentions])

  React.useEffect(() => {
    if (editor) onReady?.(editor)
  }, [editor, onReady])

  if (!editor) return <EditorSkeleton />

  return (
    <div ref={setContainer} className="relative">
      <EditorContent editor={editor} />
      {editable && <BubbleToolbar editor={editor} />}
      {editable && <BlockHandle editor={editor} container={container} />}
    </div>
  )
}

export function EditorSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Carregando o editor">
      <div className="h-4 w-11/12 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
    </div>
  )
}
