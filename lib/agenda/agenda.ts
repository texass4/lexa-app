/**
 * Regras da agenda que não dependem de tela: remarcar mantendo a duração, encaixar
 * o horário arrastado em intervalos de 15 min e descrever o que mudou num
 * compromisso para a timeline. Lógica pura — usada pelo store e pelos testes.
 */

import type { Appointment, AppointmentStatus, Prazo, Task } from "@/types"
import { CATEGORY_COLORS } from "@/lib/core/config"

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
  attendeeIds: "participantes",
  priority: "prioridade",
  videoUrl: "link da videochamada",
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export const STATUS_LABEL: Record<AppointmentStatus, string> = { planejado: "Planejado", realizado: "Realizado", cancelado: "Cancelado" }

/** Situação do compromisso (sem situação gravada = planejado). */
export const appointmentStatus = (a: Pick<Appointment, "status">): AppointmentStatus => a.status ?? "planejado"

/** Ainda vai acontecer: nem realizado nem cancelado. É o que conta como "restante" e "próximo". */
export const isPlanned = (a: Pick<Appointment, "status">) => appointmentStatus(a) === "planejado"

export interface AppointmentChange {
  /** Início ou fim mudou. */
  rescheduled: boolean
  /** "remarcou o compromisso de 10/10 14:00 para 11/10 15:00." (vazio se não remarcou). */
  rescheduleText: string
  /** Outros campos alterados, por nome legível. */
  fields: string[]
  /** "marcou o compromisso como realizado." (vazio se a situação não mudou). */
  statusText: string
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
  const statusChanged = appointmentStatus(before) !== appointmentStatus(after)
  const statusText = !statusChanged
    ? ""
    : appointmentStatus(after) === "planejado"
      ? "reabriu o compromisso."
      : `marcou o compromisso como ${appointmentStatus(after)}.`
  return { rescheduled, rescheduleText, fields, statusText }
}

/* ---------------------------------- Pessoas ---------------------------------- */

/** Responsável + participantes, sem repetir. */
export function participantsOf(a: Pick<Appointment, "ownerId" | "attendeeIds">) {
  return [...new Set([a.ownerId, ...(a.attendeeIds ?? [])])]
}

/** Cor própria de cada pessoa da equipe (a mesma sempre): usada em "colorir por advogado". */
export function personColor(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  // Pula o dourado, o cinza e o marrom: ficam para "sem categoria" e dão pouco contraste entre pessoas.
  const palette = CATEGORY_COLORS.slice(3)
  return palette[h % palette.length].value
}

/* ------------------------------ Videochamada ------------------------------- */

/** Aceita o link colado (com ou sem https://); devolve null se não parece um endereço. */
export function normalizeVideoUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Nome do serviço pelo endereço do link. */
export function videoProvider(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return ""
    }
  })()
  if (host.endsWith("meet.google.com")) return "Google Meet"
  if (host.endsWith("zoom.us") || host.endsWith("zoom.com")) return "Zoom"
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Microsoft Teams"
  return "Videochamada"
}

/* -------------------------------- Repetição -------------------------------- */

export type RepeatRule = "semanal" | "quinzenal" | "mensal"
export const REPEAT_LABEL: Record<RepeatRule, string> = { semanal: "Toda semana", quinzenal: "A cada 15 dias", mensal: "Todo mês" }
/** Limite de ocorrências criadas de uma vez. */
export const MAX_REPEATS = 26

const parseDay = (date: string) => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * As datas de `count` ocorrências a partir de `date` (a primeira é a própria data).
 * Mensal mantém o dia do mês; em meses mais curtos cai no último dia (31/01 → 28/02).
 */
export function repeatDates(date: string, rule: RepeatRule, count: number) {
  const total = Math.max(1, Math.min(count, MAX_REPEATS))
  const first = parseDay(date)
  return Array.from({ length: total }, (_, i) => {
    if (rule === "mensal") {
      const lastDay = new Date(first.getFullYear(), first.getMonth() + i + 1, 0).getDate()
      return dayString(new Date(first.getFullYear(), first.getMonth() + i, Math.min(first.getDate(), lastDay)))
    }
    return dayString(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * (rule === "semanal" ? 7 : 14)))
  })
}

/* ------------------------------ Conflitos e livres ------------------------------ */

const startMin = (a: Pick<Appointment, "start">) => minutesOf(a.start)
const endMin = (a: Pick<Appointment, "end">) => minutesOf(a.end)
const sameDate = (a: { start: string }, date: string) => a.start.slice(0, 10) === date

