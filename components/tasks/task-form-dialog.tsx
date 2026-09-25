"use client"

import * as React from "react"
import { ListChecks, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { getMembers, currentUserId } from "@/lib/account"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { getNow, toLocalISO } from "@/lib/dates"
import type { Priority, RelatedEntity, Task } from "@/types"

const PRIORITIES = ["Alta", "Média", "Baixa"] as const
const toPriority: Record<(typeof PRIORITIES)[number], Priority> = { Alta: "alta", Média: "media", Baixa: "baixa" }
const fromPriority: Record<Priority, (typeof PRIORITIES)[number]> = { alta: "Alta", media: "Média", baixa: "Baixa" }

type Defaults = { clientId?: string; processId?: string; columnId?: string }

function encodeRelated(r?: RelatedEntity) {
  return r ? `${r.type}:${r.id}` : ""
}
function decodeRelated(v: string): RelatedEntity | undefined {
  if (!v) return undefined
  const [type, id] = v.split(":")
  return { type: type as RelatedEntity["type"], id }
}

function initialState(task?: Task, defaults?: Defaults) {
  const related: RelatedEntity | undefined = defaults?.processId
    ? { type: "process", id: defaults.processId }
    : defaults?.clientId
      ? { type: "client", id: defaults.clientId }
      : undefined
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    date: task?.dueAt.slice(0, 10) ?? toLocalISO(getNow()).slice(0, 10),
    time: task?.dueAt.slice(11, 16) ?? "18:00",
    priority: task ? fromPriority[task.priority] : ("Média" as (typeof PRIORITIES)[number]),
    assigneeId: task?.assigneeId ?? currentUserId(),
    related: encodeRelated(task?.related ?? related),
  }
}

type FormState = ReturnType<typeof initialState>

function TaskForm({ task, defaults, onClose }: { task?: Task; defaults?: Defaults; onClose: () => void }) {
  const data = useDemoData()
  const { addTask, updateTask } = useDemoActions()
  const [form, setForm] = React.useState(() => initialState(task, defaults))
  const [error, setError] = React.useState("")

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.title.trim().length < 3) {
      setError("Descreva a tarefa em poucas palavras.")
      return
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      dueAt: `${form.date}T${form.time}:00`,
      priority: toPriority[form.priority],
      assigneeId: form.assigneeId,
      related: decodeRelated(form.related),
    }
    if (task) {
      updateTask(task.id, payload)
      toast.success("Alterações salvas.")
    } else {
      const columnId = defaults?.columnId ?? data.taskColumns.find((c) => !c.isDone)?.id
      addTask({ ...payload, columnId })
      toast.success("Tarefa criada.", {
        description: `${payload.title} — atribuída a ${getMembers().find((u) => u.id === payload.assigneeId)?.firstName}.`,
      })
    }
    onClose()
  }

  const activeClients = data.clients.filter((c) => c.status !== "inativo")

  return (
    <>
      <ModalBody>
        <form id="task-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Título" htmlFor="task-title" error={error} className="sm:col-span-2">
            <TextInput
              id="task-title"
              autoFocus
              placeholder="Ex.: Protocolar manifestação sobre o laudo"
              value={form.title}
              aria-invalid={!!error}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Vincular a" htmlFor="task-related" optional className="sm:col-span-2">
            <NativeSelect id="task-related" value={form.related} onChange={(e) => set("related", e.target.value)}>
              <option value="">Sem vínculo</option>
              <optgroup label="Processos">
                {data.processes
                  .filter((p) => p.status !== "concluido")
                  .map((p) => (
                    <option key={p.id} value={`process:${p.id}`}>
                      {p.code} — {data.clients.find((c) => c.id === p.clientId)?.name} · {p.type}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Clientes">
                {activeClients.map((c) => (
                  <option key={c.id} value={`client:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </Field>
          <Field label="Prazo" htmlFor="task-date">
            <TextInput id="task-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Horário" htmlFor="task-time">
            <TextInput id="task-time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium">Prioridade</span>
            <ChoiceChips ariaLabel="Prioridade" options={PRIORITIES} value={form.priority} onChange={(v) => set("priority", v)} />
          </div>
          <Field label="Responsável" htmlFor="task-assignee">
            <NativeSelect id="task-assignee" value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
              {getMembers().map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Descrição" htmlFor="task-desc" optional className="sm:col-span-2">
            <TextArea id="task-desc" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="task-form">
          {task ? "Salvar alterações" : "Criar tarefa"}
        </Button>
      </ModalFooter>
    </>
  )
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaults,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  task?: Task
  defaults?: Defaults
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={task ? "Editar tarefa" : "Nova tarefa"}
      description={task ? "Atualize prazo, prioridade ou responsável." : "Crie uma atividade com prazo e responsável."}
      icon={task ? <Pencil /> : <ListChecks />}
      bare
    >
      <TaskForm task={task} defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}
