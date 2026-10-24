"use client"

import { mergeAttributes, Node } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react"
import Suggestion from "@tiptap/suggestion"
import { FilePlus2, ListPlus, Unlink } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { REF_ICON } from "@/components/shell/ref-icons"
import { cn } from "@/lib/cn"
import { hrefFor, isRefType, REF_LABEL, type RefSummary, type RefType } from "@/lib/domain/refs"
import type { SearchResult } from "@/lib/services/search"
import { useRefs } from "../refs-context"
import type { SuggestionItem } from "../suggestion-list"
import { renderSuggestion } from "./render-suggestion"

/*
 * Referência interna: um nó que guarda só tipo + id (+ o rótulo do momento, para o texto
 * de busca e para exibir se o registro sumir). O título mostrado vem sempre do registro atual.
 */

export type CreateRecord = (kind: "task" | "page", title: string) => Promise<RefSummary | null>

type ReferenceOptions = { createRecord?: CreateRecord }

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reference: { insertReference: (attrs: { refType: RefType; refId: string; label: string }) => ReturnType }
  }
}

function ReferenceView({ node }: ReactNodeViewProps) {
  const refs = useRefs()
  const type = node.attrs.refType as RefType
  const id = node.attrs.refId as string
  const ref = { type, id }
  useEffect(() => refs.track([ref]), [type, id]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = refs.get(ref)
  const missing = refs.isMissing(ref)
  const Icon = missing ? Unlink : REF_ICON[type]
  const title = summary?.title ?? (node.attrs.label as string) ?? REF_LABEL[type]
  return (
    <NodeViewWrapper as="span" className="mx-px inline-block align-baseline" data-ref-type={type}>
      <Link
        href={summary?.href ?? hrefFor(type, id)}
        contentEditable={false}
        title={missing ? `${REF_LABEL[type]} indisponível — o registro foi excluído` : `${REF_LABEL[type]}${summary?.status ? ` · ${summary.status}` : ""}`}
        className={cn(
          "inline-flex max-w-full items-baseline gap-1 rounded-xs border px-1 py-px text-[0.92em] leading-snug no-underline transition-colors",
          missing ? "border-dashed border-clay/50 bg-clay-soft/50 text-clay line-through" : "border-line bg-paper text-ink hover:border-cobalt hover:bg-cobalt-wash",
          summary?.statusTone === "done" && "text-ink-4",
        )}
      >
        <Icon className="size-[0.85em] shrink-0 translate-y-[0.1em] text-ink-4" />
        <span className={cn("truncate", summary?.statusTone === "done" && "line-through")}>{title}</span>
        {summary?.type === "task" && summary.status && summary.statusTone !== "neutral" ? <span className="font-mono text-[0.7em] text-ink-4 uppercase">{summary.status}</span> : null}
      </Link>
    </NodeViewWrapper>
  )
}

const SEARCH_TYPES: RefType[] = ["task", "page", "project", "journal", "board", "area"]

async function searchRefs(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&types=${SEARCH_TYPES.join(",")}&limit=4`, { signal })
  if (!res.ok) return []
  return ((await res.json()) as { results: SearchResult[] }).results
}

type RefItem = SuggestionItem & { result?: SearchResult; create?: "task" | "page"; query?: string }

export const Reference = Node.create<ReferenceOptions>({
  name: "reference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { createRecord: undefined }
  },

  addAttributes() {
    return {
      refType: { default: null, parseHTML: (el) => el.getAttribute("data-ref-type"), renderHTML: (a) => ({ "data-ref-type": a.refType }) },
      refId: { default: null, parseHTML: (el) => el.getAttribute("data-ref-id"), renderHTML: (a) => ({ "data-ref-id": a.refId }) },
      label: { default: "", parseHTML: (el) => el.textContent ?? "", renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-ref-type][data-ref-id]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "mesa-ref" }), node.attrs.label || REF_LABEL[node.attrs.refType as RefType] || ""]
  },

  renderText({ node }) {
    return node.attrs.label as string
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceView)
  },

  addCommands() {
    return {
      insertReference:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name, attrs }, { type: "text", text: " " }])
            .run(),
    }
  },

  addProseMirrorPlugins() {
    const createRecord = this.options.createRecord
    return [
      Suggestion<RefItem, RefItem>({
        editor: this.editor,
        pluginKey: new PluginKey("reference-suggestion"),
        char: "@",
        allowSpaces: true,
        placement: "bottom-start",
        debounce: 150,
        items: async ({ query, signal }) => {
          const results = await searchRefs(query, signal).catch(() => [] as SearchResult[])
          const items: RefItem[] = results.map((r) => ({
            id: `${r.type}:${r.id}`,
            title: r.title,
            subtitle: r.meta ?? r.snippet ?? undefined,
            icon: REF_ICON[r.type],
            group: REF_LABEL[r.type],
            result: r,
          }))
          const q = query.trim()
          if (q && createRecord) {
            items.push({ id: "create-task", title: `Criar tarefa “${q}”`, icon: ListPlus, group: "Criar", create: "task", query: q })
            items.push({ id: "create-page", title: `Criar página “${q}”`, icon: FilePlus2, group: "Criar", create: "page", query: q })
          }
          return items
        },
        command: ({ editor, range, props }) => {
          if (props.result) {
            editor.chain().focus().deleteRange(range).insertReference({ refType: props.result.type, refId: props.result.id, label: props.result.title }).run()
            return
          }
          if (props.create && createRecord && props.query) {
            editor.chain().focus().deleteRange(range).run()
            void createRecord(props.create, props.query).then((summary) => {
              if (summary && isRefType(summary.type)) editor.chain().focus().insertReference({ refType: summary.type, refId: summary.id, label: summary.title }).run()
            })
          }
        },
        render: renderSuggestion("Digite para buscar tarefas, páginas, projetos, diário e quadros."),
      }),
    ]
  },
})
