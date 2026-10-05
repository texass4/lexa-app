/**
 * Regras da agenda que não dependem de tela: remarcar mantendo a duração, encaixar
 * o horário arrastado em intervalos de 15 min e descrever o que mudou num
 * compromisso para a timeline. Lógica pura — usada pelo store e pelos testes.
 */

import type { Appointment } from "@/types"

/** Intervalo em que o compromisso arrastado se encaixa. */
const SNAP_MINUTES = 15

const pad = (n: number) => String(n).padStart(2, "0")

/** ISO local → minutos desde o início do dia. */
const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))

/** Duração do compromisso em minutos (mínimo 15). */
export function durationMinutes(a: Pick<Appointment, "start" | "end">) {
  const start = new Date(a.start).getTime()
  const end = new Date(a.end).getTime()
  return Math.max(SNAP_MINUTES, Math.round((end - start) / 60_000))
}

/** Minutos arredondados para o intervalo mais próximo, dentro de [min, max]. */
export function snapMinutes(minutes: number, { step = SNAP_MINUTES, min = 0, max = 24 * 60 } = {}) {
  const snapped = Math.round(minutes / step) * step
  return Math.min(max, Math.max(min, snapped))
}

/** `YYYY-MM-DD` + minutos do dia → ISO local. */
export function atMinutes(date: string, minutes: number) {
  return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`
}

/**
 * Novo início e fim ao soltar o compromisso em `date` às `startMinutes`, mantendo a
 * duração. O fim nunca passa das 23:59 do mesmo dia (o início recua se precisar).
 */
export function moveAppointment(a: Pick<Appointment, "start" | "end">, date: string, startMinutes: number) {
  const duration = durationMinutes(a)
  const lastStart = 24 * 60 - 1 - duration
  const start = Math.max(0, Math.min(startMinutes, lastStart))
  return { start: atMinutes(date, start), end: atMinutes(date, Math.min(start + duration, 24 * 60 - 1)) }
}

/** Mesmo dia/horário no novo dia (arrastar no mês). */
export function moveToDay(a: Pick<Appointment, "start" | "end">, date: string) {
  return moveAppointment(a, date, minutesOf(a.start))
}

/** "10/10 14:00". */
export const fmtSlot = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`

/** Campos do compromisso com nome legível, para descrever a edição. */
const FIELD_LABELS: Partial<Record<keyof Appointment, string>> = {
  title: "título",
  categoryId: "categoria",
  ownerId: "responsável",
  clientId: "cliente",
  processId: "processo",
  location: "local",
  notes: "observações",
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export interface AppointmentChange {
  /** Início ou fim mudou. */
  rescheduled: boolean
  /** "remarcou o compromisso de 10/10 14:00 para 11/10 15:00." (vazio se não remarcou). */
  rescheduleText: string
  /** Outros campos alterados, por nome legível. */
  fields: string[]
}

/** O que mudou entre duas versões do compromisso. */
export function describeAppointmentChange(before: Appointment, after: Appointment): AppointmentChange {
  const rescheduled = before.start !== after.start || before.end !== after.end
  const sameStart = before.start === after.start
  const rescheduleText = !rescheduled
    ? ""
    : sameStart
      ? `alterou o término do compromisso de ${before.end.slice(11, 16)} para ${after.end.slice(11, 16)}.`
      : `remarcou o compromisso de ${fmtSlot(before.start)} para ${fmtSlot(after.start)}.`
  const fields = (Object.keys(FIELD_LABELS) as (keyof Appointment)[]).filter((key) => !same(before[key], after[key])).map((key) => FIELD_LABELS[key]!)
  return { rescheduled, rescheduleText, fields }
}
