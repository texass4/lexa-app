/**
 * Datas e formatadores. Datas são armazenadas como ISO local (sem fuso),
 * ex.: "2026-09-23T09:42:00".
 */

/** Momento atual. Único ponto de leitura do relógio — facilita testar e trocar. */
export const getNow = () => new Date()

export function toLocalISO(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:00`
}

export function parse(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

export const monthName = (m: number) => MONTHS[m]
export const monthShort = (m: number) => MONTHS_SHORT[m]
export const weekdayShort = (d: number) => WEEKDAYS_SHORT[d]
export const weekdayName = (d: number) => WEEKDAYS[d]

const pad = (n: number) => String(n).padStart(2, "0")
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

export function addMonths(d: Date, months: number) {
  const x = new Date(d)
  x.setDate(1)
  x.setMonth(x.getMonth() + months)
  return x
}

export function startOfWeek(d: Date) {
  const x = startOfDay(d)
  const diff = (x.getDay() + 6) % 7
  return addDays(x, -diff)
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function diffInDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}

/** 09:42 */
export function fmtTime(iso: string) {
  const d = parse(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 25/09 */
export function fmtShortDate(iso: string) {
  const d = parse(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** 25/09/2026 */
export function fmtNumericDate(iso: string) {
  const d = parse(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** { day: "25", month: "SET" } */
export function fmtDayMonthParts(iso: string) {
  const d = parse(iso)
  return { day: pad(d.getDate()), month: MONTHS_SHORT[d.getMonth()].toUpperCase() }
}

/** 25 SET */
export function fmtDayMonth(iso: string) {
  const { day, month } = fmtDayMonthParts(iso)
  return `${day} ${month}`
}

/** 12 de agosto de 2026 */
export function fmtLongDate(iso: string) {
  const d = parse(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

/** Quarta-feira, 23 de setembro de 2026 */
export function fmtFullDate(d: Date) {
  return `${cap(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

/** 23 set */
export function fmtShortDayMonth(iso: string) {
  const d = parse(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** "Hoje", "Ontem", "Amanhã" ou "Seg, 21 set" */
export function fmtDayLabel(iso: string, now: Date = getNow()) {
  const d = parse(iso)
  const diff = diffInDays(d, now)
  if (diff === 0) return "Hoje"
  if (diff === -1) return "Ontem"
  if (diff === 1) return "Amanhã"
  return `${cap(WEEKDAYS_SHORT[d.getDay()])}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** Hora para hoje, "Ontem, 17:42" ou "21 set, 14:00" */
export function fmtActivityTime(iso: string, now: Date = getNow()) {
  const d = parse(iso)
  const diff = diffInDays(d, now)
  if (diff === 0) return fmtTime(iso)
  if (diff === -1) return `Ontem, ${fmtTime(iso)}`
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${fmtTime(iso)}`
}

/** "agora", "há 24 min", "há 2h", "ontem", "há 3 dias", "12 ago" */
export function fmtRelative(iso: string, now: Date = getNow()) {
  const d = parse(iso)
  const minutes = Math.round((now.getTime() - d.getTime()) / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const days = diffInDays(now, d)
  if (days === 0) return `há ${hours}h`
  if (days === 1) return "ontem"
  if (days < 7) return `há ${days} dias`
  return fmtShortDayMonth(iso)
}

/** "em 2 dias", "hoje", "amanhã", "há 1 dia" */
export function fmtDueIn(iso: string, now: Date = getNow()) {
  const diff = diffInDays(parse(iso), now)
  if (diff === 0) return "hoje"
  if (diff === 1) return "amanhã"
  if (diff > 1) return `em ${diff} dias`
  if (diff === -1) return "venceu ontem"
  return `venceu há ${Math.abs(diff)} dias`
}

export function greeting(now: Date = getNow()) {
  const h = now.getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

/** "agora", "em 45 min", "em 2h", "em 5h18" — quanto falta para um horário. */
export function fmtStartsIn(iso: string, now: Date = getNow()) {
  const minutes = Math.round((parse(iso).getTime() - now.getTime()) / 60_000)
  if (minutes <= 0) return "agora"
  if (minutes < 60) return `em ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `em ${hours}h${rest ? String(rest).padStart(2, "0") : ""}`
}
