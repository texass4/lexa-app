"use client"

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import { usePageEditor } from "./editor-context"

/**
 * Passo de checklist: só texto marcado/desmarcado na página — não é tarefa, não tem
 * responsável nem prazo. "Converter em tarefa" cria a tarefa real (quadro) e troca o
 * passo pelo bloco da tarefa.
 */
export function ChecklistItemView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const ctx = usePageEditor()
  const checked = !!node.attrs.checked
  const editable = editor.isEditable
  const text = node.textContent.trim()

  const convert = () =>
    ctx.createTask({
      title: text,
      onCreated: (task) => {
        const pos = getPos()
        if (typeof pos !== "number") return
        const { state, view } = editor
        const $pos = state.doc.resolve(pos)
        const list = $pos.parent
        const listStart = $pos.before($pos.depth)
        // A tarefa entra logo depois do bloco de cima onde está a lista; o passo sai.
        const after = $pos.after(1)
        const tr = state.tr.insert(after, state.schema.nodes.taskRef.create({ taskId: task.id }))
        if (list.childCount === 1) tr.delete(listStart, listStart + list.nodeSize)
        else tr.delete(pos, pos + node.nodeSize)
        view.dispatch(tr)
      },
    })

  return (
    <NodeViewWrapper data-checked={checked} className="group/item flex items-start gap-2">
      <label contentEditable={false} className="touch-target relative mt-[0.28em] flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={!editable}
          onChange={(e) => updateAttributes({ checked: e.target.checked })}
          aria-label={text ? `Passo feito: ${text}` : "Passo feito"}
          className="size-[15px] cursor-pointer rounded-[4px] accent-[var(--brand)] disabled:cursor-default"
        />
      </label>
      <NodeViewContent as="div" className={cn("min-w-0 flex-1", checked && "text-subtle line-through decoration-subtle/60")} />
      {editable && ctx.canEditTasks && text && (
        <button
          type="button"
          contentEditable={false}
          onClick={convert}
          title="Criar uma tarefa (com responsável e prazo) a partir deste passo"
          className="mt-[0.1em] inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-subtle opacity-0 outline-none transition-opacity duration-150 group-hover/item:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/40 pointer-coarse:hidden"
        >
          Converter em tarefa <ArrowUpRight className="size-3" />
        </button>
      )}
    </NodeViewWrapper>
  )
}
