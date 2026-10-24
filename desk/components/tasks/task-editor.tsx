"use client"

import { Archive, Plus, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import { addSubtaskAction, deleteSubtaskAction, deleteTaskAction, updateSubtaskAction, updateTaskAction } from "@/app/actions/tasks"
import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { SaveIndicator } from "@/components/ui/save-indicator"
import type { SaveStatus } from "@/lib/client/autosave"
import { cn } from "@/lib/cn"
import type { Recurrence } from "@/lib/db/schema"
import { formatLocalDate } from "@/lib/domain/dates"
import { describeRecurrence, isOverdue, PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/domain/tasks"
import type { TaskDetail } from "@/lib/services/tasks"
import type { UpdateTaskInput } from "@/lib/validation"
import { TaskCheckbox } from "./task-checkbox"

/** Edição da tarefa: cada campo grava ao mudar, com indicador de salvamento. */
export function TaskEditor({ task }: { task: TaskDetail }) {
  const router = useRouter()
  const confirm = useConfirm()
  const shell = useShell()
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()
  const [lastPatch, setLastPatch] = useState<UpdateTaskInput | null>(null)

  const save = (patch: UpdateTaskInput) =>
    start(async () => {
      setStatus("saving")
      setLastPatch(patch)
      const result = await updateTaskAction(task.id, patch)
      if (!result.ok) {
        setStatus("error")
        setError(result.error)
        toast.error(result.error)
        return
      }
      setError(null)
      setStatus("saved")
      if (result.data.spawned?.dueDate) toast.success(`Próxima ocorrência criada para ${formatLocalDate(result.data.spawned.dueDate, { day: "numeric", month: "short" })}.`)
    })

  const remove = async () => {
    const ok = await confirm({
      title: "Excluir esta tarefa?",
      description: "A tarefa e as subtarefas serão apagadas. Quadros que a mostram passam a exibir “referência indisponível”. Para guardar sem excluir, use Arquivar.",
      confirmLabel: "Excluir",
      danger: true,
    })
    if (!ok) return
    const result = await deleteTaskAction(task.id)
    if (!result.ok) return void toast.error(result.error)
    toast.success("Tarefa excluída.")
    router.push("/tasks")
  }

  const overdue = isOverdue(task, shell.today)
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-3">
        <div className="pt-3.5">
          <TaskCheckbox status={task.status} onToggle={() => save({ status: task.status === "done" ? "todo" : "done" })} label={task.title} />
        </div>
        <TitleField key={task.title} value={task.title} onSave={(title) => save({ title })} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Status" className="flex flex-wrap rounded-sm border border-line bg-white p-0.5">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={task.status === s}
              onClick={() => task.status !== s && save({ status: s })}
              className={cn(
                "h-7 rounded-xs px-2.5 text-xs transition-colors",
                task.status === s ? (s === "done" ? "bg-sage-ink text-white" : s === "in_progress" ? "bg-cobalt text-white" : s === "archived" ? "bg-ink-3 text-white" : "bg-ink text-paper") : "text-ink-3 hover:text-ink",
              )}
            >
              {STATUS_LABEL[s as TaskStatus]}
            </button>
          ))}
        </div>
        <SaveIndicator status={status} onRetry={lastPatch ? () => save(lastPatch) : undefined} />
        {error && status === "error" ? <span className="text-xs text-clay">{error}</span> : null}
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-md border border-line bg-white p-5 sm:grid-cols-2">
        <Field label="Prioridade">
          <select value={task.priority} onChange={(e) => save({ priority: e.target.value as TaskDetail["priority"] })} className="field">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimativa">
          <EstimateField value={task.estimateMinutes} onSave={(estimateMinutes) => save({ estimateMinutes })} />
        </Field>
        <Field label="Início">
          <input type="date" value={task.startDate ?? ""} max={task.dueDate ?? undefined} onChange={(e) => save({ startDate: e.target.value || null })} className="field" />
        </Field>
        <Field label={overdue ? "Prazo · atrasada" : "Prazo"} danger={overdue}>
          <input type="date" value={task.dueDate ?? ""} min={task.startDate ?? undefined} onChange={(e) => save({ dueDate: e.target.value || null })} className="field" aria-invalid={overdue || undefined} />
        </Field>
        <Field label="Projeto">
          <select value={task.projectId ?? ""} onChange={(e) => save({ projectId: e.target.value || null })} className="field">
            <option value="">Nenhum</option>
            {task.projectId && !shell.projects.some((p) => p.id === task.projectId) ? <option value={task.projectId}>{task.projectTitle}</option> : null}
            {shell.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Área">
          <select value={task.areaId ?? ""} onChange={(e) => save({ areaId: e.target.value || null })} className="field">
            <option value="">Nenhuma</option>
            {task.areaId && !shell.areas.some((a) => a.id === task.areaId) ? <option value={task.areaId}>{task.areaName}</option> : null}
            {shell.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repetição">
          <RecurrenceField value={task.recurrence} onSave={(recurrence) => save({ recurrence })} />
        </Field>
        <Field label="Tags">
          <TagsField key={task.tags.map((t) => t.name).join(",")} value={task.tags.map((t) => t.name)} onSave={(tags) => save({ tags })} />
        </Field>
      </dl>

      <section>
        <h2 className="eyebrow mb-2">Descrição</h2>
        <DescriptionField key={task.description} value={task.description} onSave={(description) => save({ description })} />
      </section>

      <Subtasks task={task} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <div className="flex gap-2">
          {task.status !== "archived" ? (
            <Button size="sm" onClick={() => save({ status: "archived" })}>
              <Archive /> Arquivar
            </Button>
          ) : (
            <Button size="sm" onClick={() => save({ status: "todo" })}>
              Desarquivar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-clay hover:bg-clay-soft hover:text-clay" onClick={remove}>
            <Trash2 /> Excluir
          </Button>
        </div>
        {task.recurrence ? <span className="meta">{describeRecurrence(task.recurrence)} · ao concluir, a próxima é criada</span> : null}
      </div>
    </div>
  )
}

function Field({ label, children, danger }: { label: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className={cn("eyebrow", danger && "text-clay")}>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function TitleField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const commit = () => {
    const clean = draft.trim()
    if (!clean) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (clean !== value) onSave(clean)
  }
  return (
    <div className="min-w-0 flex-1">
      <textarea
        value={draft}
        rows={1}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
          if (e.key === "Escape") setDraft(value)
        }}
        aria-label="Título da tarefa"
        aria-invalid={invalid || undefined}
        maxLength={300}
        className="field-ghost field-sizing-content resize-none px-2 py-1 font-serif text-[2rem] leading-tight tracking-tight text-ink"
      />
      {invalid ? (
        <p role="alert" className="px-2 text-sm text-clay">
          O título não pode ficar vazio.
        </p>
      ) : null}
    </div>
  )
}

function DescriptionField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      placeholder="Contexto, links, critérios de pronto…"
      aria-label="Descrição"
      className="field field-sizing-content min-h-28 resize-y leading-relaxed"
      maxLength={20000}
    />
  )
}

