"use client"

import * as React from "react"

const noopSubscribe = () => () => {}

/** true apenas no cliente, após a hidratação. */
export function useMounted() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

export function useIsMac() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  )
}

/** Valor persistido em localStorage, sincronizado entre componentes. */
export function createLocalStore(key: string, fallback: string) {
  const listeners = new Set<() => void>()
  const read = () => {
    try {
      return window.localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  }
  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    get: read,
    getServer: () => fallback,
    set(value: string) {
      try {
        window.localStorage.setItem(key, value)
      } catch {}
      listeners.forEach((l) => l())
    },
  }
}
