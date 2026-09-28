"use client"

import * as React from "react"
import { toast } from "sonner"
import { hasValidCheckDigits, onlyDigits } from "@/lib/cnj"
import { getNow, parse } from "@/lib/dates"
import { useSession } from "@/lib/auth/session"
import { refreshProcess } from "@/lib/services/processes/client"
import { isAutoTracked } from "@/lib/services/processes/labels"
import { useDemoActions } from "@/lib/store/demo-store"
import type { Process } from "@/types"

/** Mesmo prazo do cache do servidor: antes disso, o que está salvo já é o mais recente. */
export const AUTO_REFRESH_AFTER_MS = 6 * 60 * 60 * 1000

export type RefreshState = { status: "idle" } | { status: "refreshing"; manual: boolean } | { status: "error"; message: string }

const IDLE: RefreshState = { status: "idle" }

const isStale = (lastSyncedAt?: string) => !lastSyncedAt || getNow().getTime() - parse(lastSyncedAt).getTime() > AUTO_REFRESH_AFTER_MS

/**
 * Atualização das informações de um processo salvo (stale-while-revalidate).
 *
 * O que está salvo aparece na hora. Se a última atualização passou do prazo,
 * uma consulta começa em segundo plano, sem bloquear a página; quando termina,
 * só as movimentações novas entram. A consulta continua mesmo se a pessoa sair
 * da página — o resultado é aplicado no store do escritório.
 */
export function useProcessRefresh(process: Process | undefined) {
  const { applyProcessSync } = useDemoActions()
  const { can } = useSession()
  // Estado atrelado ao processo: ao trocar de processo na mesma tela, não herda o anterior.
  const [current, setCurrent] = React.useState<{ id?: string; state: RefreshState }>({ state: IDLE })

  const id = process?.id
  const state = current.id === id ? current.state : IDLE
  const cnj = process ? (process.cnj ?? onlyDigits(process.number)) : ""
  const code = process?.code
  // Qualquer processo com CNJ válido pode ser atualizado à mão (um cadastro manual
  // passa a ser acompanhado); a atualização automática vale só para os acompanhados.
  const enabled = !!process && can("processes.edit") && hasValidCheckDigits(cnj)
  const tracked = isAutoTracked(process?.source?.provider)

  const refresh = React.useCallback(
    async (manual: boolean) => {
      if (!id || !enabled) return
      const setState = (next: RefreshState) => setCurrent({ id, state: next })
      setState({ status: "refreshing", manual })
      const result = await refreshProcess(id, cnj, { force: manual })

      if (!result.ok) {
        // Consulta desligada pela administração: a atualização automática só não acontece.
        if (result.reason === "disabled" && !manual) return setState(IDLE)
        setState({
          status: "error",
          message: result.reason === "offline" || result.reason === "disabled" ? result.message : "Tente novamente em alguns instantes.",
        })
        return
      }

      const { added } = applyProcessSync(id, result.sheet, result.checkedAt)
      setState({ status: "idle" })
      if (added > 0) {
        toast.success(added === 1 ? "1 nova movimentação." : `${added} novas movimentações.`, { description: `Processo ${code} atualizado.` })
      } else if (manual) {
        toast.success("As informações já estão atualizadas.", { description: "Nenhuma movimentação nova." })
      }
    },
    [id, cnj, code, enabled, applyProcessSync],
  )

  // Uma vez por abertura do processo, só se o que está salvo já venceu.
  const shouldAutoRefresh = enabled && tracked && isStale(process?.lastSyncedAt)
  React.useEffect(() => {
    // Consulta externa em segundo plano; o estado reflete o andamento dela.
    if (shouldAutoRefresh) refresh(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { state, enabled, refresh: () => refresh(true) }
}
