/**
 * "O que merece sua atenção?" — sinais calculados direto dos dados do escritório.
 *
 * Nada aqui chama a IA nem inventa informação: cada sinal aponta para um
 * registro real (tarefa, processo, compromisso, fatura, documento) e diz, em
 * uma frase, por que ele apareceu. A IA entra depois, sob demanda, para
 * interpretar — nunca para produzir estes números.
 *
 * Níveis (usar com parcimônia — se tudo é vermelho, nada é):
 *   critical → atenção necessária (prazo vencendo, tarefa atrasada)
 *   warning  → verificar (prazo na semana, processo parado, valor em atraso)
 *   info     → informação (movimentação recente, documento novo)
 *   done     → concluído (feedback positivo)
 *
 * Roda no navegador e no servidor. Não importa React.
 */

import { addDays, diffInDays, getNow, parse, startOfDay } from "@/lib/dates"
import { isOverdue } from "@/lib/selectors"
import { MOVEMENT_CATEGORY_LABEL, interpretMovements, type MovementCategory } from "@/lib/services/processes/movement-interpreter"
import type { Permission } from "@/lib/auth/permissions"
import type { Activity, Appointment, Client, Invoice, LegalDocument, Process, Task } from "@/types"

/** Sem movimentação há mais que isso = processo parado. Também usado pela LEXA IA. */
export const STALE_DAYS = 60
/** Janela de "movimentação recente" e "documento novo". */
export const RECENT_DAYS = 7
/** Acima disso, sinais do mesmo tipo viram um só ("5 tarefas atrasadas"). */
const GROUP_OVER = 2

/** Categorias de movimentação que costumam pedir revisão do advogado. */
const REVIEW_CATEGORIES: MovementCategory[] = ["prazo", "julgamento", "comunicacao", "audiencia"]

export type SignalLevel = "critical" | "warning" | "info" | "done"

export const LEVEL_ORDER: Record<SignalLevel, number> = { critical: 0, warning: 1, info: 2, done: 3 }

export const LEVEL_LABEL: Record<SignalLevel, string> = {
  critical: "Atenção necessária",
  warning: "Verificar",
  info: "Informação",
  done: "Concluído",
}

export type SignalKind =
  | "task-overdue"
  | "task-today"
  | "deadline-overdue"
  | "deadline-soon"
  | "deadline-week"
  | "process-moved"
  | "process-stale"
  | "appointment-today"
  | "invoice-overdue"
  | "document-new"

export type SignalAction =
  | { type: "open"; label: string; href: string }
  /** Abre o formulário de tarefa já preenchido — nada é salvo sem confirmação. */
  | { type: "create-task"; label: string; processId?: string; clientId?: string; title: string }

export interface AttentionSignal {
  /** Estável entre renderizações: `${kind}:${id}`. */
  id: string
  kind: SignalKind
  level: SignalLevel
  title: string
  detail?: string
  /** Data que ordena o sinal (prazo, movimentação, vencimento…). */
  at?: string
  href: string
  /** Quantos registros o sinal agrupa (1 quando é um só). */
  count: number
  processId?: string
  clientId?: string
  action?: SignalAction
}

export interface AttentionData {
  clients: Client[]
  processes: Process[]
  tasks: Task[]
  appointments: Appointment[]
  documents: LegalDocument[]
  invoices: Invoice[]
  activities?: Activity[]
}

