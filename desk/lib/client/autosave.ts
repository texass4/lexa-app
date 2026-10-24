"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/*
 * Salvamento automático confiável, usado pelo editor e pelo canvas.
 *
 * - Um salvamento por vez: a próxima alteração espera a anterior terminar, então uma
 *   resposta atrasada nunca sobrescreve uma mais nova.
 * - Cada envio leva a versão em que se baseia; o servidor recusa versões antigas (conflito).
 * - Toda alteração ainda não confirmada fica guardada neste aparelho (localStorage) e pode
 *   ser recuperada se a rede cair ou a aba fechar antes de salvar.
 * - Falha de rede: tenta de novo sozinho (2 s, 5 s, 15 s, 30 s…) e ao voltar a conexão.
 */

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "offline" | "conflict"
export type SaveResponse = { ok: true; version: number } | { ok: false; conflict: true; version: number; content?: unknown }
export type SaveFn<T> = (value: T, baseVersion: number, opts: { keepalive?: boolean; force?: boolean }) => Promise<SaveResponse>

type Draft<T> = { value: T; baseVersion: number; savedAt: number }
export type RecoverableDraft<T> = Draft<T> & { stale: boolean }

const RETRY_DELAYS = [2000, 5000, 15000, 30000]
const storageKey = (key: string) => `mesa:draft:${key}`

function readDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    return raw ? (JSON.parse(raw) as Draft<T>) : null
  } catch {
    return null
  }
}

function writeDraft<T>(key: string, draft: Draft<T>) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(draft))
  } catch {
    // Sem espaço ou em modo privado: o salvamento no servidor continua normalmente.
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(storageKey(key))
  } catch {}
}

/** Erro de rede (sem resposta do servidor) — distinto de um erro de validação. */
export class NetworkError extends Error {}

export function useAutosave<T>({
  key,
  initialVersion,
  save,
  delay = 800,
  serverValue,
  isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b),
}: {
  key: string
  initialVersion: number
  save: SaveFn<T>
  delay?: number
  /** Valor que veio do servidor: um rascunho idêntico a ele é descartado em silêncio. */
  serverValue?: T
  isEqual?: (a: T, b: T) => boolean
}) {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ version: number; content?: unknown } | null>(null)
  const [draft, setDraft] = useState<RecoverableDraft<T> | null>(null)

  const version = useRef(initialVersion)
  const pending = useRef<T | undefined>(undefined)
  const inflight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attempt = useRef(0)
  const blocked = useRef(false)
  const saveRef = useRef(save)
  const flushRef = useRef<(opts?: { force?: boolean }) => Promise<void>>(async () => {})
  useEffect(() => {
    saveRef.current = save
  }, [save])

  // Rascunho deixado por uma sessão anterior que não chegou a salvar.
  useEffect(() => {
    const found = readDraft<T>(key)
    if (!found) return
    if (serverValue !== undefined && isEqual(found.value, serverValue)) {
      clearDraft(key)
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage na montagem
    setDraft({ ...found, stale: found.baseVersion !== initialVersion })
    // Só na montagem: o rascunho é de quando a página abriu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const flush = useCallback(async (opts: { force?: boolean } = {}): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (inflight.current || pending.current === undefined) return
    if (blocked.current && !opts.force) return
    const value = pending.current
    pending.current = undefined
    inflight.current = true
    setStatus("saving")
    try {
      const result = await saveRef.current(value, version.current, { force: opts.force })
      if (result.ok) {
        version.current = result.version
        attempt.current = 0
        blocked.current = false
        setErrorMessage(null)
        if (pending.current === undefined) {
          clearDraft(key)
          setStatus("saved")
        }
      } else {
        // Conflito: guarda o que a pessoa escreveu e espera a decisão dela.
        if (pending.current === undefined) pending.current = value
        blocked.current = true
        setConflict({ version: result.version, content: result.content })
        setStatus("conflict")
      }
    } catch (error) {
      if (pending.current === undefined) pending.current = value
      const offline = error instanceof NetworkError || (typeof navigator !== "undefined" && !navigator.onLine)
      setStatus(offline ? "offline" : "error")
      setErrorMessage(error instanceof Error ? error.message : null)
      const wait = RETRY_DELAYS[Math.min(attempt.current, RETRY_DELAYS.length - 1)]!
      attempt.current++
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => void flushRef.current(), wait)
      return
    } finally {
      inflight.current = false
    }
    if (pending.current !== undefined && !blocked.current) void flushRef.current()
  }, [key])
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const schedule = useCallback(
    (value: T) => {
      pending.current = value
      writeDraft(key, { value, baseVersion: version.current, savedAt: Date.now() })
      if (blocked.current) return
      setStatus((s) => (s === "error" || s === "offline" ? s : "dirty"))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [delay, flush, key],
  )

  const retry = useCallback(() => {
    attempt.current = 0
    if (retryTimer.current) clearTimeout(retryTimer.current)
    void flush()
  }, [flush])

  /** "mine": grava a versão local por cima. "theirs": aceita a do servidor e descarta a local. */
  const resolveConflict = useCallback(
    (choice: "mine" | "theirs") => {
      const server = conflict
      setConflict(null)
      if (choice === "theirs") {
        if (server) version.current = server.version
        pending.current = undefined
        blocked.current = false
        clearDraft(key)
        setStatus("saved")
        return
      }
      blocked.current = false
      void flush({ force: true })
    },
    [conflict, flush, key],
  )

  const discardDraft = useCallback(() => {
    clearDraft(key)
    setDraft(null)
  }, [key])

  // Ao fechar ou esconder a aba, envia o que falta (keepalive) — o rascunho local fica de reserva.
  useEffect(() => {
    const sendPending = () => {
      if (pending.current === undefined || blocked.current) return
      void saveRef.current(pending.current, version.current, { keepalive: true }).catch(() => {})
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendPending()
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current !== undefined || inflight.current) {
        sendPending()
        event.preventDefault()
      }
    }
    const onOnline = () => retry()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("online", onOnline)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("online", onOnline)
    }
  }, [retry])

  // Ao sair da tela (navegação interna), salva o que estiver pendente.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (pending.current !== undefined && !blocked.current) void saveRef.current(pending.current, version.current, { keepalive: true }).catch(() => {})
    },
    [],
  )

  return {
    status,
    errorMessage,
    conflict,
    draft,
    discardDraft,
    schedule,
    flush,
    retry,
    resolveConflict,
    getVersion: () => version.current,
    setVersion: (v: number) => {
      version.current = v
    },
  }
}

/** PUT em JSON que distingue erro de rede, conflito (409) e erro do servidor. */
export async function putJson(url: string, body: unknown, opts: { keepalive?: boolean } = {}): Promise<SaveResponse> {
  let response: Response
  try {
    const payload = JSON.stringify(body)
    response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
      // keepalive tem limite de 64 KB; acima disso o rascunho local garante a recuperação.
      keepalive: opts.keepalive && payload.length < 60_000,
    })
  } catch {
    throw new NetworkError("Sem conexão com o servidor.")
  }
  const data = await response.json().catch(() => ({}))
  if (response.status === 409) return { ok: false, conflict: true, version: data.version, content: data.content }
  if (response.status === 401) throw new Error("Sua sessão expirou. Entre de novo (o texto fica guardado neste aparelho).")
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Erro ${response.status}`)
  return { ok: true, version: data.version }
}
