/**
 * Listas do histórico lidas em páginas pelas telas (`usePagedHistory`). Cada uma é
 * exatamente o complemento da janela da abertura (`initialScopes`, `windowBounds`):
 * o que é recente já está na memória; o resto vem do banco, 50 por vez, do mais
 * recente para o mais antigo. As contagens das mesmas listas vêm das funções
 * `*_history_*` (migração 0017), com os mesmos limites.
 *
 * As buscas (`*Search`) procuram em tudo — janela e histórico — pela coluna `search`
 * do banco e pelos clientes/processos cujo nome ou número bate com o termo.
 */

import type { PagedList } from "./office-sync"
import type { ScopeFilter, WindowBounds } from "./storage"
import type { Activity, Invoice, LegalDocument, Prazo, Task } from "@/types"

/** Registros por página do histórico (o mesmo passo do "Mostrar mais" das telas). */
export const HISTORY_PAGE = 50

/** Fronteira de quem não tem janela na abertura: nada está garantido antes da primeira página. */
export const NO_WINDOW = "￿"

/** Junta dois filtros: as igualdades somam; os demais campos de `b` valem por cima dos de `a`. */
function merge(a: ScopeFilter, b: ScopeFilter | null | undefined): ScopeFilter {
  if (!b) return a
  const merged: ScopeFilter = { ...a, ...b }
  const eq = [...(a.eq ?? []), ...(b.eq ?? [])]
  if (eq.length) merged.eq = eq
  else delete merged.eq
  const or = b.or ?? a.or
  if (or) merged.or = or
  else delete merged.or
  return merged
}

const byAssignee = (assigneeId?: string): ScopeFilter => (assigneeId ? { eq: [["data->>assigneeId", assigneeId]] } : {})

/* --------------------------------- Tarefas -------------------------------- */

/** Chave de ordem das concluídas (vazias por último). */
export const completedKey = (t: Task) => t.completedAt ?? ""

/** Concluídas antes da janela (`assigneeId`: só as de uma pessoa). */
export function completedTasks(bounds: WindowBounds, assigneeId?: string): PagedList<Task> {
  return {
    id: `tarefas:concluidas:${assigneeId ?? "escritorio"}`,
    scope: {
      key: "tasks",
      order: "data->>completedAt",
      filter: merge(
        { neq: [["data->>status", "pendente"]], or: `data->>completedAt.lt.${bounds.month},data->>completedAt.is.null` },
        byAssignee(assigneeId),
      ),
    },
    size: HISTORY_PAGE,
    cursor: completedKey,
  }
}

export function taskSearch(query: string, search: ScopeFilter, assigneeId?: string): PagedList<Task> {
  return {
    id: `tarefas:busca:${assigneeId ?? "escritorio"}:${query}`,
    scope: { key: "tasks", order: "data->>completedAt", filter: merge(search, byAssignee(assigneeId)) },
    size: HISTORY_PAGE,
    cursor: completedKey,
  }
}

/* --------------------------------- Prazos --------------------------------- */

export const closedKey = (p: Prazo) => p.closedAt ?? ""

/** Prazos encerrados antes da janela, com uma situação (`cumprido`/`perdido`). */
export function closedPrazos(bounds: WindowBounds, status: "cumprido" | "perdido", responsibleId?: string): PagedList<Prazo> {
  return {
    id: `prazos:${status}:${responsibleId ?? "todos"}`,
    scope: {
      key: "deadlines",
      order: "data->>closedAt",
      filter: {
        eq: [["data->>status", status], ...(responsibleId ? ([["data->>responsibleId", responsibleId]] as [string, string][]) : [])],
        or: `data->>closedAt.lt.${bounds.month},data->>closedAt.is.null`,
      },
    },
    size: HISTORY_PAGE,
    cursor: closedKey,
  }
}

export function prazoSearch(query: string, search: ScopeFilter, status?: "cumprido" | "perdido", responsibleId?: string): PagedList<Prazo> {
  return {
    id: `prazos:busca:${status ?? "todos"}:${responsibleId ?? "todos"}:${query}`,
    scope: {
      key: "deadlines",
      order: "data->>closedAt",
      filter: merge(search, {
        eq: [
          ...(status ? ([["data->>status", status]] as [string, string][]) : []),
          ...(responsibleId ? ([["data->>responsibleId", responsibleId]] as [string, string][]) : []),
        ],
      }),
    },
    size: HISTORY_PAGE,
    cursor: closedKey,
  }
}

