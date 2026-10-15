"use client"

import * as React from "react"
import { Command } from "cmdk"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Check, Search } from "lucide-react"
import { cn } from "cn"
import { useOfficeData } from "@/lib/store/office-store"
import { describeRelated } from "@/lib/store/selectors"
import { DueChip } from "@/components/tarefas/task-card"

/**
 * Escolher uma tarefa existente para mostrar na página (a página guarda só o id).
 * Lista as tarefas em memória: pendentes primeiro (por prazo), depois as concluídas recentes.
 */
export function TaskPicker({
  open,
  onOpenChange,
  onPick,
  exclude,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (taskId: string) => void
  exclude?: ReadonlySet<string>
}) {
  const data = useOfficeData()
  const tasks = React.useMemo(
    () =>
      [...data.tasks].sort((a, b) => {
        if (a.status !== b.status) return a.status === "pendente" ? -1 : 1
        return a.status === "pendente" ? a.dueAt.localeCompare(b.dueAt) : (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
      }),
    [data.tasks],
  )
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#0e1726]/25 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup className="fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-border bg-popover shadow-float outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 sm:top-[14vh]">
          <DialogPrimitive.Title className="sr-only">Inserir tarefa existente</DialogPrimitive.Title>
          <Command label="Tarefas" loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-subtle" aria-hidden />
              <Command.Input
                autoFocus
                placeholder="Buscar tarefa pelo título, cliente ou processo…"
                className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-subtle"
              />
            </div>
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5 thin-scrollbar">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nenhuma tarefa encontrada.</Command.Empty>
              {tasks.map((t) => {
                const related = describeRelated(data, t.related)
                const already = exclude?.has(t.id)
                return (
                  <Command.Item
                    key={t.id}
                    value={`${t.title} ${related?.label ?? ""} ${t.id}`}
                    disabled={already}
                    onSelect={() => {
                      onPick(t.id)
                      onOpenChange(false)
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 outline-none data-[disabled=true]:cursor-default data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        t.status === "concluida" ? "border-success bg-success text-white" : "border-border-strong",
                      )}
                    >
                      {t.status === "concluida" && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-foreground">{t.title}</span>
                      {related && <span className="block truncate text-[12px] text-muted-foreground">{related.label}</span>}
                    </span>
                    {already ? <span className="text-[11.5px] text-muted-foreground">já está na página</span> : <DueChip task={t} />}
                  </Command.Item>
                )
              })}
            </Command.List>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
