"use client"

import * as React from "react"
import { CalendarPlus, Flag, Pencil, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "cn"
import { MAX_REPEATS, REPEAT_LABEL, conflictsFor, normalizeVideoUrl, participantsOf, repeatDates, type RepeatRule } from "@/lib/agenda/agenda"
import { getMembers, currentUserId, getUser } from "@/lib/auth/account"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useRemovedWhileEditing } from "@/lib/store/on-demand"
import { byId } from "@/lib/store/indexes"
import { getNow, toLocalISO } from "@/lib/core/dates"
import type { Appointment, Process } from "@/types"
import { CategoryPicker } from "./category-picker"

/** Duração sugerida ao escolher o horário de início. */
const DEFAULT_DURATION = 60

type Defaults = { clientId?: string; processId?: string; date?: string; time?: string; title?: string }

const PRIORITIES = [
  { value: "", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "baixa", label: "Baixa" },
] as const
type PriorityChoice = (typeof PRIORITIES)[number]["value"]

/** Horário padrão quando o formulário abre sem um horário escolhido (botão "Novo compromisso"). */
const DEFAULT_TIME = "14:00"
const isTime = (value?: string): value is string => !!value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

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
      attendeeIds: appointment.attendeeIds ?? [],
      priority: (appointment.priority === "alta" || appointment.priority === "baixa" ? appointment.priority : "") as PriorityChoice,
      videoUrl: appointment.videoUrl ?? "",
      repeat: "" as "" | RepeatRule,
      repeatCount: 4,
      notes: appointment.notes ?? "",
    }
  }
  return {
    title: defaults?.title ?? "",
    categoryId: undefined as string | undefined,
    date: defaults?.date ?? toLocalISO(getNow()).slice(0, 10),
    // Clique num horário da Agenda: começa nele (dá para trocar antes de salvar).
    time: isTime(defaults?.time) ? defaults.time : DEFAULT_TIME,
    endTime: addMinutes(isTime(defaults?.time) ? defaults.time : DEFAULT_TIME, DEFAULT_DURATION),
    clientId: defaults?.clientId ?? (defaults?.processId ? (processes.find((p) => p.id === defaults.processId)?.clientId ?? "") : ""),
    processId: defaults?.processId ?? "",
    ownerId: currentUserId(),
    attendeeIds: [] as string[],
    priority: "" as PriorityChoice,
    videoUrl: "",
    repeat: "" as "" | RepeatRule,
    repeatCount: 4,
    notes: "",
  }
}

