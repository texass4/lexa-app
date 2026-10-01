/**
 * Calendário forense para a SUGESTÃO de prazos de intimações. Datas como
 * `YYYY-MM-DD`, com aritmética em UTC (independe do fuso de quem roda).
 *
 * O que entra:
 *   - feriados nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023 — 20/11 a
 *     partir de 2024) e os dias sem expediente forense usuais (segunda e terça de
 *     Carnaval, Sexta-feira Santa, Corpus Christi);
 *   - Justiça Federal (TRFs): feriados da Lei 5.010/1966, art. 62 (quarta e quinta
 *     da Semana Santa, 11/08, 01/11, 08/12);
 *   - suspensão dos prazos de 20/12 a 20/01 (CPC, art. 220).
 *
 * O que NÃO entra (e a tela avisa): feriados estaduais/municipais, portarias do
 * tribunal (ponto facultativo, indisponibilidade do sistema). Por isso a data é
 * sempre uma sugestão para o advogado conferir.
 */

const DAY = 86_400_000

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toISO = (date: Date) => date.toISOString().slice(0, 10)

export const addCalendarDays = (iso: string, days: number) => toISO(new Date(toDate(iso).getTime() + days * DAY))

/** Domingo de Páscoa (algoritmo gregoriano anônimo). */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export interface CalendarOptions {
  /** Justiça Federal: acrescenta os feriados da Lei 5.010/1966, art. 62. */
  federal?: boolean
}

const cache = new Map<string, Map<string, string>>()

/** Feriados do ano: data → nome. */
export function holidays(year: number, { federal = false }: CalendarOptions = {}): Map<string, string> {
  const key = `${year}:${federal}`
  const hit = cache.get(key)
  if (hit) return hit
  const e = easter(year)
  const list: [string, string][] = [
    [`${year}-01-01`, "Confraternização Universal"],
    [addCalendarDays(e, -48), "Carnaval"],
    [addCalendarDays(e, -47), "Carnaval"],
    [addCalendarDays(e, -2), "Sexta-feira Santa"],
    [`${year}-04-21`, "Tiradentes"],
    [`${year}-05-01`, "Dia do Trabalho"],
    [addCalendarDays(e, 60), "Corpus Christi"],
    [`${year}-09-07`, "Independência"],
    [`${year}-10-12`, "Nossa Senhora Aparecida"],
    [`${year}-11-02`, "Finados"],
    [`${year}-11-15`, "Proclamação da República"],
    [`${year}-12-25`, "Natal"],
  ]
  if (year >= 2024) list.push([`${year}-11-20`, "Dia Nacional de Zumbi e da Consciência Negra"])
  if (federal) {
    list.push(
      [addCalendarDays(e, -4), "Quarta-feira Santa (Lei 5.010/1966)"],
      [addCalendarDays(e, -3), "Quinta-feira Santa (Lei 5.010/1966)"],
      [`${year}-08-11`, "Dia do Advogado (Lei 5.010/1966)"],
      [`${year}-11-01`, "Todos os Santos (Lei 5.010/1966)"],
      [`${year}-12-08`, "Dia da Justiça (Lei 5.010/1966)"],
    )
  }
  const map = new Map(list)
  cache.set(key, map)
  return map
}

/** Prazos suspensos de 20/12 a 20/01 (CPC, art. 220). */
export function isSuspended(iso: string) {
  const md = iso.slice(5)
  return md >= "12-20" || md <= "01-20"
}

function isWeekend(iso: string) {
  const day = toDate(iso).getUTCDay()
  return day === 0 || day === 6
}

/** Dia útil forense: segunda a sexta, fora de feriado. */
export function isBusinessDay(iso: string, options: CalendarOptions = {}) {
  return !isWeekend(iso) && !holidays(Number(iso.slice(0, 4)), options).has(iso)
}

/** Primeiro dia útil DEPOIS de `iso`. */
export function nextBusinessDay(iso: string, options: CalendarOptions = {}) {
  let day = addCalendarDays(iso, 1)
  while (!isBusinessDay(day, options)) day = addCalendarDays(day, 1)
  return day
}

/** Dia que conta para prazo em dias úteis: útil e fora da suspensão do art. 220. */
const countable = (iso: string, options: CalendarOptions) => isBusinessDay(iso, options) && !isSuspended(iso)

/**
 * Último dia de um prazo de `days` dias úteis que começa em `start` (o dia 1 é o
 * primeiro dia contável a partir de `start`, inclusive).
 */
export function addBusinessDays(start: string, days: number, options: CalendarOptions = {}) {
  let day = start
  while (!countable(day, options)) day = addCalendarDays(day, 1)
  for (let counted = 1; counted < days; ) {
    day = addCalendarDays(day, 1)
    if (countable(day, options)) counted += 1
  }
  return day
}

/**
 * Prazo em dias corridos (ex.: processo penal, CPP art. 798): `days` dias a partir de
 * `start` (dia 1), prorrogado para o próximo dia útil se terminar em dia sem expediente.
 */
export function addCalendarDeadline(start: string, days: number, options: CalendarOptions = {}) {
  const end = addCalendarDays(start, days - 1)
  return isBusinessDay(end, options) ? end : nextBusinessDay(end, options)
}

/** `days` dias úteis ANTES de `iso` (data interna sugerida, antes da fatal). */
export function subtractBusinessDays(iso: string, days: number, options: CalendarOptions = {}) {
  let day = iso
  for (let counted = 0; counted < days; ) {
    day = addCalendarDays(day, -1)
    if (isBusinessDay(day, options)) counted += 1
  }
  return day
}
