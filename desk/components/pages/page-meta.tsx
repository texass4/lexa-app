"use client"

import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { deletePageAction, setPageArchivedAction, updatePageMetaAction } from "@/app/actions/pages"
import { useShell } from "@/components/shell/shell-context"
import { useConfirm } from "@/components/ui/confirm"
import { DropdownMenu } from "@/components/ui/menu"
import type { PageDetail } from "@/lib/services/pages"

/** Título (renomear) e associações da página. O conteúdo é salvo pelo editor. */
export function PageTitle({ page }: { page: PageDetail }) {
  const [title, setTitle] = useState(page.title)
  const saved = useRef(page.title)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = (value: string) => {
    if (timer.current) clearTimeout(timer.current)
    const clean = value.trim()
    if (clean === saved.current) return
    saved.current = clean
    void updatePageMetaAction(page.id, { title: clean }).then((r) => !r.ok && toast.error(r.error))
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return (
    <textarea
      value={title}
      rows={1}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, "")
        setTitle(v)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(v), 900)
      }}
      onBlur={() => commit(title)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit(title)
          // Enter leva o cursor para o conteúdo.
          ;(document.querySelector(".prose-mesa") as HTMLElement | null)?.focus()
        }
      }}
      placeholder="Sem título"
      aria-label="Título da página"
      maxLength={300}
      className="field-sizing-content w-full resize-none bg-transparent font-serif text-[2.4rem] leading-[1.1] tracking-tight text-ink outline-none placeholder:text-ink-5 md:text-[2.8rem]"
    />
  )
}

export function PageMeta({ page }: { page: PageDetail }) {
  const { projects, areas } = useShell()
  const router = useRouter()
  const confirm = useConfirm()
  const [, start] = useTransition()
  const save = (meta: { projectId?: string | null; areaId?: string | null }) =>
    start(async () => {
      const r = await updatePageMetaAction(page.id, meta)
      if (!r.ok) toast.error(r.error)
    })
  const archived = !!page.archivedAt
  return (
    <div className="mt-3 mb-8 flex flex-wrap items-center gap-2">
      {archived ? <span className="rounded-xs bg-paper-3 px-1.5 py-0.5 text-xs text-ink-3">Arquivada</span> : null}
      <select value={page.projectId ?? ""} onChange={(e) => save({ projectId: e.target.value || null })} aria-label="Projeto" className="field h-7 w-auto border-transparent bg-transparent py-0 text-xs text-ink-3 hover:border-line hover:bg-white">
        <option value="">Sem projeto</option>
        {page.projectId && !projects.some((p) => p.id === page.projectId) ? <option value={page.projectId}>{page.projectTitle}</option> : null}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            Projeto: {p.label}
          </option>
        ))}
      </select>
      <select value={page.areaId ?? ""} onChange={(e) => save({ areaId: e.target.value || null })} aria-label="Área" className="field h-7 w-auto border-transparent bg-transparent py-0 text-xs text-ink-3 hover:border-line hover:bg-white">
        <option value="">Sem área</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            Área: {a.label}
          </option>
        ))}
      </select>
      <DropdownMenu
        items={[
          archived
            ? { label: "Desarquivar", icon: <ArchiveRestore />, onSelect: () => start(async () => void (await setPageArchivedAction(page.id, false))) }
            : {
                label: "Arquivar",
                icon: <Archive />,
                onSelect: () =>
                  start(async () => {
                    const r = await setPageArchivedAction(page.id, true)
                    if (r.ok) toast.success("Página arquivada. Ela continua acessível em Páginas › Arquivadas.")
                  }),
              },
          { type: "separator" },
          {
            label: "Excluir",
            icon: <Trash2 />,
            danger: true,
            onSelect: async () => {
              const ok = await confirm({
                title: "Excluir esta página?",
                description: "O conteúdo será apagado definitivamente. Referências a ela em outros documentos e quadros aparecerão como indisponíveis. Para guardar, use Arquivar.",
                confirmLabel: "Excluir página",
                danger: true,
              })
              if (!ok) return
              const r = await deletePageAction(page.id)
              if (!r.ok) return void toast.error(r.error)
              toast.success("Página excluída.")
              router.push("/pages")
            },
          },
        ]}
        trigger={
          <button className="ml-auto flex size-7 items-center justify-center rounded-sm text-ink-4 hover:bg-white hover:text-ink" aria-label="Ações da página">
            <MoreHorizontal className="size-4" />
          </button>
        }
      />
    </div>
  )
}
