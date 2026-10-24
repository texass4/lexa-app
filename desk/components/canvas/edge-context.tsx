"use client"

import { createContext, useContext } from "react"
import type { EdgeData } from "./model"

type EdgeActions = {
  updateEdge: (id: string, patch: Partial<EdgeData>) => void
  editingEdgeId: string | null
  setEditingEdgeId: (id: string | null) => void
}

export const EdgeContext = createContext<EdgeActions | null>(null)

export function useCanvasEdges(): EdgeActions {
  const value = useContext(EdgeContext)
  if (!value) throw new Error("useCanvasEdges fora do canvas")
  return value
}
