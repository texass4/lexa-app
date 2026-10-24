"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/cn"
import type { TaskStatus } from "@/lib/domain/tasks"

/** Círculo de conclusão: concluir registra a data; desmarcar reabre a tarefa. */
export function TaskCheckbox({ status, onToggle, disabled, size = "md", label }: { status: TaskStatus; onToggle: () => void; disabled?: boolean; size?: "sm" | "md"; label: string }) {
  const done = status === "done"
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reabrir: ${label}` : `Concluir: ${label}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      disabled={disabled || status === "archived"}
      className={cn(
        "group/check flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        size === "sm" ? "size-4" : "size-[1.125rem]",
        done ? "border-sage-ink bg-sage-ink text-white" : status === "in_progress" ? "border-cobalt hover:bg-cobalt-wash" : "border-ink-4 hover:border-ink-2 hover:bg-white",
        status === "archived" && "border-dashed opacity-50",
      )}
    >
      <Check className={cn("size-3 transition-opacity", done ? "opacity-100" : "text-ink-3 opacity-0 group-hover/check:opacity-60")} strokeWidth={3} />
    </button>
  )
}
