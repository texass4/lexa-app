/**
 * Peças comuns aos context builders: datas legíveis, referências curtas às
 * fontes ("M1", "T2") e a descrição de movimentações/tarefas/compromissos no
 * formato compacto que o modelo recebe.
 */

import { diffInDays, fmtNumericDate, fmtTime, parse, toLocalISO } from "@/lib/dates"
import { PRIORITY_CONFIG } from "@/lib/config"
import { complementLabel, complementText, interpretMovement } from "@/lib/services/processes/movement-interpreter"
import type { AISource, AISources, SourceKind } from "@/lib/ai/types"
import type { Appointment, LegalDocument, ProcessMovement, Task } from "@/types"
import type { Member } from "./repository"

/** Contexto pronto para o modelo + fontes que ele pode citar. */
export interface BuiltContext<C = Record<string, unknown>> {
  context: C
  sources: AISources
  /** Uma frase sobre a base da análise, mostrada na interface. */
  basis: string
}

const valid = (iso?: string | null) => !!iso && !Number.isNaN(parse(iso).getTime())

/** "26/09/2026" no relógio do servidor. */
export const fmtToday = (now: Date) => fmtNumericDate(toLocalISO(now))
export const fmtDate = (iso?: string | null) => (valid(iso) ? fmtNumericDate(iso!) : undefined)
export const fmtDateTime = (iso?: string | null) => (valid(iso) ? `${fmtNumericDate(iso!)} ${fmtTime(iso!)}` : undefined)
export const daysSince = (iso: string | null | undefined, now: Date) => (valid(iso) ? diffInDays(now, parse(iso!)) : undefined)
export const daysUntil = (iso: string | null | undefined, now: Date) => (valid(iso) ? diffInDays(parse(iso!), now) : undefined)

const PREFIX: Record<SourceKind, string> = {
  movement: "M",
  process: "P",
  task: "T",
  appointment: "A",
  document: "D",
  client: "C",
  invoice: "F",
}

/** Distribui referências curtas e registra de onde cada uma veio. */
export class SourceRegistry {
  readonly sources: AISources = {}
  private readonly counters = new Map<SourceKind, number>()

  add(kind: SourceKind, source: Omit<AISource, "ref" | "kind">): string {
    const next = (this.counters.get(kind) ?? 0) + 1
    this.counters.set(kind, next)
    const ref = `${PREFIX[kind]}${next}`
    this.sources[ref] = { ref, kind, ...source }
    return ref
  }
}

export function memberName(members: Member[], id?: string) {
  return (id && members.find((m) => m.id === id)?.name) || undefined
}

/** Mais recente primeiro, sem alterar a lista original. */
export function newestFirst<T extends { at: string }>(items: readonly T[]) {
  return [...items].sort((a, b) => b.at.localeCompare(a.at))
}

/** Movimentação como a fonte informou: nome, código, complementos legíveis e órgão. */
export function describeMovement(movement: ProcessMovement, ref: string) {
  const interpreted = interpretMovement(movement)
  const complements = (movement.complements ?? []).map((c) => ({
    tipo: complementLabel(c),
    valor: complementText(c) ?? (c.value !== undefined ? `código ${c.value}` : undefined),
  }))
  return {
    ref,
    data: fmtDateTime(movement.at),
    nome: interpreted.title,
    codigo_tpu: movement.code,
    complementos: complements.length ? complements : undefined,
    // Texto livre só existe no cadastro manual; com complementos, eles já dizem tudo.
    descricao: complements.length ? undefined : interpreted.description,
    orgao_julgador: movement.judicialUnit?.name,
    documento_disponivel: movement.document?.available ? true : undefined,
  }
}

export function registerMovement(registry: SourceRegistry, movement: ProcessMovement, processId: string) {
  return registry.add("movement", {
    id: movement.id,
    label: movement.title?.trim() || "Movimentação",
    date: movement.at,
    processId,
    href: `/processos/${processId}`,
  })
}

export function describeTask(task: Task, ref: string, members: Member[], now: Date) {
  const due = daysUntil(task.dueAt, now)
  return {
    ref,
    titulo: task.title,
    descricao: task.description,
    prazo_da_tarefa: fmtDateTime(task.dueAt),
    situacao: task.status === "concluida" ? "concluída" : due !== undefined && due < 0 ? `atrasada há ${-due} dia(s)` : "pendente",
    prioridade: PRIORITY_CONFIG[task.priority]?.label,
    responsavel: memberName(members, task.assigneeId),
  }
}

export function registerTask(registry: SourceRegistry, task: Task) {
  return registry.add("task", { id: task.id, label: task.title, date: task.dueAt, href: "/tarefas" })
}

export function describeAppointment(appointment: Appointment, ref: string) {
  return {
    ref,
    titulo: appointment.title,
    inicio: fmtDateTime(appointment.start),
    local: appointment.location,
  }
}

export function registerAppointment(registry: SourceRegistry, appointment: Appointment) {
  return registry.add("appointment", {
    id: appointment.id,
    label: appointment.title,
    date: appointment.start,
    processId: appointment.processId,
    href: "/agenda",
  })
}

export function describeDocument(document: LegalDocument, ref: string) {
  return { ref, nome: document.name, tipo: document.kind, enviado_em: fmtDate(document.uploadedAt) }
}

export function registerDocument(registry: SourceRegistry, document: LegalDocument) {
  return registry.add("document", { id: document.id, label: document.name, date: document.uploadedAt, href: "/documentos" })
}

/** Pendentes primeiro (por prazo), depois concluídas mais recentes. */
export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === "pendente" ? -1 : 1))
}

export function upcoming<T extends { start: string; end: string }>(items: T[], now: Date) {
  return items.filter((a) => valid(a.end) && parse(a.end) >= now).sort((a, b) => a.start.localeCompare(b.start))
}
