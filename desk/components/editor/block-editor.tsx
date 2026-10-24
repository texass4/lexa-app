"use client"

import { DragHandle } from "@tiptap/extension-drag-handle-react"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import { Bold, Code, GripVertical, Heading2, Italic, Link2, Quote, Strikethrough, Unlink } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/cn"
import { isSafeHref } from "@/lib/domain/doc"
import { MoveBlock } from "./extensions/move-block"
import { Reference, type CreateRecord } from "./extensions/reference"
import { SlashCommands } from "./extensions/slash"

export type { CreateRecord }

/**
 * Editor em blocos (Tiptap/ProseMirror) usado por páginas e diário: parágrafos, títulos,
 * listas, checklist, citação, divisor, links e referências internas (@). Menu "/" para
 * blocos, alça para arrastar e Alt+Shift+↑/↓ para reordenar pelo teclado.
 */
export function BlockEditor({
  initialContent,
  onChange,
  onReady,
  createRecord,
  placeholder = "Escreva… digite / para blocos e @ para citar tarefas, páginas e projetos",
  autofocus = false,
  className,
  editable = true,
}: {
  initialContent: JSONContent
  onChange: (doc: JSONContent) => void
  onReady?: (editor: Editor) => void
  createRecord?: CreateRecord
  placeholder?: string
  autofocus?: boolean
  className?: string
  editable?: boolean
}) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autofocus ? "end" : false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => isSafeHref(url) || /^[\w.-]+\.[a-z]{2,}/i.test(url),
          HTMLAttributes: { rel: "noopener noreferrer", target: null },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder, includeChildren: false }),
      Reference.configure({ createRecord }),
      SlashCommands,
      MoveBlock,
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: cn("prose-mesa", className), "aria-label": "Conteúdo", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
    onCreate: ({ editor }) => onReady?.(editor),
  })

  if (!editor) return <div className={cn("prose-mesa animate-pulse text-ink-5", className)}>Carregando editor…</div>

  return (
    <div className="relative">
      {editable ? (
        <DragHandle editor={editor} className="mesa-drag-handle">
          <div className="-ml-1 flex h-7 w-5 cursor-grab items-center justify-center rounded-xs text-ink-5 hover:bg-paper-2 hover:text-ink-3 active:cursor-grabbing" title="Arraste para mover o bloco (ou Alt+Shift+↑/↓)">
            <GripVertical className="size-4" />
          </div>
        </DragHandle>
      ) : null}
      <FormatMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function FormatMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState("")
  const btn = (active: boolean) => cn("flex size-7 items-center justify-center rounded-xs transition-colors [&_svg]:size-3.5", active ? "bg-paper text-ink" : "text-nav-text hover:bg-nav-3 hover:text-paper")

  const applyLink = () => {
    const value = href.trim()
    if (!value) editor.chain().focus().extendMarkRange("link").unsetLink().run()
    else {
      const url = /^(https?:|mailto:|tel:|\/)/i.test(value) ? value : `https://${value}`
      if (isSafeHref(url)) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
    }
    setLinking(false)
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor, state }) => !state.selection.empty && !editor.isActive("reference") && !editor.isActive("codeBlock")}
      className="z-40"
    >
      <div className="flex items-center gap-0.5 rounded-md bg-nav p-1 shadow-float">
        {linking ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              applyLink()
            }}
            className="flex items-center gap-1"
          >
            <input
              autoFocus
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setLinking(false)}
              placeholder="https://… ou /pages/…"
              aria-label="Endereço do link"
              className="h-7 w-56 rounded-xs bg-nav-2 px-2 text-xs text-paper outline-none placeholder:text-nav-muted"
            />
            <button type="submit" className="h-7 rounded-xs bg-cobalt px-2 text-xs text-white">
              OK
            </button>
          </form>
        ) : (
          <>
            <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Negrito" title="Negrito (Ctrl B)">
              <Bold />
            </button>
            <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Itálico" title="Itálico (Ctrl I)">
              <Italic />
            </button>
            <button type="button" className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="Tachado" title="Tachado">
              <Strikethrough />
            </button>
            <button type="button" className={btn(editor.isActive("code"))} onClick={() => editor.chain().focus().toggleCode().run()} aria-label="Código" title="Código">
              <Code />
            </button>
            <span className="mx-0.5 h-4 w-px bg-nav-3" />
            <button type="button" className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Título" title="Título">
              <Heading2 />
            </button>
            <button type="button" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Citação" title="Citação">
              <Quote />
            </button>
            <span className="mx-0.5 h-4 w-px bg-nav-3" />
            {editor.isActive("link") ? (
              <button type="button" className={btn(true)} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} aria-label="Remover link" title="Remover link">
                <Unlink />
              </button>
            ) : (
              <button
                type="button"
                className={btn(false)}
                onClick={() => {
                  setHref(editor.getAttributes("link").href ?? "")
                  setLinking(true)
                }}
                aria-label="Link"
                title="Link"
              >
                <Link2 />
              </button>
            )}
          </>
        )}
      </div>
    </BubbleMenu>
  )
}
