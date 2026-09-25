"use client"

import * as React from "react"
import { THEME_STORAGE_KEY } from "./theme-script"
import { createLocalStore } from "./hooks"

export type Theme = "light" | "dark"

const themeStore = createLocalStore(THEME_STORAGE_KEY, "light")

function applyTheme(next: Theme) {
  const root = document.documentElement
  root.classList.add("[&_*]:!transition-none")
  root.classList.toggle("dark", next === "dark")
  root.style.colorScheme = next
  requestAnimationFrame(() => root.classList.remove("[&_*]:!transition-none"))
}

export function useTheme() {
  const theme = React.useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.getServer) as Theme
  const setTheme = React.useCallback((next: Theme) => {
    applyTheme(next)
    themeStore.set(next)
  }, [])
  return { theme, setTheme }
}
