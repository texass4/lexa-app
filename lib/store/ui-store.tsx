"use client"

import * as React from "react"
import { createLocalStore } from "@/lib/hooks"

export type DialogKind = "client" | "task" | "appointment" | "document" | "process"

export interface DialogDefaults {
  clientId?: string
  processId?: string
  date?: string
}

interface UIState {
  dialog: { kind: DialogKind; defaults?: DialogDefaults } | null
  openDialog(kind: DialogKind, defaults?: DialogDefaults): void
  closeDialog(): void
  commandOpen: boolean
  setCommandOpen(open: boolean): void
  mobileNavOpen: boolean
  setMobileNavOpen(open: boolean): void
  sidebarCollapsed: boolean
  toggleSidebar(): void
}

const UIContext = React.createContext<UIState | null>(null)
const sidebarStore = createLocalStore("lexa:sidebar-collapsed", "0")

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = React.useState<UIState["dialog"]>(null)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const sidebarCollapsed = React.useSyncExternalStore(sidebarStore.subscribe, sidebarStore.get, sidebarStore.getServer) === "1"

  const toggleSidebar = React.useCallback(() => {
    sidebarStore.set(sidebarStore.get() === "1" ? "0" : "1")
  }, [])

  const openDialog = React.useCallback((kind: DialogKind, defaults?: DialogDefaults) => {
    setCommandOpen(false)
    setMobileNavOpen(false)
    setDialog({ kind, defaults })
  }, [])
  const closeDialog = React.useCallback(() => setDialog(null), [])

  const value = React.useMemo(
    () => ({
      dialog,
      openDialog,
      closeDialog,
      commandOpen,
      setCommandOpen,
      mobileNavOpen,
      setMobileNavOpen,
      sidebarCollapsed,
      toggleSidebar,
    }),
    [dialog, openDialog, closeDialog, commandOpen, mobileNavOpen, sidebarCollapsed, toggleSidebar],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = React.useContext(UIContext)
  if (!ctx) throw new Error("useUI deve ser usado dentro de UIProvider")
  return ctx
}
