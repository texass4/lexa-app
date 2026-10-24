"use client"

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { createAreaAction, deleteAreaAction, moveAreaAction, setAreaArchivedAction, updateAreaAction } from "@/app/actions/areas"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { DropdownMenu } from "@/components/ui/menu"
import { cn } from "@/lib/cn"
import type { AreaItem } from "@/lib/services/areas"
import { AREA_COLOR_NAMES, AREA_COLORS } from "./colors"

type Result = { ok: true } | { ok: false; error: string }

export function NewAreaForm() {
  const [name, setName] = useState("")
  const [pending, start] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n) return
        start(async () => {
          const r = await createAreaAction({ name: n })
          if (!r.ok) return void toast.error(r.error)
          setName("")
        })
      }}
      className="flex gap-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova área (ex.: Saúde, Música, Estudos)" aria-label="Nome da nova área" className="field h-9 max-w-sm" maxLength={120} />
      <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
        Criar área
      </Button>
    </form>
  )
}

export function AreaRow({ area, first, last }: { area: AreaItem; first: boolean; last: boolean }) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(area.name)
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<Result | { ok: true; data: unknown }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
    })
  const archived = !!area.archivedAt
  return (
    <li className={cn("flex items-center gap-4 border-b border-line-soft py-3 last:border-b-0", pending && "opacity-60", archived && "opacity-70")}>
      <DropdownMenu
        align="start"
        items={Object.keys(AREA_COLORS).map((c) => ({ label: AREA_COLOR_NAMES[c]!, icon: <span className={cn("size-3 rounded-full", AREA_COLORS[c])} />, onSelect: () => run(() => updateAreaAction(area.id, { color: c as "sage" })) }))}
        trigger={<button className={cn("size-3.5 shrink-0 rounded-full ring-offset-2 hover:ring-2 hover:ring-line-strong", AREA_COLORS[area.color] ?? "bg-sage")} aria-label={`Cor da área ${area.name}`} />}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const n = name.trim()
              if (!n) return
              setEditing(false)
              if (n !== area.name) run(() => updateAreaAction(area.id, { name: n }))
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="field h-8 max-w-xs" aria-label="Novo nome" maxLength={120} />
          </form>
        ) : (
          <Link href={`/areas/${area.id}`} className="font-serif text-lg text-ink hover:underline">
            {area.name}
          </Link>
        )}
        <p className="meta mt-0.5">
          {area.openTasks} tarefas abertas · {area.activeProjects} projetos · {area.pages} páginas{archived ? " · arquivada" : ""}
        </p>
      </div>
      {!archived ? (
        <div className="flex">
          <button onClick={() => run(() => moveAreaAction(area.id, "up"))} disabled={first} className="rounded-sm p-1.5 text-ink-4 hover:bg-white hover:text-ink disabled:opacity-30" aria-label={`Mover ${area.name} para cima`}>
            <ArrowUp className="size-4" />
          </button>
          <button onClick={() => run(() => moveAreaAction(area.id, "down"))} disabled={last} className="rounded-sm p-1.5 text-ink-4 hover:bg-white hover:text-ink disabled:opacity-30" aria-label={`Mover ${area.name} para baixo`}>
            <ArrowDown className="size-4" />
          </button>
        </div>
      ) : null}
      <DropdownMenu
        items={[
          { label: "Renomear", icon: <Pencil />, onSelect: () => setEditing(true) },
          archived
            ? { label: "Desarquivar", icon: <ArchiveRestore />, onSelect: () => run(() => setAreaArchivedAction(area.id, false)) }
            : { label: "Arquivar", icon: <Archive />, onSelect: () => run(() => setAreaArchivedAction(area.id, true)) },
          { type: "separator" },
          {
            label: "Excluir",
            icon: <Trash2 />,
            danger: true,
            onSelect: async () => {
              const ok = await confirm({
                title: `Excluir a área “${area.name}”?`,
                description: "Tarefas, projetos, páginas e quadros continuam existindo, só deixam de estar nesta área. Para apenas esconder, use Arquivar.",
                confirmLabel: "Excluir área",
                danger: true,
              })
              if (ok) run(() => deleteAreaAction(area.id))
            },
          },
        ]}
        trigger={
          <button className="rounded-sm p-1.5 text-ink-4 hover:bg-white hover:text-ink" aria-label={`Ações da área ${area.name}`}>
            <MoreHorizontal className="size-4" />
          </button>
        }
      />
    </li>
  )
}
