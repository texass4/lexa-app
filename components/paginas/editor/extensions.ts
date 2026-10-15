import { Extension, Node, mergeAttributes, type Editor, type Range } from "@tiptap/core"
import { ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react"
import { PluginKey, TextSelection } from "@tiptap/pm/state"
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion"
import { TaskItem } from "@tiptap/extension-list"
import type * as React from "react"
import { TaskRefView } from "./task-ref-view"
import { MentionView } from "./mention-view"
import { ChecklistItemView } from "./checklist-item-view"

/* ------------------------------------------------------------ nós do Íntegra */

/** Tarefa real dentro da página: só a referência (id). Status, prazo etc. vêm de `tasks`. */
export const TaskRef = Node.create({
  name: "taskRef",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-task-id"),
        renderHTML: (attrs) => ({ "data-task-id": attrs.taskId }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-task-ref]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-task-ref": "" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TaskRefView)
  },
})

export type MentionKind = "client" | "process" | "task" | "page"

/** Link para um registro do Íntegra (cliente, processo, tarefa ou página). O nome é lido do registro. */
export const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: { default: null, parseHTML: (el) => el.getAttribute("data-kind"), renderHTML: (a) => ({ "data-kind": a.kind }) },
      id: { default: null, parseHTML: (el) => el.getAttribute("data-id"), renderHTML: (a) => ({ "data-id": a.id }) },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-mention]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-mention": "" })]
  },
  renderText({ node }) {
    return `@${node.attrs.kind}`
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: "span" })
  },
})

/** Item de checklist (passo simples, não é tarefa) com a ação "Converter em tarefa". */
export const ChecklistItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ChecklistItemView, { as: "li" })
  },
}).configure({ nested: true })

/* ---------------------------------------------------- mover blocos (teclado) */

/** Troca o bloco do nível de cima no `index` com o vizinho (dir -1 ou 1). */
export function moveTopBlock(editor: Editor, index: number, dir: -1 | 1) {
  const { state, view } = editor
  const doc = state.doc
  const target = index + dir
  if (index < 0 || index >= doc.childCount || target < 0 || target >= doc.childCount) return false
  const lo = Math.min(index, target)
  let start = 0
  for (let i = 0; i < lo; i++) start += doc.child(i).nodeSize
  const first = doc.child(lo)
  const second = doc.child(lo + 1)
  const tr = state.tr.replaceWith(start, start + first.nodeSize + second.nodeSize, [second, first])
  // O cursor acompanha o bloco movido.
  const movedStart = dir === 1 ? start + second.nodeSize : start
  const inside = Math.max(0, state.selection.from - (dir === 1 ? start : start + first.nodeSize))
  const pos = Math.min(movedStart + inside, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos)))
  view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Insere um bloco (ex.: tarefa) onde está o cursor: numa linha vazia, ocupa o lugar dela;
 * senão, entra logo depois do bloco atual. O cursor vai para depois do bloco inserido.
 */
export function insertBlock(editor: Editor, node: { type: string; attrs?: Record<string, unknown> }) {
  const { $from } = editor.state.selection
  const parent = $from.parent
  const emptyLine = parent.type.name === "paragraph" && parent.content.size === 0 && $from.depth >= 1
  const from = emptyLine ? $from.before() : $from.after(1)
  const to = emptyLine ? $from.after() : from
  return editor.chain().focus().insertContentAt({ from, to }, node).run()
}

export const topIndexAt = (editor: Editor) => editor.state.selection.$from.index(0)

export const BlockKeys = Extension.create({
  name: "blockKeys",
  addKeyboardShortcuts() {
    return {
      "Alt-Shift-ArrowUp": () => moveTopBlock(this.editor, topIndexAt(this.editor), -1),
      "Alt-Shift-ArrowDown": () => moveTopBlock(this.editor, topIndexAt(this.editor), 1),
    }
  },
})

/* ------------------------------------------------------- menus de sugestão */

export interface MenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export interface MenuProps<I> {
  items: I[]
  query: string
  loading: boolean
  command: (item: I) => void
}

/** Monta o menu React no lugar do cursor (posição e rolagem a cargo do plugin). */
function renderMenu<I>(Component: React.ComponentType<MenuProps<I> & { ref?: React.Ref<MenuHandle> }>, key: PluginKey) {
  return () => {
    let renderer: ReactRenderer<MenuHandle, MenuProps<I>> | null = null
    let unmount: (() => void) | null = null
    const toProps = (p: SuggestionProps<I, I>): MenuProps<I> => ({ items: p.items, query: p.query, loading: p.loading, command: p.command })
    return {
      onStart: (props: SuggestionProps<I, I>) => {
        renderer = new ReactRenderer(Component, { props: toProps(props), editor: props.editor })
        const el = renderer.element as HTMLElement
        el.style.zIndex = "60"
        unmount = props.mount(el)
      },
      onUpdate: (props: SuggestionProps<I, I>) => renderer?.updateProps(toProps(props)),
      onKeyDown: ({ event, view }: SuggestionKeyDownProps) => {
        if (event.key === "Escape") {
          exitSuggestion(view, key)
          return true
        }
        return renderer?.ref?.onKeyDown(event) ?? false
      },
      onExit: () => {
        unmount?.()
        renderer?.destroy()
        renderer = null
        unmount = null
      },
    }
  }
}

export interface SlashItem {
  id: string
  group: string
  label: string
  hint?: string
  keywords: string
  icon: React.ComponentType<{ className?: string }>
  run: (editor: Editor, range: Range) => void
}

export const slashKey = new PluginKey("slash-menu")
export const mentionKey = new PluginKey("mention-menu")

/** De onde os menus tiram os itens (dados atuais da tela), por editor. */
interface Providers {
  slash: () => SlashItem[]
  mention: (query: string) => MentionItem[]
}
const providers = new WeakMap<Editor, Providers>()

export function setMenuProviders(editor: Editor, value: Providers) {
  providers.set(editor, value)
}

export function createSlashCommand(Menu: React.ComponentType<MenuProps<SlashItem> & { ref?: React.Ref<MenuHandle> }>) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: slashKey,
          char: "/",
          items: ({ query, editor }) => {
            const q = fold(query)
            return (providers.get(editor)?.slash() ?? []).filter((i) => !q || fold(`${i.label} ${i.keywords}`).includes(q))
          },
          command: ({ editor, range, props }) => props.run(editor, range),
          // Nada de menu dentro de código.
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          render: renderMenu(Menu, slashKey),
        }),
      ]
    },
  })
}

export interface MentionItem {
  kind: MentionKind
  id: string
  label: string
  detail?: string
}

export function createMentionMenu(Menu: React.ComponentType<MenuProps<MentionItem> & { ref?: React.Ref<MenuHandle> }>) {
  return Extension.create({
    name: "mentionMenu",
    addProseMirrorPlugins() {
      return [
        Suggestion<MentionItem, MentionItem>({
          editor: this.editor,
          pluginKey: mentionKey,
          char: "@",
          allowSpaces: true,
          items: ({ query, editor }) => providers.get(editor)?.mention(query) ?? [],
          command: ({ editor, range, props }) =>
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: "mention", attrs: { kind: props.kind, id: props.id } },
                { type: "text", text: " " },
              ])
              .run(),
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          render: renderMenu(Menu, mentionKey),
        }),
      ]
    },
  })
}

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
