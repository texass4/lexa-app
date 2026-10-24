"use client"

import { ArrowUpRight, BookOpen, Check, FileText, ListChecks, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  captureAction,
  convertToPageAction,
  convertToTaskAction,
  deleteInboxItemAction,
  dismissInboxItemAction,
  moveToJournalAction,
  restoreInboxItemAction,
  updateInboxItemAction,
} from "@/app/actions/inbox"
import { REF_ICON } from "@/components/shell/ref-icons"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { DropdownMenu } from "@/components/ui/menu"
import { cn } from "@/lib/cn"
import { formatInstant } from "@/lib/domain/dates"
import { REF_LABEL, type RefSummary } from "@/lib/domain/refs"
import type { InboxItem } from "@/lib/services/inbox"

export function InboxCapture() {
  const [value, setValue] = useState("")
  const [pending, start] = useTransition()
  const submit = () => {
    const content = value.trim()
    if (!content) return
    start(async () => {
      const result = await captureAction(content)
      if (!result.ok) return void toast.error(result.error)
      setValue("")
    })
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="rounded-md border border-line bg-white p-2 focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={2}
        placeholder="O que está na sua cabeça? (Enter guarda, Shift+Enter quebra linha)"
        aria-label="Nova captura"
        className="field-sizing-content min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] outline-none placeholder:text-ink-5"
        maxLength={10000}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="meta">A primeira linha vira o título ao converter</span>
        <Button type="submit" size="sm" variant="ink" disabled={pending || !value.trim()}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  )
}

export function InboxItemRow({ item, timezone }: { item: InboxItem; timezone: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.content)
  const [first, ...rest] = item.content.split("\n")

  const run = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done?: (data: T) => void) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) return void toast.error(result.error)
      done?.(result.data)
    })

  const toTask = () =>
    run(
      () => convertToTaskAction(item.id),
      (task) =>
        toast.success(
          <span>
            Virou tarefa ·{" "}
            <Link className="underline" href={`/tasks/${task.id}`}>
              abrir
            </Link>
          </span>,
        ),
    )
  const toPage = () => run(() => convertToPageAction(item.id), (page) => router.push(`/pages/${page.id}`))
  const toJournal = () =>
    run(
      () => moveToJournalAction(item.id),
      (entry) =>
        toast.success(
          <span>
            Levado ao diário ·{" "}
            <Link className="underline" href={`/journal/${entry.date}`}>
              abrir
            </Link>
          </span>,
        ),
    )

  return (
    <li className={cn("group rounded-md border border-line bg-white px-4 py-3 transition-opacity", pending && "opacity-50")}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(() => updateInboxItemAction(item.id, draft), () => setEditing(false))
          }}
          className="flex flex-col gap-2"
        >
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus className="field field-sizing-content min-h-16 resize-none" aria-label="Editar captura" />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => (setDraft(item.content), setEditing(false))}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Salvar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] break-words text-ink">{first}</p>
            {rest.length ? <p className="mt-1 text-sm whitespace-pre-line text-ink-3">{rest.join("\n")}</p> : null}
            <p className="meta mt-1.5">{formatInstant(item.createdAt, timezone)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <Button size="sm" onClick={toTask} disabled={pending} title="Criar uma tarefa com este conteúdo">
              <ListChecks /> Tarefa
            </Button>
            <Button size="sm" onClick={toPage} disabled={pending} title="Criar uma página com este conteúdo">
              <FileText /> Página
            </Button>
            <Button size="sm" onClick={toJournal} disabled={pending} title="Acrescentar ao diário de hoje">
              <BookOpen /> Diário
            </Button>
            <DropdownMenu
              items={[
                { label: "Editar", icon: <Pencil />, onSelect: () => setEditing(true) },
                { label: "Marcar como resolvido", icon: <Check />, onSelect: () => run(() => dismissInboxItemAction(item.id)) },
                { type: "separator" },
                {
                  label: "Excluir",
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: async () => {
                    if (await confirm({ title: "Excluir esta captura?", description: "Ela será apagada definitivamente.", confirmLabel: "Excluir", danger: true })) run(() => deleteInboxItemAction(item.id))
                  },
                },
              ]}
              trigger={
                <button className="flex size-7 items-center justify-center rounded-sm text-ink-4 hover:bg-paper hover:text-ink" aria-label="Mais ações">
                  <MoreHorizontal className="size-4" />
                </button>
              }
            />
          </div>
        </div>
      )}
    </li>
  )
}

/** Item já organizado: mostra o registro criado (sempre o estado atual dele) ou que não existe mais. */
export function ProcessedRow({ item, timezone, target }: { item: InboxItem; timezone: string; target: RefSummary | null | undefined }) {
  const [, start] = useTransition()
  const Icon = item.convertedType ? REF_ICON[item.convertedType] : Check
  return (
    <li className="flex items-start gap-3 rounded-md border border-line-soft bg-white/60 px-4 py-3">
      <Icon className="mt-0.5 size-4 text-ink-4" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-3">{item.content.split("\n")[0]}</p>
        <p className="meta mt-1">
          {item.processedAt ? formatInstant(item.processedAt, timezone) : null}
          {" · "}
          {item.convertedType ? (target === null ? `${REF_LABEL[item.convertedType]} excluída(o)` : `virou ${REF_LABEL[item.convertedType].toLowerCase()}`) : "resolvido sem criar registro"}
        </p>
      </div>
      {target ? (
        <Link href={target.href} className="inline-flex shrink-0 items-center gap-1 text-xs text-cobalt-ink hover:underline">
          {target.title} <ArrowUpRight className="size-3" />
        </Link>
      ) : null}
      {!item.convertedType ? (
        <button
          onClick={() =>
            start(async () => {
              const r = await restoreInboxItemAction(item.id)
              if (!r.ok) toast.error(r.error)
            })
          }
          className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-3 hover:text-ink"
        >
          <RotateCcw className="size-3" /> Voltar para a caixa
        </button>
      ) : null}
    </li>
  )
}
