"use client"

import * as React from "react"

/**
 * Rascunho de cada conversa, mantido ao trocar de conversa. A Lexa IA escreve aqui
 * a resposta sugerida: ela aparece no campo, e só vai para o cliente se a pessoa
 * clicar em Enviar.
 */

type Draft = { text: string; mode: "reply" | "note" }

const drafts = new Map<string, Draft>()
const listeners = new Set<() => void>()
const EMPTY: Draft = { text: "", mode: "reply" }

export const draftStore = {
  get: (id: string) => drafts.get(id) ?? EMPTY,
  set(id: string, draft: Partial<Draft>) {
    drafts.set(id, { ...(drafts.get(id) ?? EMPTY), ...draft })
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function useDraft(conversationId: string) {
  const draft = React.useSyncExternalStore(
    draftStore.subscribe,
    () => draftStore.get(conversationId),
    () => EMPTY,
  )
  const set = React.useCallback((patch: Partial<Draft>) => draftStore.set(conversationId, patch), [conversationId])
  return [draft, set] as const
}
