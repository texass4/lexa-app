"use client"

import * as React from "react"
import { useEditorState, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { Bold, Code, Heading2, Italic, Link2, ListChecks, Strikethrough, Unlink } from "lucide-react"
import { cn } from "cn"
import { usePageEditor } from "./editor-context"

/** Aceita http(s), e-mail e telefone; o resto vira https:// (nunca javascript:). */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`
  return `https://${value}`
}

const btn =
  "flex h-8 min-w-8 items-center justify-center gap-1 rounded-[7px] px-1.5 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 data-[active=true]:bg-brand-soft data-[active=true]:text-brand-strong"

/**
 * Barra que aparece ao selecionar texto: formatação, link e "Criar tarefa" com o texto
 * selecionado (a tarefa entra como bloco logo abaixo; o texto continua na página).
 */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  const ctx = usePageEditor()
  const [linking, setLinking] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const [urlError, setUrlError] = React.useState(false)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  })

  const openLink = () => {
    setUrl(state.href)
    setUrlError(false)
    setLinking(true)
  }
  const applyLink = (e: React.FormEvent) => {
    e.preventDefault()
    const href = normalizeUrl(url)
    if (url.trim() && !href) return setUrlError(true)
    const chain = editor.chain().focus().extendMarkRange("link")
    if (href) chain.setLink({ href }).run()
    else chain.unsetLink().run()
    setLinking(false)
  }

  const createTask = () => {
    const { from, to } = editor.state.selection
    const title = editor.state.doc.textBetween(from, to, " ").trim().slice(0, 200)
    const after = editor.state.selection.$to.after(1)
    ctx.createTask({
      title,
      onCreated: (task) => {
        const pos = Math.min(after, editor.state.doc.content.size)
        editor
          .chain()
          .insertContentAt(pos, { type: "taskRef", attrs: { taskId: task.id } })
          .run()
      },
    })
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8, onHide: () => setLinking(false) }}
      shouldShow={({ editor: e, from, to }) => {
        if (!e.isEditable || from === to) return false
        if (e.isActive("codeBlock") || e.isActive("taskRef")) return false
        return e.state.doc.textBetween(from, to, " ").trim().length > 0
      }}
      className="z-40 flex items-center gap-0.5 rounded-[11px] border border-border bg-popover p-1 shadow-float"
    >
      {linking ? (
        <form onSubmit={applyLink} className="flex items-center gap-1">
          <label className="sr-only" htmlFor="page-link-url">
            Endereço do link
          </label>
          <input
            id="page-link-url"
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setUrlError(false)
            }}
            onKeyDown={(e) => e.key === "Escape" && setLinking(false)}
            placeholder="Cole ou digite o link"
            aria-invalid={urlError}
            className={cn(
              "h-8 w-[min(260px,60vw)] rounded-[7px] border bg-surface px-2 text-[13px] outline-none focus:border-brand/60",
              urlError ? "border-danger" : "border-border",
            )}
          />
          <button type="submit" className={cn(btn, "px-2.5 text-brand-strong")}>
            OK
          </button>
          {state.link && (
            <button
              type="button"
              className={btn}
              aria-label="Remover link"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run()
                setLinking(false)
              }}
            >
              <Unlink className="size-4" />
            </button>
          )}
        </form>
      ) : (
        <>
          <button
            type="button"
            className={btn}
            data-active={state.bold}
            aria-pressed={state.bold}
            aria-label="Negrito (Ctrl+B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </button>
          <button
            type="button"
            className={btn}
            data-active={state.italic}
            aria-pressed={state.italic}
            aria-label="Itálico (Ctrl+I)"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </button>
          <button
            type="button"
            className={btn}
            data-active={state.strike}
            aria-pressed={state.strike}
            aria-label="Tachado"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-4" />
          </button>
          <button
            type="button"
            className={btn}
            data-active={state.code}
            aria-pressed={state.code}
            aria-label="Código"
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-4" />
          </button>
          <button
            type="button"
            className={btn}
            data-active={state.h2}
            aria-pressed={state.h2}
            aria-label="Título"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-4" />
          </button>
          <button type="button" className={btn} data-active={state.link} aria-label={state.link ? "Editar link" : "Inserir link"} onClick={openLink}>
            <Link2 className="size-4" />
          </button>
          {ctx.canEditTasks && (
            <>
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
              <button type="button" className={cn(btn, "px-2")} onClick={createTask} title="Criar uma tarefa com o texto selecionado">
                <ListChecks className="size-4" /> <span className="max-sm:sr-only">Criar tarefa</span>
              </button>
            </>
          )}
        </>
      )}
    </BubbleMenu>
  )
}