function EstimateField({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const presets = [15, 30, 60, 120, 240]
  const label = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`)
  return (
    <select value={value && presets.includes(value) ? String(value) : value ? "custom" : ""} onChange={(e) => (e.target.value === "custom" ? null : onSave(e.target.value ? Number(e.target.value) : null))} className="field">
      <option value="">Sem estimativa</option>
      {presets.map((p) => (
        <option key={p} value={p}>
          {label(p)}
        </option>
      ))}
      {value && !presets.includes(value) ? <option value="custom">{value} min</option> : null}
    </select>
  )
}

function RecurrenceField({ value, onSave }: { value: Recurrence | null; onSave: (v: Recurrence | null) => void }) {
  return (
    <div className="flex gap-2">
      <select
        value={value?.freq ?? ""}
        onChange={(e) => onSave(e.target.value ? { freq: e.target.value as Recurrence["freq"], interval: value?.interval ?? 1 } : null)}
        className="field"
        aria-label="Frequência"
      >
        <option value="">Não repete</option>
        <option value="daily">Diária</option>
        <option value="weekly">Semanal</option>
        <option value="monthly">Mensal</option>
        <option value="yearly">Anual</option>
      </select>
      {value ? (
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
          a cada
          <input
            type="number"
            min={1}
            max={365}
            defaultValue={value.interval}
            onBlur={(e) => {
              const n = Math.max(1, Math.min(365, Number(e.target.value) || 1))
              if (n !== value.interval) onSave({ ...value, interval: n })
            }}
            className="field w-16"
            aria-label="Intervalo"
          />
        </label>
      ) : null}
    </div>
  )
}

function TagsField({ value, onSave }: { value: string[]; onSave: (v: string[]) => void }) {
  const [input, setInput] = useState("")
  const add = () => {
    const names = input
      .split(",")
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean)
    setInput("")
    if (names.length) onSave([...value, ...names])
  }
  return (
    <div className="field flex min-h-[2.125rem] flex-wrap items-center gap-1 py-1">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-xs bg-sage-soft px-1.5 py-0.5 text-xs text-sage-ink">
          #{t}
          <button onClick={() => onSave(value.filter((v) => v !== t))} aria-label={`Remover tag ${t}`} className="hover:text-ink">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add()
          }
          if (e.key === "Backspace" && !input && value.length) onSave(value.slice(0, -1))
        }}
        onBlur={add}
        placeholder={value.length ? "" : "estudo, casa…"}
        aria-label="Adicionar tag"
        className="min-w-20 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-5"
        maxLength={40}
      />
    </div>
  )
}

function Subtasks({ task }: { task: TaskDetail }) {
  const [title, setTitle] = useState("")
  const [, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok && r.error) toast.error(r.error)
    })
  const done = task.subtasks.filter((s) => s.done).length
  return (
    <section>
      <h2 className="eyebrow mb-2">
        Subtarefas {task.subtasks.length ? <span className="ml-1 text-ink-5">{done}/{task.subtasks.length}</span> : null}
      </h2>
      <ul className="flex flex-col">
        {task.subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-3 border-b border-line-soft py-1.5">
            <input
              type="checkbox"
              checked={s.done}
              onChange={(e) => run(() => updateSubtaskAction(s.id, { done: e.target.checked }))}
              className="size-4 accent-cobalt"
              aria-label={`Concluir subtarefa: ${s.title}`}
            />
            <input
              defaultValue={s.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && run(() => updateSubtaskAction(s.id, { title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={cn("field-ghost flex-1 px-1.5 py-0.5 text-sm", s.done && "text-ink-4 line-through")}
              aria-label="Título da subtarefa"
            />
            <button onClick={() => run(() => deleteSubtaskAction(s.id))} className="rounded-xs p-1 text-ink-4 opacity-0 group-hover:opacity-100 hover:text-clay focus-visible:opacity-100" aria-label={`Remover subtarefa: ${s.title}`}>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const t = title.trim()
          if (!t) return
          setTitle("")
          run(() => addSubtaskAction(task.id, t))
        }}
      >
        <Plus className="size-4 text-ink-4" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adicionar subtarefa" className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-5" aria-label="Nova subtarefa" maxLength={300} />
      </form>
    </section>
  )
}
