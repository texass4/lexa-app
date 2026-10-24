"use client"

import { Archive, ArchiveRestore, ArrowLeft, Info, MoreHorizontal, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { deleteBoardAction, setBoardArchivedAction, updateBoardMetaAction } from "@/app/actions/boards"
import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/menu"
import { SaveIndicator } from "@/components/ui/save-indicator"
import type { SaveStatus } from "@/lib/client/autosave"
import type { BoardDetail } from "@/lib/services/boards"

export function BoardTopBar({ board, status, onRetry }: { board: BoardDetail; status: SaveStatus; onRetry: () => void }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [title, setTitle] = useState(board.title)
  const [details, setDetails] = useState(false)
  const [, start] = useTransition()
  const saveTitle = () => {
    const t = title.trim()
    if (t === board.title) return
    start(async () => {
      const r = await updateBoardMetaAction(board.id, { title: t })
      if (!r.ok) toast.error(r.error)
    })
  }
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-white/95 py-1 pr-1 pl-1.5 shadow-lift backdrop-blur">
      <Link href={board.projectId ? `/projects/${board.projectId}` : "/canvas"} className="flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-paper hover:text-ink" aria-label="Voltar">
        <ArrowLeft className="size-4" />
      </Link>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        placeholder="Quadro sem título"
        aria-label="Nome do quadro"
        maxLength={200}
        className="field-ghost h-8 w-40 px-2 font-serif text-base text-ink sm:w-64"
      />
      {board.projectTitle ? <span className="hidden truncate px-1 text-xs text-ink-4 lg:inline">{board.projectTitle}</span> : null}
      <SaveIndicator status={status} onRetry={onRetry} className="px-2" />
      <DropdownMenu
        items={[
          { label: "Detalhes do quadro", icon: <Info />, onSelect: () => setDetails(true) },
          board.archivedAt
            ? { label: "Desarquivar", icon: <ArchiveRestore />, onSelect: () => start(async () => void (await setBoardArchivedAction(board.id, false))) }
            : {
                label: "Arquivar",
                icon: <Archive />,
                onSelect: () =>
                  start(async () => {
                    const r = await setBoardArchivedAction(board.id, true)
                    if (r.ok) toast.success("Quadro arquivado.")
                  }),
              },
          { type: "separator" },
          {
            label: "Excluir quadro",
            icon: <Trash2 />,
            danger: true,
            onSelect: async () => {
              const ok = await confirm({
                title: "Excluir este quadro?",
                description: "Elementos e conexões do quadro serão apagados. Tarefas, páginas e projetos vinculados não são afetados.",
                confirmLabel: "Excluir quadro",
                danger: true,
              })
              if (!ok) return
              const r = await deleteBoardAction(board.id)
              if (!r.ok) return void toast.error(r.error)
              router.push("/canvas")
            },
          },
        ]}
        trigger={
          <button className="flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-paper hover:text-ink" aria-label="Ações do quadro">
            <MoreHorizontal className="size-4" />
          </button>
        }
      />
      <BoardDetailsDialog board={board} open={details} onOpenChange={setDetails} />
    </div>
  )
}

function BoardDetailsDialog({ board, open, onOpenChange }: { board: BoardDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { projects, areas } = useShell()
  const [pending, start] = useTransition()
  const submit = (form: FormData) =>
    start(async () => {
      const r = await updateBoardMetaAction(board.id, {
        description: String(form.get("description") ?? ""),
        projectId: (form.get("projectId") as string) || null,
        areaId: (form.get("areaId") as string) || null,
      })
      if (!r.ok) return void toast.error(r.error)
      onOpenChange(false)
    })
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Detalhes do quadro">
      <form action={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Descrição</span>
          <textarea name="description" defaultValue={board.description} rows={3} className="field resize-none" maxLength={5000} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Projeto</span>
            <select name="projectId" defaultValue={board.projectId ?? ""} className="field">
              <option value="">Nenhum</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Área</span>
            <select name="areaId" defaultValue={board.areaId ?? ""} className="field">
              <option value="">Nenhuma</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