/* ------------------------------- Documentos ------------------------------- */

export const uploadedKey = (d: LegalDocument) => d.uploadedAt ?? ""

/** Filtro de tipo da tela de Documentos: um tipo, "outros" (fora dos principais) ou todos. */
export type KindFilter = { kind: string } | { notIn: string[] } | null

const kindFilter = (kind: KindFilter): ScopeFilter =>
  !kind ? {} : "kind" in kind ? { eq: [["data->>kind", kind.kind]] } : { notIn: [["data->>kind", kind.notIn]] }

const kindId = (kind: KindFilter) => (!kind ? "todos" : "kind" in kind ? kind.kind : "outros")

export function olderDocuments(bounds: WindowBounds, kind: KindFilter, clientId?: string): PagedList<LegalDocument> {
  const filter = merge({ lt: [["data->>uploadedAt", bounds.documents]] }, kindFilter(kind))
  return {
    id: `documentos:${kindId(kind)}:${clientId ?? "todos"}`,
    scope: { key: "documents", order: "data->>uploadedAt", filter: clientId ? merge(filter, { eq: [["data->>clientId", clientId]] }) : filter },
    size: HISTORY_PAGE,
    cursor: uploadedKey,
  }
}

export function documentSearch(
  query: string,
  search: ScopeFilter,
  kind: KindFilter,
  clientId?: string,
  size = HISTORY_PAGE,
): PagedList<LegalDocument> {
  const filter = merge(kindFilter(kind), search)
  return {
    id: `documentos:busca:${kindId(kind)}:${clientId ?? "todos"}:${size}:${query}`,
    scope: { key: "documents", order: "data->>uploadedAt", filter: clientId ? merge(filter, { eq: [["data->>clientId", clientId]] }) : filter },
    size,
    cursor: uploadedKey,
  }
}

/* -------------------------------- Financeiro ------------------------------ */

/** Abas do Financeiro com histórico (as em aberto estão todas na memória). */
export type InvoiceHistoryTab = "recebidos" | "cancelados"

/** Ordem do histórico: recebidos pela data do pagamento; cancelados pelo vencimento. */
export const invoiceKey = (tab: InvoiceHistoryTab) => (i: Invoice) => (tab === "recebidos" ? (i.paidAt ?? "") : i.dueDate)

export function olderInvoices(bounds: WindowBounds, tab: InvoiceHistoryTab): PagedList<Invoice> {
  return {
    id: `financeiro:${tab}`,
    scope: {
      key: "invoices",
      order: tab === "recebidos" ? "data->>paidAt" : "data->>dueDate",
      filter: {
        eq: [["data->>status", tab === "recebidos" ? "pago" : "cancelado"]],
        lt: [["data->>dueDate", bounds.finance]],
        or: `data->>paidAt.lt.${bounds.finance},data->>paidAt.is.null`,
      },
    },
    size: HISTORY_PAGE,
    cursor: invoiceKey(tab),
  }
}

export function invoiceSearch(query: string, search: ScopeFilter, tab: InvoiceHistoryTab): PagedList<Invoice> {
  return {
    id: `financeiro:busca:${tab}:${query}`,
    scope: {
      key: "invoices",
      order: tab === "recebidos" ? "data->>paidAt" : "data->>dueDate",
      filter: merge(search, { eq: [["data->>status", tab === "recebidos" ? "pago" : "cancelado"]] }),
    },
    size: HISTORY_PAGE,
    cursor: invoiceKey(tab),
  }
}

/* -------------------------------- Atividades ------------------------------ */

export const activityKey = (a: Activity) => a.at ?? ""

/** Atividades de um cliente ou de um processo (opcionalmente só alguns tipos), das mais recentes. */
export function activitiesOf(owner: { clientId: string } | { processId: string }, types?: string[]): PagedList<Activity> {
  const [column, id] = "clientId" in owner ? ["data->>clientId", owner.clientId] : ["data->>processId", owner.processId]
  return {
    id: `atividades:${column}:${id}:${types?.join(",") ?? "todas"}`,
    scope: { key: "activities", order: "data->>at", filter: { eq: [[column, id]], ...(types ? { in: [["data->>type", types]] } : {}) } },
    size: HISTORY_PAGE,
    cursor: activityKey,
  }
}
