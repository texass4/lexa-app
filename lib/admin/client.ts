"use client"

import * as React from "react"
import { hardNavigate } from "@/lib/auth/navigate"

/** Chamada às rotas `/api/admin/*`. Erros do servidor viram `Error` com a mensagem pronta para a tela. */
export async function adminFetch<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    hardNavigate(`/login?next=${encodeURIComponent(window.location.pathname)}`)
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Não foi possível concluir a ação.")
  return data as T
}

/**
 * Busca com recarga: mantém os dados anteriores enquanto recarrega (trocar o período
 * não pisca a tela) e descarta respostas atrasadas. `url` null = não busca.
 */
export function useAdminData<T>(url: string | null) {
  const [state, setState] = React.useState<{ data: T | null; error: string | null; loading: boolean; url: string | null }>({
    data: null,
    error: null,
    loading: !!url,
    url,
  })
  const [nonce, setNonce] = React.useState(0)
  // Nova URL: marca carregando já na renderização (sem efeito extra).
  if (state.url !== url) setState((s) => ({ ...s, url, loading: !!url, error: null }))

  React.useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    adminFetch<T>(url, "GET", undefined, controller.signal)
      .then((data) => setState({ data, error: null, loading: false, url }))
      .catch((err: Error) => {
        if (controller.signal.aborted) return
        setState((s) => ({ ...s, error: err.message, loading: false }))
      })
    return () => controller.abort()
  }, [url, nonce])

  const reload = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    setNonce((n) => n + 1)
  }, [])
  const setData = React.useCallback((fn: (d: T | null) => T | null) => setState((s) => ({ ...s, data: fn(s.data) })), [])

  return { data: state.data, error: state.error, loading: state.loading, reload, setData }
}
