/**
 * Prazos: regras e consultas usadas pelas telas, pelos sinais de atenção e pelo
 * contexto da Íntegra IA. A coleção de prazos (`deadlines`) é a única fonte de
 * verdade — "próximo prazo" é sempre calculado aqui, a partir dos prazos abertos.
 *
 * Funções puras: rodam no navegador e no servidor. Não importa React.
 */

import { addDays, diffInDays, getNow, parse, startOfWeek } from "@/lib/core/dates"
import { byId, groupOf, prazosByProcess } from "@/lib/store/indexes"
import type { Prazo, PrazoOrigin, Task } from "@/types"

const PRAZO_ORIGINS: PrazoOrigin[] = ["manual", "intimacao", "movimentacao"]

/** Só prazos abertos contam como próximos/pendentes. */
export const isOpenPrazo = (prazo: Prazo) => prazo.status === "aberto"

/** Dias até a data fatal (negativo = já passou). */
export const daysToPrazo = (prazo: Prazo, now: Date = getNow()) => diffInDays(parse(prazo.fatalDate), now)

const byFatalDate = (a: Prazo, b: Prazo) => a.fatalDate.localeCompare(b.fatalDate) || a.internalDate.localeCompare(b.internalDate)

/** Prazos de um processo: abertos primeiro (o mais urgente no topo), depois os encerrados (mais recentes primeiro). */
export function prazosOfProcess(prazos: readonly Prazo[], processId: string): Prazo[] {
  const own = prazosByProcess(prazos, processId)
  return [...own.filter(isOpenPrazo).sort(byFatalDate), ...own.filter((p) => !isOpenPrazo(p)).sort((a, b) => byFatalDate(b, a))]
}

/**
 * Próximo prazo entre os abertos: a menor data fatal (um prazo aberto já vencido vem
 * primeiro, para não passar despercebido). `processIds` restringe a esses processos.
 */
export function nextPrazo(prazos: readonly Prazo[], processIds?: string | ReadonlySet<string>): Prazo | undefined {
  // Um processo só: o índice por processo evita percorrer todos os prazos do escritório.
  const candidates = typeof processIds === "string" ? prazosByProcess(prazos, processIds) : prazos
  const inScope = (p: Prazo) => processIds === undefined || typeof processIds === "string" || processIds.has(p.processId)
  let next: Prazo | undefined
  for (const p of candidates) if (isOpenPrazo(p) && inScope(p) && (!next || byFatalDate(p, next) < 0)) next = p
  return next
}

/** Tarefa vinculada ao prazo (por id), se ainda existir. */
export const prazoTask = (prazo: Prazo, tasks: readonly Task[]) => byId(tasks, prazo.taskId)

/** Prazo ao qual a tarefa está vinculada. */
export const taskPrazo = (task: Task, prazos: readonly Prazo[]) => groupOf(prazos, "taskId", (p) => p.taskId, task.id)[0]

export interface WeekGroup {
  responsibleId: string
  prazos: Prazo[]
}

/**
 * "Prazos da semana": prazos abertos com data fatal até o fim desta semana (segunda a
 * domingo) — os já vencidos e ainda abertos também, que são os mais urgentes —
 * agrupados por responsável. Grupos ordenados pelo prazo mais urgente de cada um.
 */
export function weekPrazos(prazos: readonly Prazo[], now: Date = getNow()): WeekGroup[] {
  const end = addDays(startOfWeek(now), 6)
  const due = prazos.filter((p) => isOpenPrazo(p) && diffInDays(parse(p.fatalDate), end) <= 0).sort(byFatalDate)
  const groups = new Map<string, Prazo[]>()
  for (const p of due) groups.set(p.responsibleId ?? "", [...(groups.get(p.responsibleId ?? "") ?? []), p])
  return [...groups].map(([responsibleId, list]) => ({ responsibleId, prazos: list }))
}

/** Período de um prazo aberto, para o panorama: vencido, hoje, até domingo, semana que vem ou depois. */
export type PrazoPeriod = "vencido" | "hoje" | "semana" | "proxima" | "depois"

export const PRAZO_PERIOD_LABEL: Record<PrazoPeriod, string> = {
  vencido: "Vencidos",
  hoje: "Hoje",
  semana: "Até domingo",
  proxima: "Semana que vem",
  depois: "Mais adiante",
}

export function prazoPeriod(prazo: Prazo, now: Date = getNow()): PrazoPeriod {
  const days = daysToPrazo(prazo, now)
  if (days < 0) return "vencido"
  if (days === 0) return "hoje"
  const sunday = addDays(startOfWeek(now), 6)
  const fatal = parse(prazo.fatalDate)
  if (diffInDays(fatal, sunday) <= 0) return "semana"
  if (diffInDays(fatal, addDays(sunday, 7)) <= 0) return "proxima"
  return "depois"
}

/* -------------------------------- Validação -------------------------------- */

export interface PrazoInput {
  processId: string
  description: string
  fatalDate: string
  internalDate: string
  internalDateReason?: string
  responsibleId: string
  origin: string
}

export type PrazoErrors = Partial<Record<keyof PrazoInput, string>>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isRealDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** Mesmas regras do banco (`0008_prazos.sql`), com mensagens para o formulário. */
export function validatePrazo(input: PrazoInput): PrazoErrors {
  const errors: PrazoErrors = {}
  if (!input.processId) errors.processId = "Escolha o processo do prazo."
  const description = input.description.trim()
  if (!description) errors.description = "Descreva o prazo (ex.: Contestação)."
  else if (description.length > 500) errors.description = "Use no máximo 500 caracteres."
  if (!input.fatalDate) errors.fatalDate = "Informe a data fatal."
  else if (!isRealDate(input.fatalDate)) errors.fatalDate = "Data inválida."
  if (!input.internalDate) errors.internalDate = "Informe a data interna."
  else if (!isRealDate(input.internalDate)) errors.internalDate = "Data inválida."
  if (!input.responsibleId) errors.responsibleId = "Escolha o responsável."
  if (!PRAZO_ORIGINS.includes(input.origin as PrazoOrigin)) errors.origin = "Origem inválida."
  if (!errors.fatalDate && !errors.internalDate && internalAfterFatal(input) && !input.internalDateReason?.trim()) {
    errors.internalDateReason = "A data interna fica depois da data fatal. Explique por quê."
  }
  return errors
}

/** Data interna depois da data fatal — só com justificativa. */
export const internalAfterFatal = (input: Pick<PrazoInput, "fatalDate" | "internalDate">) =>
  !!input.fatalDate && !!input.internalDate && input.internalDate > input.fatalDate
