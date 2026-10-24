"use client"

import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { deleteProjectAction, updateProjectAction } from "@/app/actions/projects"
import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { ProgressBar } from "@/components/ui/progress"
import { SaveIndicator } from "@/components/ui/save-indicator"
import type { SaveStatus } from "@/lib/client/autosave"
import type { ProjectItem } from "@/lib/services/projects"
import { PROJECT_STATUS_OPTIONS } from "./status"

type Patch = Parameters<typeof updateProjectAction>[1]

/** Cabeçalho editável do projeto. Excluir não apaga tarefas, páginas nem quadros. */
export function ProjectHeader({ project }: { project: ProjectItem }) {
  const router = useRouter()
  const confirm = useConfirm()
  const { areas } = useShell()
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [, start] = useTransition()
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description)

  const save = (patch: Patch) =>
    start(async () => {
      setStatus("saving")
      const result = await updateProjectAction(project.id, patch)
      if (!result.ok) {
        setStatus("error")
        toast.error(result.error)
        return
      }
      setStatus("saved")
    })

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir “${project.title}”?`,
      description: "Tarefas, páginas e quadros do projeto continuam existindo — só deixam de estar ligados a ele. Para guardar o projeto, prefira Arquivar.",
      confirmLabel: "Excluir projeto",
      danger: true,
    })
    if (!ok) return
    const result = await deleteProjectAction(project.id)
    if (!result.ok) return void toast.error(result.error)
    const { tasks, pages, boards } = result.data
    toast.success(`Projeto excluído. ${tasks} tarefa(s), ${pages} página(s) e ${boards} quadro(s) continuam disponíveis.`)
    router.push("/projects")
  }

  return (
    <header className="mb-10">
      <p className="eyebrow mb-2">Projeto</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const t = title.trim()
          if (!t) return setTitle(project.title)
          if (t !== project.title) save({ title: t })
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label="Nome do projeto"
        maxLength={200}
        className="field-ghost -ml-2 px-2 py-0.5 font-serif text-[2.2rem] leading-tight tracking-tight text-ink md:text-[2.6rem]"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== project.description && save({ description })}
        placeholder="Descreva o resultado esperado…"
        aria-label="Descrição"
        className="field-ghost field-sizing-content -ml-2 mt-1 min-h-8 resize-none px-2 py-1 text-[0.9375rem] text-ink-3"
      />
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Status</span>
          <select value={project.status} onChange={(e) => save({ status: e.target.value as ProjectItem["status"] })} className="field h-8 w-auto py-0 text-xs">
            {PROJECT_STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Área</span>
          <select value={project.areaId ?? ""} onChange={(e) => save({ areaId: e.target.value || null })} className="field h-8 w-auto py-0 text-xs">
            <option value="">Nenhuma</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Início</span>
          <input type="date" value={project.startDate ?? ""} onChange={(e) => save({ startDate: e.target.value || null })} className="field h-8 w-auto py-0 text-xs" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Meta</span>
          <input type="date" value={project.targetDate ?? ""} onChange={(e) => save({ targetDate: e.target.value || null })} className="field h-8 w-auto py-0 text-xs" />
        </label>
        <SaveIndicator status={status} className="mb-2" />
        <Button size="sm" variant="ghost" className="ml-auto text-clay hover:bg-clay-soft hover:text-clay" onClick={remove}>
          <Trash2 /> Excluir
        </Button>
      </div>
      <div className="mt-6 max-w-md">
        <ProgressBar progress={project.progress} />
      </div>
    </header>
  )
}
