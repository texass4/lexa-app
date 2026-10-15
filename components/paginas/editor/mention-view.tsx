"use client"

import Link from "next/link"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { FileText, ListChecks, Scale, UserRound } from "lucide-react"
import { cn } from "cn"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useSession } from "@/lib/auth/session"
import { describeRelated } from "@/lib/store/selectors"
import { usePages } from "@/lib/paginas/pages"
import { pageHref, pageTitle } from "@/lib/paginas/model"
import { usePageEditor } from "./editor-context"
import { useRemoteTask } from "./remote-task"
import type { MentionKind } from "./extensions"

const ICON = { client: UserRound, process: Scale, task: ListChecks, page: FileText } satisfies Record<MentionKind, unknown>
const KIND = { client: "Cliente", process: "Processo", task: "Tarefa", page: "Página" } satisfies Record<MentionKind, string>

const chip =
  "mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-[6px] bg-brand-soft/70 px-1.5 py-px align-baseline text-[0.94em] font-medium text-brand-strong no-underline outline-none transition-colors duration-150 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/40"

/**
 * Menção a um registro do Íntegra. O nome é lido do registro na hora (nunca do texto
 * salvo): quem não tem acesso ao registro vê só "indisponível", sem o nome.
 */
export function MentionView({ node, selected }: NodeViewProps) {
  const kind = node.attrs.kind as MentionKind
  const id = (node.attrs.id as string | null) ?? ""
  const data = useOfficeData()
  const { can } = useSession()
  const { pages } = usePages()
  const ctx = usePageEditor()
  const localTask = kind === "task" ? byId(data.tasks, id) : undefined
  const remote = useRemoteTask(kind === "task" && !localTask ? id : null)
  const Icon = ICON[kind] ?? FileText

  let label: string | undefined
  let href: string | undefined
  let done = false
  if ((kind === "client" && can("clients.view")) || (kind === "process" && can("processes.view"))) {
    const r = describeRelated(data, { type: kind, id })
    if (r) [label, href] = [r.label, r.href]
  } else if (kind === "page") {
    const p = pages.get(id)
    if (p) [label, href] = [pageTitle(p), pageHref(p.id)]
  } else if (kind === "task") {
    const t = localTask ?? (remote?.status === "found" ? remote.task : undefined)
    if (t) {
      label = t.title
      done = t.status === "concluida"
    }
  }

  const content = (
    <>
      <Icon className="size-[0.85em] shrink-0 translate-y-[0.1em] opacity-80" aria-hidden />
      <span className={cn("truncate", done && "line-through decoration-brand-strong/50")}>{label ?? `${KIND[kind] ?? "Registro"} indisponível`}</span>
    </>
  )

  return (
    <NodeViewWrapper as="span" className={cn("inline", selected && "rounded-[6px] ring-2 ring-brand/30")}>
      {!label ? (
        <span contentEditable={false} className={cn(chip, "bg-surface-muted text-subtle hover:bg-surface-muted")} title="Excluído ou sem acesso">
          {content}
        </span>
      ) : kind === "task" ? (
        <button type="button" contentEditable={false} onClick={() => ctx.openTask(id)} className={chip} title={`${KIND.task}: abrir detalhes`}>
          {content}
        </button>
      ) : (
        <Link href={href!} contentEditable={false} className={chip} title={`${KIND[kind]}: abrir`}>
          {content}
        </Link>
      )}
    </NodeViewWrapper>
  )
}