export interface AttentionOptions {
  now?: Date
  /** Quem está olhando: tarefas atrasadas são as dessa pessoa. */
  userId?: string
  can?: (permission: Permission) => boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const bySeverity = (a: AttentionSignal, b: AttentionSignal) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (a.at ?? "9").localeCompare(b.at ?? "9")

export const isActiveProcess = (p: Process) => p.status !== "concluido"

/** Dias até o prazo (negativo = vencido). */
export const daysToDeadline = (p: Process, now: Date = getNow()) =>
  p.nextDeadline && isActiveProcess(p) ? diffInDays(parse(p.nextDeadline.date), now) : undefined

export const daysSinceMovement = (p: Process, now: Date = getNow()) => (p.lastMovementAt ? diffInDays(now, parse(p.lastMovementAt)) : undefined)

export const isStale = (p: Process, now: Date = getNow()) => isActiveProcess(p) && (daysSinceMovement(p, now) ?? 0) > STALE_DAYS

export const movedRecently = (p: Process, now: Date = getNow()) => {
  const days = daysSinceMovement(p, now)
  return days !== undefined && days >= 0 && days <= RECENT_DAYS
}

/** "vence hoje", "vence amanhã", "vence em 3 dias", "venceu há 2 dias". */
export function dueText(days: number) {
  if (days === 0) return "vence hoje"
  if (days === 1) return "vence amanhã"
  if (days > 1) return `vence em ${days} dias`
  if (days === -1) return "venceu ontem"
  return `venceu há ${Math.abs(days)} dias`
}

const processLabel = (p: Process) => `Processo ${p.code}`

/** Última movimentação já interpretada (título legível + categoria). */
export function latestMovement(p: Process) {
  return interpretMovements(p.movements, p.id)[0]
}

/* ------------------------------ por processo ------------------------------ */

/** Sinais de um processo: prazo, movimentação, parado, tarefas atrasadas. */
export function processSignals(data: AttentionData, p: Process, now: Date = getNow()): AttentionSignal[] {
  if (!isActiveProcess(p)) return []
  const signals: AttentionSignal[] = []
  const base = { href: `/processos/${p.id}`, processId: p.id, clientId: p.clientId, count: 1 }
  const days = daysToDeadline(p, now)
  const linked = data.tasks.filter((t) => t.related?.type === "process" && t.related.id === p.id)
  const pending = linked.filter((t) => t.status === "pendente")

  if (days !== undefined && p.nextDeadline && days <= 7) {
    const deadline = p.nextDeadline
    // Prazo sem nenhuma tarefa aberta no processo: fato verificável — e acionável.
    const noTask = days >= 0 && pending.length === 0
    const kind: SignalKind = days < 0 ? "deadline-overdue" : days <= 3 ? "deadline-soon" : "deadline-week"
    signals.push({
      ...base,
      id: `${kind}:${p.id}`,
      kind,
      level: days <= 1 ? "critical" : "warning",
      title: `Prazo ${dueText(days)}`,
      detail: `${processLabel(p)} · ${deadline.title}${noTask ? " · sem tarefa vinculada" : ""}`,
      at: deadline.date,
      action: noTask ? { type: "create-task", label: "Criar tarefa", processId: p.id, title: deadline.title } : undefined,
    })
  }

  const overdueTasks = pending.filter((t) => isOverdue(t, now))
  if (overdueTasks.length) {
    signals.push({
      ...base,
      id: `task-overdue:${p.id}`,
      kind: "task-overdue",
      level: "critical",
      title: overdueTasks.length === 1 ? "Tarefa atrasada" : plural(overdueTasks.length, "tarefa atrasada", "tarefas atrasadas"),
      detail: overdueTasks.length === 1 ? overdueTasks[0].title : `${processLabel(p)}`,
      at: overdueTasks[0].dueAt,
      count: overdueTasks.length,
      href: overdueTasks.length === 1 ? `/tarefas?tarefa=${overdueTasks[0].id}` : base.href,
    })
  }

  if (movedRecently(p, now)) {
    const last = latestMovement(p)
    const review = last && REVIEW_CATEGORIES.includes(last.category)
    signals.push({
      ...base,
      id: `process-moved:${p.id}`,
      kind: "process-moved",
      level: review ? "warning" : "info",
      title: review ? `Movimentação de ${MOVEMENT_CATEGORY_LABEL[last.category].toLowerCase()} para revisar` : "Nova movimentação",
      detail: last ? `${processLabel(p)} · ${last.title}` : processLabel(p),
      at: p.lastMovementAt,
      action: last && review ? { type: "create-task", label: "Criar tarefa", processId: p.id, title: `Revisar: ${last.title}` } : undefined,
    })
  } else if (isStale(p, now)) {
    const since = daysSinceMovement(p, now) ?? 0
    signals.push({
      ...base,
      id: `process-stale:${p.id}`,
      kind: "process-stale",
      level: "warning",
      title: `Sem movimentação há ${since} dias`,
      detail: `${processLabel(p)} · ${p.type}`,
      at: p.lastMovementAt,
    })
  }

  return signals.sort(bySeverity)
}

/* ------------------------------- por cliente ------------------------------- */

export function clientSignals(data: AttentionData, client: Client, now: Date = getNow(), can?: AttentionOptions["can"]): AttentionSignal[] {
  const allowed = (p: Permission) => !can || can(p)
  const processes = allowed("processes.view") ? data.processes.filter((p) => p.clientId === client.id) : []
  const signals = processes.flatMap((p) => processSignals(data, p, now))

  if (allowed("tasks.view")) {
    const overdue = data.tasks.filter((t) => t.related?.type === "client" && t.related.id === client.id && isOverdue(t, now))
    if (overdue.length) {
      signals.push({
        id: `task-overdue:client:${client.id}`,
        kind: "task-overdue",
        level: "critical",
        title: overdue.length === 1 ? "Tarefa atrasada" : plural(overdue.length, "tarefa atrasada", "tarefas atrasadas"),
        detail: overdue.length === 1 ? overdue[0].title : client.name,
        at: overdue[0].dueAt,
        href: overdue.length === 1 ? `/tarefas?tarefa=${overdue[0].id}` : "/tarefas",
        count: overdue.length,
        clientId: client.id,
      })
    }
  }

  if (allowed("finance.view")) {
    const late = data.invoices.filter((i) => i.clientId === client.id && i.status === "atrasado")
    if (late.length) {
      const total = late.reduce((acc, i) => acc + i.amount, 0)
      signals.push({
        id: `invoice-overdue:${client.id}`,
        kind: "invoice-overdue",
        level: "warning",
        title: late.length === 1 ? "Parcela em atraso" : plural(late.length, "parcela em atraso", "parcelas em atraso"),
        detail: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        at: late.map((i) => i.dueDate).sort()[0],
        href: `/clientes/${client.id}?tab=financeiro`,
        count: late.length,
        clientId: client.id,
      })
    }
  }

  return signals.sort(bySeverity)
}

/* ------------------------------ do escritório ------------------------------ */

/** Agrupa sinais do mesmo tipo quando passam de dois — menos ruído, mesma informação. */
function group(signals: AttentionSignal[], kind: SignalKind, title: (n: number) => string, href: string): AttentionSignal[] {
  const same = signals.filter((s) => s.kind === kind)
  if (same.length <= GROUP_OVER) return signals
  const worst = same.slice().sort(bySeverity)[0]
  const count = same.reduce((acc, s) => acc + s.count, 0)
  const merged: AttentionSignal = {
    ...worst,
    id: `${kind}:grupo`,
    title: title(count),
    detail:
      same
        .slice(0, 2)
        .map((s) => s.detail?.split(" · ")[0])
        .filter(Boolean)
        .join(", ") + (same.length > 2 ? ` e mais ${same.length - 2}` : ""),
    count,
    href,
    processId: undefined,
    clientId: undefined,
    action: undefined,
  }
  return [...signals.filter((s) => s.kind !== kind), merged]
}

/**
 * Tudo o que merece atenção no escritório agora, do mais urgente ao informativo.
 * Respeita as permissões de quem olha — nada de um módulo que a pessoa não vê.
 */
export function officeSignals(data: AttentionData, options: AttentionOptions = {}): AttentionSignal[] {
  const now = options.now ?? getNow()
  const allowed = (p: Permission) => !options.can || options.can(p)
  let signals: AttentionSignal[] = []

  if (allowed("processes.view")) {
    for (const p of data.processes) {
      // Tarefas atrasadas entram abaixo, pelas da pessoa — não por processo.
      signals.push(...processSignals(data, p, now).filter((s) => s.kind !== "task-overdue"))
    }
  }

  if (allowed("tasks.view")) {
    const mine = data.tasks.filter((t) => t.status === "pendente" && (!options.userId || t.assigneeId === options.userId))
    for (const t of mine) {
      const days = diffInDays(parse(t.dueAt), now)
      if (days < 0) {
        signals.push({
          id: `task-overdue:${t.id}`,
          kind: "task-overdue",
          level: "critical",
          title: `Tarefa ${dueText(days)}`,
          detail: t.title,
          at: t.dueAt,
          href: `/tarefas?tarefa=${t.id}`,
          count: 1,
        })
      } else if (days === 0) {
        signals.push({
          id: `task-today:${t.id}`,
          kind: "task-today",
          level: "warning",
          title: "Tarefa para hoje",
          detail: t.title,
          at: t.dueAt,
          href: `/tarefas?tarefa=${t.id}`,
          count: 1,
        })
      }
    }
  }

  if (allowed("agenda.view")) {
    const upcomingToday = data.appointments
      .filter((a) => diffInDays(parse(a.start), now) === 0 && parse(a.end) > now)
      .sort((a, b) => a.start.localeCompare(b.start))
    if (upcomingToday.length) {
      const next = upcomingToday[0]
      signals.push({
        id: `appointment-today:${startOfDay(now).toISOString().slice(0, 10)}`,
        kind: "appointment-today",
        level: "info",
        title: upcomingToday.length === 1 ? "1 compromisso restante hoje" : `${upcomingToday.length} compromissos restantes hoje`,
        detail: next.title,
        at: next.start,
        href: "/agenda",
        count: upcomingToday.length,
        processId: next.processId,
        clientId: next.clientId,
      })
    }
  }

  if (allowed("finance.view")) {
    const late = data.invoices.filter((i) => i.status === "atrasado")
    if (late.length) {
      const total = late.reduce((acc, i) => acc + i.amount, 0)
      const clients = new Set(late.map((i) => i.clientId)).size
      signals.push({
        id: "invoice-overdue:escritorio",
        kind: "invoice-overdue",
        level: "warning",
        title: `${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em atraso`,
        detail: `${plural(late.length, "parcela", "parcelas")} · ${plural(clients, "cliente", "clientes")}`,
        at: late.map((i) => i.dueDate).sort()[0],
        href: "/financeiro",
        count: late.length,
      })
    }
  }

  if (allowed("documents.view")) {
    const horizon = addDays(startOfDay(now), -RECENT_DAYS)
    const fresh = data.documents.filter((d) => parse(d.uploadedAt) >= horizon && (!options.userId || d.uploadedById !== options.userId))
    if (fresh.length) {
      signals.push({
        id: "document-new:semana",
        kind: "document-new",
        level: "info",
        title: fresh.length === 1 ? "Documento novo" : `${fresh.length} documentos novos`,
        detail: fresh.length === 1 ? fresh[0].name : "Adicionados pela equipe nos últimos 7 dias",
        at: fresh
          .map((d) => d.uploadedAt)
          .sort()
          .reverse()[0],
        href: "/documentos",
        count: fresh.length,
      })
    }
  }

  signals = group(signals, "task-overdue", (n) => plural(n, "tarefa atrasada", "tarefas atrasadas"), "/tarefas?filtro=atrasadas")
  signals = group(signals, "task-today", (n) => plural(n, "tarefa para hoje", "tarefas para hoje"), "/tarefas?filtro=hoje")
  signals = group(signals, "process-stale", (n) => `${plural(n, "processo", "processos")} sem movimentação há +${STALE_DAYS} dias`, "/processos")
  signals = group(signals, "process-moved", (n) => plural(n, "processo com movimentação recente", "processos com movimentação recente"), "/processos")
  signals = group(signals, "deadline-week", (n) => plural(n, "prazo nesta semana", "prazos nesta semana"), "/processos?filtro=prazos")

  return signals.sort(bySeverity)
}

/** Contagem por nível — alimenta a frase de abertura ("3 pontos merecem atenção"). */
export function countByLevel(signals: AttentionSignal[]) {
  const counts: Record<SignalLevel, number> = { critical: 0, warning: 0, info: 0, done: 0 }
  for (const s of signals) counts[s.level] += 1
  return counts
}

/* ------------------------- desde a última visita -------------------------- */

export interface ChangeItem {
  id: string
  level: SignalLevel
  text: string
  detail?: string
  at: string
  href?: string
}

/**
 * O que mudou desde `since`: o que a equipe registrou (atividades de outras
 * pessoas) e o que o tempo mudou (tarefas da pessoa que venceram nesse
 * intervalo). Ações da própria pessoa não são novidade para ela.
 */
export function changesSince(data: AttentionData, since: Date, options: AttentionOptions = {}): ChangeItem[] {
  const now = options.now ?? getNow()
  const allowed = (p: Permission) => !options.can || options.can(p)
  const items: ChangeItem[] = []

  for (const a of data.activities ?? []) {
    const at = parse(a.at)
    if (at <= since || at > now) continue
    if (options.userId && a.actorUserId === options.userId) continue
    items.push({
      id: `activity:${a.id}`,
      level: a.type === "movement" ? "warning" : "info",
      text: [a.actor, a.message].filter(Boolean).join(" "),
      detail: a.detail,
      at: a.at,
      href: a.href,
    })
  }

  if (allowed("tasks.view")) {
    const due = data.tasks.filter((t) => {
      if (t.status !== "pendente" || (options.userId && t.assigneeId !== options.userId)) return false
      const at = parse(t.dueAt)
      return at > since && at <= now
    })
    // Uma linha só: cada tarefa já aparece em "o que merece sua atenção".
    if (due.length === 1) {
      items.push({
        id: `due:${due[0].id}`,
        level: "critical",
        text: "Tarefa venceu",
        detail: due[0].title,
        at: due[0].dueAt,
        href: `/tarefas?tarefa=${due[0].id}`,
      })
    } else if (due.length > 1) {
      const latest = due
        .map((t) => t.dueAt)
        .sort()
        .reverse()[0]
      items.push({
        id: "due:grupo",
        level: "critical",
        text: `${due.length} tarefas venceram`,
        detail:
          due
            .slice(0, 2)
            .map((t) => t.title)
            .join(", ") + (due.length > 2 ? "…" : ""),
        at: latest,
        href: "/tarefas?filtro=atrasadas",
      })
    }
  }

  return items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.at.localeCompare(a.at))
}