/** Formulário único de criar e editar compromisso. Na edição, grava só se ninguém alterou depois que o formulário abriu. */
function AppointmentForm({ appointment, defaults, onClose }: { appointment?: Appointment; defaults?: Defaults; onClose: () => void }) {
  const data = useOfficeData()
  const { addAppointment, addAppointments, updateAppointment, versionOf } = useOfficeActions()
  useRemovedWhileEditing("appointments", appointment?.id)

  const [form, setForm] = React.useState(() => initialState(appointment, defaults, data.processes))
  const [error, setError] = React.useState("")
  const [timeError, setTimeError] = React.useState("")
  const [videoError, setVideoError] = React.useState("")
  const [baseVersion, setBaseVersion] = React.useState(() => (appointment ? versionOf("appointments", appointment.id) : null))
  const [saving, setSaving] = React.useState(false)

  type FormState = typeof form
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const clientProcesses = data.processes.filter((p) => !form.clientId || p.clientId === form.clientId)
  // Aviso (não bloqueia): alguém da equipe já tem compromisso nesse horário.
  const conflicts =
    form.endTime > form.time
      ? conflictsFor(
          {
            id: appointment?.id,
            start: `${form.date}T${form.time}:00`,
            end: `${form.date}T${form.endTime}:00`,
            ownerId: form.ownerId,
            attendeeIds: form.attendeeIds,
          },
          data.appointments,
        )
      : []
  const toggleAttendee = (id: string) =>
    setForm((f) => ({ ...f, attendeeIds: f.attendeeIds.includes(id) ? f.attendeeIds.filter((x) => x !== id) : [...f.attendeeIds, id] }))

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
    const videoUrl = form.videoUrl.trim() ? normalizeVideoUrl(form.videoUrl) : undefined
    if (videoUrl === null) {
      setVideoError("Cole um endereço válido, como meet.google.com/abc-defg-hij.")
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
      // O responsável não entra de novo como participante.
      attendeeIds: form.attendeeIds.filter((id) => id !== form.ownerId),
      priority: form.priority || undefined,
      videoUrl: videoUrl ?? undefined,
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
    if (form.repeat) {
      const seriesId = crypto.randomUUID()
      const dates = repeatDates(form.date, form.repeat, form.repeatCount)
      addAppointments(dates.map((date) => ({ ...payload, start: `${date}T${form.time}:00`, end: `${date}T${form.endTime}:00`, seriesId })))
      onClose()
      toast.success(`${dates.length} compromissos agendados.`, {
        description: `${payload.title} — ${REPEAT_LABEL[form.repeat].toLowerCase()}, às ${form.time}.`,
      })
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
          {conflicts.length > 0 && (
            <div role="status" className="flex gap-2 rounded-control bg-warning-soft px-3 py-2 text-[12.5px] text-warning sm:col-span-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Conflito de horário</p>
                {conflicts.slice(0, 2).map((c) => {
                  const shared = participantsOf(c).filter((id) =>
                    participantsOf({ ownerId: form.ownerId, attendeeIds: form.attendeeIds }).includes(id),
                  )
                  return (
                    <p key={c.id} className="truncate">
                      {shared.map((id) => getUser(id).firstName).join(", ")} já {shared.length > 1 ? "têm" : "tem"} “{c.title}” das{" "}
                      {c.start.slice(11, 16)} às {c.end.slice(11, 16)}.
                    </p>
                  )
                })}
                {conflicts.length > 2 && <p>e mais {conflicts.length - 2}.</p>}
              </div>
            </div>
          )}
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
          <Field
            label="Participantes"
            htmlFor="appt-attendees"
            optional
            className="sm:col-span-2"
            hint="Quem mais da equipe vai ao compromisso. Aparece na agenda de cada um."
          >
            <div id="appt-attendees" role="group" aria-label="Participantes" className="flex flex-wrap gap-1.5">
              {getMembers()
                .filter((u) => u.id !== form.ownerId)
                .map((u) => {
                  const on = form.attendeeIds.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAttendee(u.id)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-1 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                        on
                          ? "border-brand bg-brand-soft text-brand-strong"
                          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                      )}
                    >
                      <UserAvatar name={u.name} src={u.avatarUrl} size="sm" />
                      {u.firstName}
                    </button>
                  )
                })}
            </div>
          </Field>
          <Field label="Prioridade" htmlFor="appt-priority" className="sm:col-span-2">
            <div id="appt-priority" role="radiogroup" aria-label="Prioridade" className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={form.priority === p.value}
                  onClick={() => set("priority", p.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                    form.priority === p.value
                      ? p.value === "alta"
                        ? "border-danger bg-danger-soft text-danger"
                        : "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {p.value === "alta" && <Flag className="size-3.5 fill-current" />}
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Link da videochamada"
            htmlFor="appt-video"
            optional
            error={videoError}
            className="sm:col-span-2"
            hint="Google Meet, Zoom ou Teams: quem abrir o compromisso entra com um clique."
          >
            <TextInput
              id="appt-video"
              inputMode="url"
              placeholder="meet.google.com/abc-defg-hij"
              value={form.videoUrl}
              aria-invalid={!!videoError}
              onChange={(e) => {
                setVideoError("")
                set("videoUrl", e.target.value)
              }}
            />
          </Field>
          {!appointment && (
            <>
              <Field label="Repetir" htmlFor="appt-repeat" className={form.repeat ? undefined : "sm:col-span-2"}>
                <NativeSelect id="appt-repeat" value={form.repeat} onChange={(e) => set("repeat", e.target.value as "" | RepeatRule)}>
                  <option value="">Não repete</option>
                  {(Object.keys(REPEAT_LABEL) as RepeatRule[]).map((r) => (
                    <option key={r} value={r}>
                      {REPEAT_LABEL[r]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {form.repeat && (
                <Field label="Quantas vezes" htmlFor="appt-repeat-count" hint={`De 2 a ${MAX_REPEATS}, contando este.`}>
                  <TextInput
                    id="appt-repeat-count"
                    type="number"
                    min={2}
                    max={MAX_REPEATS}
                    value={form.repeatCount}
                    onChange={(e) => set("repeatCount", Math.max(2, Math.min(MAX_REPEATS, Math.round(Number(e.target.value)) || 2)))}
                  />
                </Field>
              )}
            </>
          )}
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
