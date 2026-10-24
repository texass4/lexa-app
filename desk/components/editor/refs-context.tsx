"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { refKey, type Ref, type RefSummary } from "@/lib/domain/refs"

/*
 * Estado atual dos registros citados (título, status…). Nada disso é gravado no documento:
 * o documento guarda só tipo + id, e esta camada busca o que exibir — de novo ao voltar
 * para a aba, para refletir mudanças feitas em outros módulos.
 */

type RefsApi = {
  get: (ref: Ref) => RefSummary | undefined
  /** Já se sabe que o registro não existe (foi excluído). */
  isMissing: (ref: Ref) => boolean
  put: (summary: RefSummary) => void
  track: (refs: Ref[]) => void
  refresh: () => Promise<void>
}

const RefsContext = createContext<RefsApi | null>(null)

export function useRefs(): RefsApi {
  const value = useContext(RefsContext)
  if (!value) throw new Error("useRefs fora do RefsProvider")
  return value
}

export async function fetchSummaries(keys: string[]): Promise<{ summaries: Record<string, RefSummary>; requested: string[] }> {
  const res = await fetch("/api/refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs: keys }) })
  if (!res.ok) throw new Error("Falha ao atualizar referências")
  return res.json()
}

export function RefsProvider({ initial, children }: { initial: Record<string, RefSummary>; children: ReactNode }) {
  const [summaries, setSummaries] = useState<Record<string, RefSummary>>(initial)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const tracked = useRef(new Set<string>(Object.keys(initial)))
  const pendingTrack = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (keys: string[]) => {
    if (keys.length === 0) return
    try {
      const data = await fetchSummaries(keys)
      setSummaries((s) => ({ ...s, ...data.summaries }))
      setMissing((m) => {
        const next = new Set(m)
        for (const k of data.requested) {
          if (data.summaries[k]) next.delete(k)
          else next.add(k)
        }
        return next
      })
    } catch {
      // Sem rede: mantém o que já se sabia; tenta de novo no próximo foco.
    }
  }, [])

  const refresh = useCallback(() => load([...tracked.current]), [load])

  const track = useCallback(
    (refs: Ref[]) => {
      const fresh = refs.map(refKey).filter((k) => !tracked.current.has(k))
      if (fresh.length === 0) return
      fresh.forEach((k) => tracked.current.add(k))
      if (pendingTrack.current) clearTimeout(pendingTrack.current)
      pendingTrack.current = setTimeout(() => void load(fresh), 50)
    },
    [load],
  )

  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && void refresh()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [refresh])

  const api = useMemo<RefsApi>(
    () => ({
      get: (ref) => summaries[refKey(ref)],
      isMissing: (ref) => missing.has(refKey(ref)),
      put: (summary) => {
        tracked.current.add(refKey(summary))
        setSummaries((s) => ({ ...s, [refKey(summary)]: summary }))
      },
      track,
      refresh,
    }),
    [summaries, missing, track, refresh],
  )
  return <RefsContext.Provider value={api}>{children}</RefsContext.Provider>
}
