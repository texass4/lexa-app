"use client"

import * as React from "react"
import { CalendarPlus } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { getMembers, currentUserId } from "@/lib/account"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { getNow, toLocalISO } from "@/lib/dates"
import { CategoryPicker } from "./category-picker"

/** Duração sugerida ao escolher o horário de início. */
const DEFAULT_DURATION = 60

type Defaults = { clientId?: string; processId?: string; date?: string }

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function minutesBetween(start: string, end: string) {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }
  return toMin(end) - toMin(start)
}

function AppointmentForm({ defaults, onClose }: { defaults?: Defaults; onClose: () => void }) {
  const data = useDemoData()
  const { addAppointment } = useDemoActions()

  const [form, setForm] = React.useState(() => ({
    title: "",
    categoryId: undefined as string | undefined,
    date: defaults?.date ?? toLocalISO(getNow()).slice(0, 10),
    time: "14:00",
    endTime: addMinutes("14:00", DEFAULT_DURATION),
    clientId: defaults?.clientId ?? (defaults?.processId ? (data.processes.find((p) => p.id === defaults.processId)?.clientId ?? "") : ""),
    processId: defaults?.processId ?? "",
    ownerId: currentUserId(),
    notes: "",
  }))
  const [error, setError] = React.useState("")
  const [timeError, setTimeError] = React.useState("")

  type FormState = typeof form
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const clientProcesses = data.processes.filter((p) => !form.clientId || p.clientId === form.clientId)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.title.trim().length < 3) {
      setError("Dê um título ao compromisso.")
      return
    }
    if (form.endTime <= form.time) {
      setTimeError("O término precisa ser depois do início.")
      return
    }
    const client = data.clients.find((c) => c.id === form.clientId)
    addAppointment({
      title: form.title.trim(),
      categoryId: form.categoryId,
      start: `${form.date}T${form.time}:00`,
      end: `${form.date}T${form.endTime}:00`,
      ownerId: form.ownerId,
      clientId: form.clientId || undefined,
      processId: form.processId || undefined,
      personName: client?.name,
      area: client?.area,
      notes: form.notes.trim() || undefined,
    })
    onClose()
    const [y, m, d] = form.date.split("-")
    toast.success("Compromisso agendado.", { description: `${form.title.trim()} — ${d}/${m}/${y}, às ${form.time}.` })
  }

  return (
    <>
      <ModalBody>
        <form id="appointment-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Título" htmlFor="appt-title" error={error} className="sm:col-span-2">
            <TextInput
              id="appt-title"
              autoFocus
              placeholder="Ex.: Audiência de instrução"
              value={form.title}
              aria-invalid={!!error}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <CategoryPicker value={form.categoryId} onChange={(id) => set("categoryId", id)} />
          </div>
          <Field label="Data" htmlFor="appt-date" className="sm:col-span-2">
            <TextInput id="appt-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Início" htmlFor="appt-time">
            <TextInput
              id="appt-time"
              type="time"
              value={form.time}
              onChange={(e) => {
                const time = e.target.value
                setTimeError("")
                // Mantém a duração que já estava escolhida.
                setForm((f) => ({ ...f, time, endTime: addMinutes(time, Math.max(minutesBetween(f.time, f.endTime), 15)) }))
              }}
            />
          </Field>
          <Field label="Término" htmlFor="appt-end" error={timeError}>
            <TextInput
              id="appt-end"
              type="time"
              value={form.endTime}
              aria-invalid={!!timeError}
              onChange={(e) => {
                setTimeError("")
                set("endTime", e.target.value)
              }}
            />
          </Field>
          <Field label="Cliente" htmlFor="appt-client" optional>
            <NativeSelect
              id="appt-client"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, processId: "" }))}
            >
              <option value="">Nenhum</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Processo" htmlFor="appt-process" optional>
            <NativeSelect id="appt-process" value={form.processId} onChange={(e) => set("processId", e.target.value)}>
              <option value="">Nenhum</option>
              {clientProcesses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.type}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Responsável" htmlFor="appt-owner" className="sm:col-span-2">
            <NativeSelect id="appt-owner" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              {getMembers().map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Observações" htmlFor="appt-notes" optional className="sm:col-span-2">
            <TextArea id="appt-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="appointment-form">
          Agendar
        </Button>
      </ModalFooter>
    </>
  )
}

export function NewAppointmentDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: Defaults }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo compromisso"
      description="Agende um compromisso e organize a agenda com as suas categorias."
      icon={<CalendarPlus />}
      bare
    >
      <AppointmentForm defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}
