"use client"

import * as React from "react"
import { getSupabase } from "@/lib/supabase/client"
import type { Task } from "@/types"

/**
 * Tarefa que não está na memória (concluída há mais de 30 dias, por exemplo): lida do
 * banco uma vez, pela RLS. "missing" = excluída ou sem acesso.
 */
type Remote = { status: "loading" } | { status: "found"; task: Task } | { status: "missing" } | { status: "error" }

const cache = new Map<string, Remote>()
const pending = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()

function load(id: string) {
  if (pending.has(id)) return
  const p = (async () => {
    const { data, error } = await getSupabase().from("tasks").select("data").eq("id", id).maybeSingle()
    cache.set(id, error ? { status: "error" } : data ? { status: "found", task: data.data as Task } : { status: "missing" })
    for (const l of listeners) l()
  })().finally(() => pending.delete(id))
  pending.set(id, p)
}

export function useRemoteTask(id: string | null): Remote | null {
  const subscribe = React.useCallback((l: () => void) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const snap = React.useSyncExternalStore(
    subscribe,
    () => (id ? (cache.get(id) ?? null) : null),
    () => null,
  )
  React.useEffect(() => {
    if (id && !cache.has(id)) {
      cache.set(id, { status: "loading" })
      load(id)
    }
  }, [id])
  return id ? (snap ?? { status: "loading" }) : null
}
