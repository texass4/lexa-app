"use client"

import { createContext, useContext } from "react"
import type { LocalDate } from "@/lib/domain/dates"

export type Option = { id: string; label: string; areaId?: string | null }

export type ShellData = {
  today: LocalDate
  timezone: string
  weekStartsOn: number
  projects: Option[]
  areas: Option[]
  counts: { inbox: number; overdue: number; today: number }
}

export type QuickTaskDefaults = { title?: string; dueDate?: string | null; projectId?: string | null; areaId?: string | null; startDate?: string | null }

type ShellApi = ShellData & {
  openPalette: () => void
  openQuickTask: (defaults?: QuickTaskDefaults) => void
  openCapture: () => void
}

export const ShellContext = createContext<ShellApi | null>(null)

/** Dados e comandos globais: hoje, opções de projeto/área, criação rápida e busca. */
export function useShell(): ShellApi {
  const value = useContext(ShellContext)
  if (!value) throw new Error("useShell fora do AppShell")
  return value
}
