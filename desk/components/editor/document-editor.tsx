"use client"

import type { Editor, JSONContent } from "@tiptap/react"
import { AlertTriangle, History } from "lucide-react"
import { useCallback, useRef, type ReactNode } from "react"
import { toast } from "sonner"
import { createPageAction } from "@/app/actions/pages"
import { createTaskAction } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"
import { SaveIndicator } from "@/components/ui/save-indicator"
import { putJson, useAutosave } from "@/lib/client/autosave"
import { hrefFor, type RefSummary } from "@/lib/domain/refs"
import { BlockEditor, type CreateRecord } from "./block-editor"
import { RefsProvider, useRefs } from "./refs-context"

type Props = {
  /** PUT recebe { content, baseVersion, force }. */
  saveUrl: string
  draftKey: string
  initialContent: JSONContent
  initialVersion: number
  initialRefs: Record<string, RefSummary>
  header?: ReactNode
  aside?: ReactNode
  placeholder?: string
  autofocus?: boolean
  onSaved?: (version: number) => void
}

/** Editor com salvamento automático, recuperação de rascunho e resolução de conflito. */
export function DocumentEditor(props: Props) {
  return (
    <RefsProvider initial={props.initialRefs}>
      <DocumentEditorInner {...props} />
    </RefsProvider>
  )
}

function DocumentEditorInner({ saveUrl, draftKey, initialContent, initialVersion, header, placeholder, autofocus, onSaved }: Props) {
  const editorRef = useRef<Editor | null>(null)
  const refs = useRefs()

  const save = useCallback(
    async (content: JSONContent, baseVersion: number, opts: { keepalive?: boolean; force?: boolean }) => {
      const result = await putJson(saveUrl, { content, baseVersion, force: opts.force }, { keepalive: opts.keepalive })
      if (result.ok) onSaved?.(result.version)
      return result
    },
    [saveUrl, onSaved],
  )

  const autosave = useAutosave<JSONContent>({ key: draftKey, initialVersion, save, serverValue: initialContent })

  const createRecord = useCallback<CreateRecord>(
    async (kind, title) => {
      const result = kind === "task" ? await createTaskAction({ title }) : await createPageAction({ title })
      if (!result.ok) {
        toast.error(result.error)
        return null
      }
      const summary: RefSummary = { type: kind, id: result.data.id, title, href: hrefFor(kind, result.data.id) }
      refs.put(summary)
      toast.success(kind === "task" ? "Tarefa criada e citada." : "Página criada e citada.")
      return summary
    },
    [refs],
  )

  const restoreDraft = () => {
    if (!autosave.draft || !editorRef.current) return
    editorRef.current.commands.setContent(autosave.draft.value)
    autosave.schedule(autosave.draft.value)
    autosave.discardDraft()
    toast.success("Rascunho recuperado.")
  }

  const keepServer = () => {
    const server = autosave.conflict?.content as JSONContent | undefined
    autosave.resolveConflict("theirs")
    if (server && editorRef.current) editorRef.current.commands.setContent(server, { emitUpdate: false })
  }

  return (
    <div>
      <div className="sticky top-12 z-20 -mx-2 mb-2 flex h-8 items-center justify-end px-2 md:top-0">
        <SaveIndicator status={autosave.status} onRetry={autosave.retry} className="rounded-xs bg-paper/90 px-1.5 py-0.5 backdrop-blur" />
      </div>
      {header}
      {autosave.draft ? (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-amber/40 bg-amber-soft px-4 py-3 text-sm">
          <History className="size-4 text-amber" />
          <span className="flex-1 text-ink-2">
            Há alterações deste documento que não chegaram a ser salvas (
            {new Date(autosave.draft.savedAt).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}).
            {autosave.draft.stale ? " O documento mudou desde então; recuperar substitui a versão atual." : ""}
          </span>
          <Button size="sm" variant="primary" onClick={restoreDraft}>
            Recuperar
          </Button>
          <Button size="sm" onClick={autosave.discardDraft}>
            Descartar
          </Button>
        </div>
      ) : null}
      {autosave.status === "conflict" ? (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-clay/40 bg-clay-soft px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-clay" />
          <span className="flex-1 text-ink-2">Este documento foi alterado em outra aba ou aparelho. Sua versão está guardada; escolha qual manter.</span>
          <Button size="sm" variant="primary" onClick={() => autosave.resolveConflict("mine")}>
            Manter a minha
          </Button>
          <Button size="sm" onClick={keepServer}>
            Usar a salva
          </Button>
        </div>
      ) : null}
      {autosave.status === "error" && autosave.errorMessage ? <p className="mb-4 text-sm text-clay">{autosave.errorMessage}</p> : null}
      <BlockEditor
        initialContent={initialContent}
        onChange={autosave.schedule}
        onReady={(editor) => {
          editorRef.current = editor
        }}
        createRecord={createRecord}
        placeholder={placeholder}
        autofocus={autofocus}
      />
    </div>
  )
}
