"use client"

import * as React from "react"
import { adminFetch } from "@/lib/admin/client"
import type { AdminNotification } from "@/lib/admin/catalog"
import type { BadgeKey } from "./nav"

export interface AdminIdentity {
  id: string
  name: string
  email: string
}

interface ShellState {
  admin: AdminIdentity
  notifications: AdminNotification[] | null
  badges: Record<BadgeKey, number>
  maintenance: boolean
  /** Recarrega sino e contadores do menu — chame depois de uma ação que muda pendências. */
  refresh: () => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
}

const Ctx = React.createContext<ShellState | null>(null)

const EMPTY_BADGES: Record<BadgeKey, number> = { pending: 0, usage: 0, pastDue: 0 }
const POLL_MS = 60_000

export function AdminShellProvider({ admin, children }: { admin: AdminIdentity; children: React.ReactNode }) {
  const [notifications, setNotifications] = React.useState<AdminNotification[] | null>(null)
  const [badges, setBadges] = React.useState(EMPTY_BADGES)
  const [maintenance, setMaintenance] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)

  const refresh = React.useCallback(() => {
    adminFetch<{ notifications: AdminNotification[]; badges: Record<BadgeKey, number>; maintenance: boolean }>("/api/admin/notifications")
      .then((r) => {
        setNotifications(r.notifications)
        setBadges(r.badges)
        setMaintenance(r.maintenance)
      })
      .catch(() => setNotifications((n) => n ?? []))
  }, [])

  React.useEffect(() => {
    // Busca inicial e periódica das pendências no servidor.
    refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const value = React.useMemo(
    () => ({ admin, notifications, badges, maintenance, refresh, searchOpen, setSearchOpen, drawerOpen, setDrawerOpen }),
    [admin, notifications, badges, maintenance, refresh, searchOpen, drawerOpen],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAdminShell() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useAdminShell deve ser usado dentro do AdminShellProvider")
  return ctx
}
