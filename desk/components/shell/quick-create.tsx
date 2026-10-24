"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { captureAction } from "@/app/actions/inbox"
import { createTaskAction } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { addDays } from "@/lib/domain/dates"
import { PRIORITY_LABEL, TASK_PRIORITIES, taskCode, type TaskPriority } from "@/lib/domain/tasks"
import { useShell, type QuickTaskDefaults } from "./shell-context"

/** Criação rápida de tarefa: só o título é obrigatório. */
export function QuickTaskDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (open: boolean) => void; defaults: QuickTaskDefaults }) {
  const shell = useShell()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const submit = (form: FormData) => {
    setError(null)
    const title = String(form.get("title") ?? "").trim()
    if (!title) return setError("Dê um título à tarefa.")
    start(async () => {
      const result = await createTaskAction({
        title,
        dueDate: (form.get("dueDate") as string) || null,
        priority: (form.get("priority") as TaskPriority) || "medium",
        projectId: (form.get("projectId") as string) || null,
        areaId: (form.get("areaId") as string) || null,
        startDate: defaults.startDate ?? null,
      })
      if (!result.ok) return setError(result.error)
      onOpenChange(false)
      toast.success(
        <span>
          Tarefa criada ·{" "}
          <Link href={`/tasks/${result.data.id}`} className="font-mono underline">
            {taskCode(result.data.number)}
          </Link>
        </span>,
      )
    })
  }

  const quickDates = [
    { label: "Hoje", value: shell.today },
    { label: "Amanhã", value: addDays(shell.today, 1) },
    { label: "Em 1 semana", value: addDays(shell.today, 7) },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nova tarefa">
      <form action={submit} className="flex flex-col gap-4" key={JSON.stringify(defaults) + String(open)}>
        <div>
          <label htmlFor="qt-title" className="sr-only">
            Título
          </label>
          <input
            id="qt-title"
            name="title"
            defaultValue={defaults.title ?? ""}
            autoFocus
            placeholder="O que precisa ser feito?"
            className="field h-11 text-base"
            aria-invalid={error ? true : undefined}
            maxLength={300}
          />
        </div>
        <DueDateField defaultValue={defaults.dueDate ?? ""} quick={quickDates} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Prioridade</span>
            <select name="priority" defaultValue="medium" className="field">
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Projeto</span>
            <select name="projectId" defaultValue={defaults.projectId ?? ""} className="field">
              <option value="">Nenhum</option>
              {shell.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Área</span>
            <select name="areaId" defaultValue={defaults.areaId ?? ""} className="field">
              <option value="">Nenhuma</option>
              {shell.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-clay">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
          <span className="meta hidden sm:inline">Enter cria · Esc cancela</span>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Criando…" : "Criar tarefa"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

function DueDateField({ defaultValue, quick }: { defaultValue: string; quick: { label: string; value: string }[] }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">Prazo</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" name="dueDate" value={value} onChange={(e) => setValue(e.target.value)} className="field w-auto" aria-label="Prazo" />
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setValue(q.value)}
            className={`h-8 rounded-sm border px-2.5 text-xs transition-colors ${value === q.value ? "border-cobalt bg-cobalt-wash text-cobalt-ink" : "border-line text-ink-3 hover:border-line-strong hover:text-ink"}`}
          >
            {q.label}
          </button>
        ))}
        {value ? (
          <button type="button" onClick={() => setValue("")} className="h-8 px-2 text-xs text-ink-4 hover:text-ink">
            Sem prazo
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Captura para a caixa de entrada: um campo, nada mais. */
export function CaptureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const submit = (form: FormData) => {
    const content = String(form.get("content") ?? "").trim()
    if (!content) return setError("Escreva algo para capturar.")
    start(async () => {
      const result = await captureAction(content)
      if (!result.ok) return setError(result.error)
      onOpenChange(false)
      toast.success("Guardado na caixa de entrada.")
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Captura rápida" description="Anote agora, organize depois na caixa de entrada.">
      <form action={submit} className="flex flex-col gap-3" key={String(open)}>
        <textarea
          name="content"
          autoFocus
          rows={4}
          placeholder="Uma ideia, uma tarefa, um lembrete…"
          className="field resize-none text-[0.9375rem]"
          aria-label="Conteúdo"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
          }}
        />
        {error ? (
          <p role="alert" className="text-sm text-clay">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="meta">Ctrl/⌘ + Enter guarda</span>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