/**
 * Compromissos planejados que se sobrepõem ao horário e dividem alguma pessoa com ele
 * (responsável ou participante). Serve para avisar antes de salvar — não bloqueia.
 */
export function conflictsFor(candidate: Pick<Appointment, "start" | "end" | "ownerId" | "attendeeIds"> & { id?: string }, all: Appointment[]) {
  const people = new Set(participantsOf(candidate))
  return all.filter(
    (a) =>
      a.id !== candidate.id &&
      isPlanned(a) &&
      sameDate(a, candidate.start.slice(0, 10)) &&
      startMin(a) < endMin(candidate) &&
      endMin(a) > startMin(candidate) &&
      participantsOf(a).some((id) => people.has(id)),
  )
}

export interface FreeSlot {
  from: string
  to: string
}

/**
 * Horários livres de `userId` em `date` dentro do expediente, em blocos de pelo menos
 * `minMinutes`. Só conta compromisso planejado em que a pessoa participa.
 */
export function freeSlots(all: Appointment[], userId: string, date: string, { from = 9 * 60, to = 18 * 60, minMinutes = 30 } = {}): FreeSlot[] {
  const busy = all
    .filter((a) => isPlanned(a) && sameDate(a, date) && participantsOf(a).includes(userId))
    .map((a) => [Math.max(from, startMin(a)), Math.min(to, endMin(a))] as const)
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0])
  const slots: FreeSlot[] = []
  let cursor = from
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes) slots.push({ from: hhmm(cursor), to: hhmm(s) })
    cursor = Math.max(cursor, e)
  }
  if (to - cursor >= minMinutes) slots.push({ from: hhmm(cursor), to: hhmm(to) })
  return slots
}

const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

/** Texto para mandar ao cliente: "Seg 15/01: 09:00–10:30, 14:00–18:00" (dias úteis, sem os dias cheios). */
export function availabilityText(all: Appointment[], userId: string, fromDate: string, days = 5, now?: Date) {
  const lines: string[] = []
  // No dia de hoje, só o que ainda não passou (arredondado para o próximo quarto de hora).
  const todayFrom = now && dayString(now) === fromDate ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / SNAP_MINUTES) * SNAP_MINUTES : undefined
  const start = parseDay(fromDate)
  for (let i = 0; lines.length < days && i < days * 2 + 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const date = dayString(d)
    const slots = freeSlots(all, userId, date, date === fromDate && todayFrom !== undefined ? { from: Math.max(9 * 60, todayFrom) } : undefined)
    if (!slots.length) continue
    const label = `${WEEKDAY[d.getDay()].replace(/^./, (c) => c.toUpperCase())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
    lines.push(`${label}: ${slots.map((s) => `${s.from}–${s.to}`).join(", ")}`)
  }
  return lines.length ? `Horários disponíveis:\n${lines.join("\n")}` : ""
}

/* ------------------------- Prazos e tarefas na agenda ------------------------- */

export type DayItem =
  | { kind: "prazo"; id: string; date: string; label: string; processId: string; internal: boolean; userId: string }
  | { kind: "tarefa"; id: string; date: string; label: string; priority: Task["priority"]; userId: string }

/** Prazos abertos (data fatal e data interna) e tarefas pendentes que caem entre `from` e `to` (inclusive, `YYYY-MM-DD`). */
export function dayItems(prazos: Prazo[], tasks: Task[], from: string, to: string): DayItem[] {
  const out: DayItem[] = []
  const within = (date: string) => date >= from && date <= to
  for (const p of prazos) {
    if (p.status !== "aberto") continue
    if (within(p.fatalDate))
      out.push({
        kind: "prazo",
        id: `${p.id}:fatal`,
        date: p.fatalDate,
        label: p.description,
        processId: p.processId,
        internal: false,
        userId: p.responsibleId,
      })
    if (p.internalDate !== p.fatalDate && within(p.internalDate))
      out.push({
        kind: "prazo",
        id: `${p.id}:interno`,
        date: p.internalDate,
        label: p.description,
        processId: p.processId,
        internal: true,
        userId: p.responsibleId,
      })
  }
  for (const t of tasks) {
    if (t.status !== "pendente") continue
    const date = t.dueAt.slice(0, 10)
    if (within(date)) out.push({ kind: "tarefa", id: t.id, date, label: t.title, priority: t.priority, userId: t.assigneeId })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "prazo" ? -1 : 1))
}
