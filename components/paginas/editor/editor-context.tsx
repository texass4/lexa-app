"use client"

import * as React from "react"
import type { Task } from "@/types"

/**
 * O que os blocos do editor (tarefa, menção, item de checklist) precisam da tela:
 * abrir o detalhe da tarefa e criar uma tarefa real (o bloco só guarda a referência).
 */
export interface PageEditorContextValue {
  pageId: string
  /** Pode criar/concluir tarefas (`tasks.edit`). */
  canEditTasks: boolean
  openTask: (id: string) => void
  /** Abre o formulário de tarefa; `onCreated` roda depois que o banco confirma. */
  createTask: (options: { title?: string; onCreated: (task: Task) => void }) => void
  /** Escolher uma tarefa já existente para inserir. */
  pickTask: (onPick: (taskId: string) => void) => void
}

export const PageEditorContext = React.createContext<PageEditorContextValue | null>(null)

export function usePageEditor() {
  const ctx = React.useContext(PageEditorContext)
  if (!ctx) throw new Error("Bloco do editor fora da página.")
  return ctx
}
