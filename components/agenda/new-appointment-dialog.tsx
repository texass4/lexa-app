"use client"

import * as React from "react"
import { CalendarPlus, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { getMembers, currentUserId } from "@/lib/auth/account"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getNow, toLocalISO } from "@/lib/core/dates"
import type { Appointment, Process } from "@/types"
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

function initialState(appointment: Appointment | undefined, defaults: Defaults | undefined, processes: Process[]) {
  if (appointment) {
    return {
      title: appointment.title,
      categoryId: appointment.categoryId,
      date: appointment.start.slice(0, 10),
      time: appointment.start.slice(11, 16),
      endTime: appointment.end.slice(11, 16),
      clientId: appointment.clientId ?? "",
      processId: appointment.processId ?? "",
      ownerId: appointment.ownerId,
      notes: appointment.notes ?? "",
    }
  }
  return {
    title: "",
    categoryId: undefined as string | undefined,
    date: defaults?.date ?? toLocalISO(getNow()).slice(0, 10),
    time: "14:00",
    endTime: addMinutes("14:00", DEFAULT_DURATION),
    clientId: defaults?.clientId ?? (defaults?.processId ? (processes.find((p) => p.id === defaults.processId)?.clientId ?? "") : ""),
    processId: defaults?.processId ?? "",
    ownerId: currentUserId(),
    notes: "",
  }
}

/** Formulário único de criar e editar compromisso. Na edição, grava só se ninguém alterou depois que o formulário abriu. */
function AppointmentForm({ appointment, defaults, onClose }: { appointment?: Appointment; defaults?: Defaults; onClose: () => void }) {
  const data = useOfficeData()
  const { addAppointment, updateAppointment, versionOf } = useOfficeActions()

  const [form, setForm] = React.useState(() => initialState(appointment, defaults, data.processes))
  const [error, setError] = React.useState("")
  const [timeError, setTimeError] = React.useState("")
  const [baseVersion, setBaseVersion] = React.useState(() => (appointment ? versionOf("appointments", appointment.id) : null))
  const [saving, setSaving] = React.useState(false)

  type FormState = typeof form
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const clientProcesses = data.processes.filter((p) => !form.clientId || p.clientId === form.clientId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (form.title.trim().length < 3) {
      setError("Dê um título ao compromisso.")
      return
    }
    if (form.endTime <= form.time) {
      setTimeError("O término precisa ser depois do início.")
      return
    }
    const client = byId(data.clients, form.clientId)
    const payload = {
      title: form.title.trim(),
      categoryId: form.categoryId,
      start: `${form.date}T${form.time}:00`,
      end: `${form.date}T${form.endTime}:00`,
      ownerId: form.ownerId,
      clientId: form.clientId || undefined,
      processId: form.processId || undefined,
      // Nome avulso (compromisso sem cliente cadastrado) é preservado na edição.
      personName: client?.name ?? (appointment && !appointment.clientId ? appointment.personName : undefined),
      area: client?.area ?? (appointment && !appointment.clientId ? appointment.area : undefined),
      notes: form.notes.trim() || undefined,
    }
    const [y, m, d] = form.date.split("-")
    if (appointment) {
      setSaving(true)
      const result = await updateAppointment(appointment.id, payload, { baseVersion })
      setSaving(false)
      if (result.status === "conflict") {
        // O aviso já apareceu; o formulário mostra o compromisso como está agora para revisar.
        setForm(initialState(result.current, defaults, data.processes))
        setBaseVersion(versionOf("appointments", appointment.id))
        return
      }
      if (result.status === "error") return
      onClose()
      if (result.status === "saved") toast.success("Alterações salvas.", { description: `${payload.title} — ${d}/${m}/${y}, às ${form.time}.` })
      return
    }
    addAppointment(payload)
    onClose()
    toast.success("Compromisso agendado.", { description: `${payload.title} — ${d}/${m}/${y}, às ${form.time}.` })
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
        <Button type="submit" form="appointment-form" disabled={saving}>
          {appointment ? "Salvar alterações" : "Agendar"}
        </Button>
      </ModalFooter>
    </>
  )
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  defaults,
  appointment,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaults?: Defaults
  /** Com compromisso, o formulário edita (mesmos campos do cadastro). */
  appointment?: Appointment
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={appointment ? "Editar compromisso" : "Novo compromisso"}
      description={appointment ? "Altere data, horário, vínculos ou detalhes." : "Agende um compromisso e organize a agenda com as suas categorias."}
      icon={appointment ? <Pencil /> : <CalendarPlus />}
      bare
    >
      <AppointmentForm appointment={appointment} defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}
