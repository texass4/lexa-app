"use client"

import * as React from "react"
import { toast } from "sonner"
import { useOfficeActions, useOfficeData, type PagedList } from "./office-store"
import { getNow } from "@/lib/core/dates"
import { appointmentsBetween, clientScopes, daysBefore, processScopes, RECENT_APPOINTMENT_DAYS, type Scope } from "./storage"

/**
 * Dados sob demanda. A abertura do Íntegra traz só o que a primeira tela usa
 * (`initialScopes`); cada tela pede aqui o que precisa além disso, na hora em que é
 * aberta. Cada recorte é lido uma vez por sessão e depois segue pelo tempo real.
 *
 * Os hooks devolvem `true` quando tudo o que pediram já está na memória — a tela
 * mostra o esqueleto (ou o que já tem) até lá.
 */
export function useEnsureScopes(scopes: Scope[] | null): boolean {
  const { ensureScopes, isLoaded } = useOfficeActions()
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  const key = scopes?.map((scope) => scope.id).join("|") ?? ""
  const ready = !scopes || scopes.every((scope) => isLoaded(scope.id))

  React.useEffect(() => {
    if (!scopes || ready) return
    let alive = true
    ensureScopes(scopes).then(
      () => alive && rerender(),
      (error) => {
        console.error("[sob demanda] Não foi possível carregar:", key, error)
        if (alive) toast.error("Não foi possível carregar todos os dados desta tela.", { id: "on-demand", description: "Verifique a conexão e tente de novo." })
      },
    )
    return () => {
      alive = false
    }
    // `key` identifica os recortes; a lista em si muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, ensureScopes])

  return ready
}

/**
 * Detalhe do processo: o histórico completo de movimentações e o que é dele (tarefas,
 * prazos, documentos, compromissos, atividades). `history` diz se as movimentações
 * completas já chegaram; `related` se o resto chegou.
 */
export function useProcessDetail(processId: string | undefined): { history: boolean; related: boolean } {
  const { ensureFullProcesses } = useOfficeActions()
  const data = useOfficeData()
  const partial = !!data.processes.find((p) => p.id === processId)?.movementsPartial
  const scopes = React.useMemo(() => (processId ? processScopes(processId) : null), [processId])
  const related = useEnsureScopes(scopes)

  React.useEffect(() => {
    if (!processId || !partial || !data.hydrated) return
    ensureFullProcesses([processId]).catch((error) => {
      console.error("[sob demanda] Não foi possível carregar o histórico do processo:", error)
      toast.error("Não foi possível carregar o histórico do processo.", { id: "process-history", description: "Verifique a conexão e tente de novo." })
    })
  }, [processId, partial, data.hydrated, ensureFullProcesses])

  return { history: !partial, related }
}

/** Perfil do cliente (e o painel do cliente no Atendimento): o que é dele e dos processos dele. */
export function useClientDetail(clientId: string | undefined): boolean {
  const data = useOfficeData()
  const processIds = data.processes
    .filter((p) => p.clientId === clientId)
    .map((p) => p.id)
    .sort()
    .join(",")
  const scopes = React.useMemo(() => (clientId ? clientScopes(clientId, processIds ? processIds.split(",") : []) : null), [clientId, processIds])
  return useEnsureScopes(scopes)
}

/**
 * Compromissos do período que a Agenda mostra (`YYYY-MM-DD`, `[from, to)`). Períodos
 * dentro da janela da abertura já estão na memória: só os anteriores são lidos.
 */
export function useAppointmentsRange(from: string, to: string): boolean {
  const covered = from >= daysBefore(getNow(), RECENT_APPOINTMENT_DAYS)
  const scopes = React.useMemo(() => (covered ? null : [appointmentsBetween(from, to)]), [covered, from, to])
  return useEnsureScopes(scopes)
}

/**
 * Lista do histórico lida em páginas (mais recentes primeiro), por cima do que a
 * abertura já trouxe. Devolve até onde a lista está completa na memória:
 *
 * - `cursor`: a tela mostra só os registros com chave de ordem `>= cursor` — mais
 *   recentes que isso, nada falta (a janela da abertura vai até `boundary`; cada
 *   página lida avança o cursor). `null` quando não há mais nada no banco.
 * - `more()`: lê a próxima página. Com `auto`, a primeira é lida ao montar (busca).
 *
 * `list` nulo: nada a ler (a tela mostra tudo o que tem).
 */
export function usePagedHistory<T>(list: PagedList<T> | null, boundary: string, options: { auto?: boolean } = {}) {
  const { loadNextPage, pageState } = useOfficeActions()
  const data = useOfficeData()
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  const [loading, setLoading] = React.useState<string | null>(null)
  const state = list ? pageState(list.id) : undefined
  const listRef = React.useRef(list)
  React.useEffect(() => {
    listRef.current = list
  })

  const more = React.useCallback(() => {
    const current = listRef.current
    if (!current) return
    setLoading(current.id)
    loadNextPage(current).then(
      () => {
        setLoading((id) => (id === current.id ? null : id))
        rerender()
      },
      (error) => {
        setLoading((id) => (id === current.id ? null : id))
        console.error("[histórico] Não foi possível carregar:", current.id, error)
        toast.error("Não foi possível carregar mais registros.", { id: "history", description: "Verifique a conexão e tente de novo." })
      },
    )
  }, [loadNextPage])

  const id = list?.id
  const auto = !!options.auto && !!id && !state && data.hydrated
  React.useEffect(() => {
    if (auto) more()
  }, [auto, id, more])

  if (!list) return { cursor: null, done: true, total: undefined, loading: false, more }
  return {
    cursor: state?.done ? null : (state?.cursor ?? boundary),
    done: !!state?.done,
    total: state?.total,
    loading: loading === list.id || (auto && !state),
    more,
  }
}

const statsCache = new Map<string, unknown>()

/**
 * Contagens do histórico calculadas no banco (uma consulta por tela). Relidas a cada
 * vez que a tela abre; enquanto isso, valem as da última vez.
 */
export function useHistoryStats<T>(fn: string, args: Record<string, string> | null): T | undefined {
  const { fetchStats } = useOfficeActions()
  const key = args ? `${fn}:${JSON.stringify(args)}` : null
  const [result, setResult] = React.useState<{ key: string; value: T } | null>(null)

  React.useEffect(() => {
    if (!key || !args) return
    let alive = true
    fetchStats<T>(fn, args).then(
      (value) => {
        statsCache.set(key, value)
        if (alive) setResult({ key, value })
      },
      (error) => console.error("[histórico] Não foi possível contar:", fn, error),
    )
    return () => {
      alive = false
    }
    // `key` resume `fn` e `args`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetchStats])

  if (!key) return undefined
  return result?.key === key ? result.value : (statsCache.get(key) as T | undefined)
}

/** O valor depois de `ms` sem mudar (busca no banco só quando a pessoa para de digitar). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
