"use client"

import * as React from "react"
import { toast } from "sonner"
import { useOfficeActions, useOfficeData } from "./office-store"
import { getNow } from "@/lib/core/dates"
import { appointmentsBetween, clientScopes, daysBefore, processScopes, RECENT_APPOINTMENT_DAYS, wholeCollection, type Collection, type Scope } from "./storage"

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

/** A coleção inteira (Documentos, Financeiro, Tarefas, Prazos, busca global). */
export function useWholeCollection(key: Collection | null): boolean {
  const scopes = React.useMemo(() => (key ? [wholeCollection(key)] : null), [key])
  return useEnsureScopes(scopes)
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
