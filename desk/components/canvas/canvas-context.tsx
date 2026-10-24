"use client"

import { createContext, useContext } from "react"

export type CanvasActions = {
  /** Altera a aparência de um elemento. `checkpoint` grava um passo no desfazer antes. */
  updateData: (id: string, patch: Record<string, unknown>, opts?: { checkpoint?: boolean }) => void
  checkpoint: () => void
  relink: (id: string) => void
  removeElement: (id: string) => void
  editingId: string | null
  setEditingId: (id: string | null) => void
}

export const CanvasContext = createContext<CanvasActions | null>(null)

export function useCanvas(): CanvasActions {
  const value = useContext(CanvasContext)
  if (!value) throw new Error("useCanvas fora do canvas")
  return value
}
