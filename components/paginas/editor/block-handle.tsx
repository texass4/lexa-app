"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { TextSelection } from "@tiptap/pm/state"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Pilcrow,
  Plus,
  Quote,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { moveTopBlock } from "./extensions"

const item = "h-8 gap-2.5 px-2 text-[13px]"

function blockStart(editor: Editor, index: number) {
  let pos = 0
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize
  return pos
}

/** Coloca o cursor dentro do bloco (para os comandos de "Transformar em"). */
function focusBlock(editor: Editor, index: number) {
  const start = blockStart(editor, index)
  const { state, view } = editor
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(start + 1))))
  return editor.chain().focus()
}

/**
 * Alça ao lado do bloco (mouse): inserir abaixo e menu do bloco (mover, duplicar,
 * transformar, excluir). No teclado: Alt+Shift+↑/↓ move o bloco; "/" insere.
 */
export function BlockHandle({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const [hover, setHover] = React.useState<{ index: number; top: number } | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuOpenRef = React.useRef(false)
  React.useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  React.useEffect(() => {
    if (!container) return
    const onMove = (e: MouseEvent) => {
      if (menuOpenRef.current || !editor.isEditable) return
      const view = editor.view
      const dom = view.dom.getBoundingClientRect()
      const hit = view.posAtCoords({ left: Math.min(Math.max(e.clientX, dom.left + 8), dom.right - 8), top: e.clientY })
      if (!hit) return
      const doc = editor.state.doc
      if (!doc.childCount) return
      const index = Math.min(doc.resolve(hit.pos).index(0), doc.childCount - 1)
      const node = view.nodeDOM(blockStart(editor, index)) as HTMLElement | null
      if (!node?.getBoundingClientRect) return
      const r = node.getBoundingClientRect()
      const c = container.getBoundingClientRect()
      // Alinha com a primeira linha do bloco.
      const lineHeight = Math.min(r.height, 28)
      setHover((h) => {
        const top = r.top - c.top + lineHeight / 2 - 14
        return h && h.index === index && Math.abs(h.top - top) < 1 ? h : { index, top }
      })
    }
    const onLeave = () => !menuOpenRef.current && setHover(null)
    container.addEventListener("mousemove", onMove)
    container.addEventListener("mouseleave", onLeave)
    return () => {
      container.removeEventListener("mousemove", onMove)
      container.removeEventListener("mouseleave", onLeave)
    }
  }, [editor, container])

  // O documento mudou: a posição guardada pode não valer mais.
  React.useEffect(() => {
    const reset = () => !menuOpenRef.current && setHover(null)
    editor.on("update", reset)
    return () => {
      editor.off("update", reset)
    }
  }, [editor])

  if (!hover || !editor.isEditable) return null
  const { index } = hover
  const count = editor.state.doc.childCount
  if (index >= count) return null
  const node = editor.state.doc.child(index)
  const textual = node.isTextblock || ["bulletList", "orderedList", "taskList", "blockquote"].includes(node.type.name)

  const insertBelow = () => {
    const pos = blockStart(editor, index) + node.nodeSize
    editor
      .chain()
      .insertContentAt(pos, { type: "paragraph" })
      .setTextSelection(pos + 1)
      .focus()
      .insertContent("/")
      .run()
  }
  const run = (fn: () => void) => () => {
    fn()
    setMenuOpen(false)
    setHover(null)
  }

  return (
    <div
      className="absolute left-0 z-10 flex -translate-x-full items-center pr-1 pointer-coarse:hidden"
      style={{ top: hover.top }}
      contentEditable={false}
    >
      <button
        type="button"
        onClick={insertBelow}
        aria-label="Inserir bloco abaixo"
        title="Inserir bloco abaixo"
        className="flex size-7 items-center justify-center rounded-md text-subtle outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Plus className="size-4" />
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label="Ações do bloco"
          title="Ações do bloco"
          className="flex h-7 w-5 cursor-grab items-center justify-center rounded-md text-subtle outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <GripVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" className="w-56">
          <DropdownMenuItem className={item} disabled={index === 0} onClick={run(() => moveTopBlock(editor, index, -1))}>
            <ArrowUp /> Mover para cima <DropdownMenuShortcut>Alt⇧↑</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className={item} disabled={index >= count - 1} onClick={run(() => moveTopBlock(editor, index, 1))}>
            <ArrowDown /> Mover para baixo <DropdownMenuShortcut>Alt⇧↓</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={item}
            onClick={run(() => {
              const pos = blockStart(editor, index) + node.nodeSize
              editor.chain().insertContentAt(pos, node.toJSON()).run()
            })}
          >
            <Copy /> Duplicar
          </DropdownMenuItem>
          {textual && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={item}>
                <Pilcrow /> Transformar em
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().setParagraph().run())}>
                  <Pilcrow /> Texto
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().setHeading({ level: 1 }).run())}>
                  <Heading1 /> Título
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().setHeading({ level: 2 }).run())}>
                  <Heading2 /> Subtítulo
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().setHeading({ level: 3 }).run())}>
                  <Heading3 /> Título menor
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().toggleBulletList().run())}>
                  <List /> Lista com marcadores
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().toggleOrderedList().run())}>
                  <ListOrdered /> Lista numerada
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().toggleTaskList().run())}>
                  <ListTodo /> Checklist
                </DropdownMenuItem>
                <DropdownMenuItem className={item} onClick={run(() => focusBlock(editor, index).clearNodes().toggleBlockquote().run())}>
                  <Quote /> Citação
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={`${item} text-danger data-[highlighted]:text-danger`}
            onClick={run(() => {
              const start = blockStart(editor, index)
              editor
                .chain()
                .deleteRange({ from: start, to: start + node.nodeSize })
                .focus()
                .run()
            })}
          >
            <Trash2 /> Excluir bloco
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
