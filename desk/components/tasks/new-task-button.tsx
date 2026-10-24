"use client"

import { Plus } from "lucide-react"
import { useShell, type QuickTaskDefaults } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"

/** Abre a criação rápida de tarefa com valores já preenchidos (prazo, projeto, área). */
export function NewTaskButton({ defaults, label = "Nova tarefa", variant = "ghost" }: { defaults?: QuickTaskDefaults; label?: string; variant?: "ghost" | "primary" | "secondary" }) {
  const { openQuickTask } = useShell()
  return (
    <Button size="sm" variant={variant} onClick={() => openQuickTask(defaults)}>
      <Plus />
      {label}
    </Button>
  )
}
