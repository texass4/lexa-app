/*
 * Datas de calendário ("dia 12 de março") são texto `YYYY-MM-DD`, sem hora e sem fuso.
 * Toda conta é feita em UTC sobre esse texto, então nunca há deslocamento de um dia por
 * causa do fuso do servidor ou do navegador. O "hoje" depende do fuso da pessoa.
 */

export type LocalDate = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string") return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d
}

function toUtc(date: LocalDate): Date {
  if (!isLocalDate(date)) throw new RangeError(`Data inválida: ${date}`)
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function fromUtc(date: Date): LocalDate {
  return date.toISOString().slice(0, 10)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

/** Data local de um instante no fuso indicado. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateOf(now, timeZone)
}

/** Hora (0–23) de um instante no fuso indicado — usada na saudação. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now)
  return Number(hour) % 24
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** Soma meses mantendo o dia quando possível (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const d = toUtc(date)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return fromUtc(target)
}

/** Diferença em dias inteiros (b − a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

/** 0 = domingo … 6 = sábado. */
export function dayOfWeek(date: LocalDate): number {
  return toUtc(date).getUTCDay()
}

export function startOfWeek(date: LocalDate, weekStartsOn = 1): LocalDate {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7
  return addDays(date, -offset)
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`
}

export function weekDays(date: LocalDate, weekStartsOn = 1): LocalDate[] {
  const start = startOfWeek(date, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Grade do mês em semanas completas (inclui dias dos meses vizinhos). */
export function monthGrid(date: LocalDate, weekStartsOn = 1): LocalDate[][] {
  const first = startOfMonth(date)
  const last = addDays(addMonths(first, 1), -1)
  const gridStart = startOfWeek(first, weekStartsOn)
  const weeks: LocalDate[][] = []
  let cursor = gridStart
  while (cursor <= last || weeks.length === 0) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
    weeks.push(week)
    cursor = addDays(cursor, 7)
  }
  return weeks
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const LOCALE = "pt-BR"

/** Formata uma data de calendário sem converter fuso (sempre o mesmo dia escrito). */
export function formatLocalDate(date: LocalDate, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(toUtc(date))
}

export function weekdayName(date: LocalDate, style: "long" | "short" = "long"): string {
  return formatLocalDate(date, { weekday: style })
}

/** "hoje", "amanhã", "ontem", "sex., 30 out." — para prazos em listas. */
export function relativeDayLabel(date: LocalDate, today: LocalDate): string {
  const diff = diffDays(today, date)
  if (diff === 0) return "hoje"
  if (diff === 1) return "amanhã"
  if (diff === -1) return "ontem"
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  if (diff > 1 && diff < 7) return formatLocalDate(date, { weekday: "short", day: "numeric", month: "short" })
  return formatLocalDate(date, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })
}

/** Instante de auditoria no fuso da pessoa ("24 out., 14:05"). */
export function formatInstant(instant: Date | string, timeZone: string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof instant === "string" ? new Date(instant) : instant
  return new Intl.DateTimeFormat(LOCALE, { ...(options ?? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), timeZone }).format(date)
}
