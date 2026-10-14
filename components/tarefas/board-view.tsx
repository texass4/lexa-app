"use client"

import * as React from "react"
import { toast } from "sonner"
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TaskCard } from "./task-card"
import { LimitedList, type MoreFromServer } from "@/components/ui/show-more"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { completedKey } from "@/lib/store/history-lists"
import { useUI } from "@/lib/store/ui-store"
import { describeRelated } from "@/lib/store/selectors"
import { CATEGORY_COLORS } from "@/lib/core/config"
import type { Task, TaskColumn } from "@/types"
import { useSession } from "@/lib/auth/session"

/** Colunas padrão, criadas na primeira vez que o escritório abre o quadro. */
const DEFAULT_COLUMNS: { name: string; color: string; isDone?: boolean }[] = [
  { name: "A fazer", color: CATEGORY_COLORS[6].value },
  { name: "Em andamento", color: CATEGORY_COLORS[4].value },
  { name: "Concluído", color: CATEGORY_COLORS[5].value, isDone: true },
]

function nextColor(columns: TaskColumn[]) {
  const used = new Set(columns.map((c) => c.color))
  return (CATEGORY_COLORS.find((c) => !used.has(c.value)) ?? CATEGORY_COLORS[columns.length % CATEGORY_COLORS.length]).value
}

function AddColumn() {
  const { taskColumns } = useOfficeData()
  const { addTaskColumn } = useOfficeActions()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")

  const create = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addTaskColumn({ name: trimmed, color: nextColor(taskColumns) })
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName("")
      }}
    >
      <PopoverTrigger className="flex h-10 w-72 shrink-0 items-center justify-center gap-1.5 self-start rounded-[12px] border border-dashed border-border-strong text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40">
        <Plus className="size-4" /> Nova coluna
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <TextInput autoFocus placeholder="Ex.: Revisão" aria-label="Nome da coluna" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" className="w-full" disabled={!name.trim()}>
            Criar coluna
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function ColumnHeader({ column, count, canDelete, editable }: { column: TaskColumn; count: number; canDelete: boolean; editable: boolean }) {
  const { updateTaskColumn, deleteTaskColumn, versionOf } = useOfficeActions()
  const { openDialog } = useUI()
  const [renaming, setRenaming] = React.useState(false)
  const [name, setName] = React.useState(column.name)
  // Versão da coluna ao começar a renomear: se outra pessoa renomear antes, esta é recusada.
  const [baseVersion, setBaseVersion] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const startRenaming = () => {
    setName(column.name)
    setBaseVersion(versionOf("taskColumns", column.id))
    setRenaming(true)
  }

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== column.name) void updateTaskColumn(column.id, { name: trimmed }, { baseVersion })
    else setName(column.name)
    setRenaming(false)
  }

  return (
    <div className="flex items-center gap-1.5 px-1 pb-2.5">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} aria-hidden />
      {renaming ? (
        <TextInput
          autoFocus
          className="h-7 flex-1 text-[13px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            }
            if (e.key === "Escape") {
              setName(column.name)
              setRenaming(false)
            }
          }}
        />
      ) : (
        <h3 className="flex-1 truncate text-[13px] font-semibold text-foreground">{column.name}</h3>
      )}
      <span className="tabular rounded-[5px] bg-surface-muted px-1.5 text-[11px] font-medium text-muted-foreground">{count}</span>
      {editable && (
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Nova tarefa em ${column.name}`}
            onClick={() => openDialog("task", { columnId: column.id })}
          >
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Ações da coluna ${column.name}`}
              className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent"
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1">
              <DropdownMenuGroup>
                <DropdownMenuItem className="h-8 px-2" onClick={startRenaming}>
                  <Pencil /> Renomear
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setDeleting(true)}>
                    <Trash2 /> Excluir coluna
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Excluir a coluna "${column.name}"?`}
            description={count > 0 ? `${count} tarefa(s) serão movidas para a coluna anterior.` : "Esta ação não pode ser desfeita."}
            onConfirm={() => deleteTaskColumn(column.id)}
          />
        </>
      )}
    </div>
  )
}

/**
 * Quadro Kanban das tarefas, com colunas personalizáveis pelo escritório. Recebe
 * a lista já filtrada por escopo/busca de `TasksView` — o agrupamento aqui é só por coluna.
 */
/**
 * Ordem dentro da coluna: pendentes pelo vencimento (as atrasadas no topo), depois as
 * concluídas, das mais recentes (a mesma ordem do histórico que vem do banco).
 */
const boardOrder = (a: Task, b: Task) =>
  Number(a.status === "concluida") - Number(b.status === "concluida") ||
  (a.status === "concluida" ? completedKey(b).localeCompare(completedKey(a)) : a.dueAt.localeCompare(b.dueAt))

export function BoardView({
  tasks,
  onOpen,
  history,
  columnCount,
  listKey,
}: {
  tasks: Task[]
  onOpen: (id: string) => void
  /** Concluídas antigas, lidas do banco na coluna de concluídas. */
  history: MoreFromServer
  /** Total da coluna (memória + histórico no banco), quando já contado. */
  columnCount: (columnId: string, items: Task[], first: boolean) => number | undefined
  listKey: string
}) {
  const data = useOfficeData()
  const { ensureDefaultTaskColumns, moveTask, deleteTask } = useOfficeActions()
  const editable = useSession().can("tasks.edit")
  const [dragOver, setDragOver] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<Task | null>(null)
  const seeded = React.useRef(false)

  React.useEffect(() => {
    if (!editable || !data.hydrated || seeded.current || data.taskColumns.length > 0) return
    seeded.current = true
    void ensureDefaultTaskColumns(DEFAULT_COLUMNS)
  }, [editable, data.hydrated, data.taskColumns.length, ensureDefaultTaskColumns])

  // Quem só pode ver e abre um quadro ainda sem colunas vê as padrão, sem gravar nada.
  const columns = data.taskColumns.length
    ? [...data.taskColumns].sort((a, b) => a.order - b.order)
    : editable
      ? []
      : DEFAULT_COLUMNS.map((c, order) => ({ ...c, id: `padrao-${order}`, order, organizationId: "", createdAt: "" }))

  if (!data.hydrated || columns.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-80 w-72 shrink-0 animate-pulse rounded-[14px] bg-surface-muted/60" />
        ))}
      </div>
    )
  }

  const firstColumnId = columns[0].id

  /** Soltar numa coluna de concluídas é concluir: confirma e permite desfazer. */
  const move = (taskId: string, columnId: string) => {
    const task = byId(data.tasks, taskId)
    const from = task?.columnId ?? firstColumnId
    if (!task || from === columnId) return
    const updated = moveTask(taskId, columnId)
    if (updated?.status === "concluida" && task.status !== "concluida") {
      toast.success("Tarefa concluída.", { description: task.title, action: { label: "Desfazer", onClick: () => moveTask(taskId, from) } })
    }
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2 thin-scrollbar">
      {columns.map((column) => {
        const items = tasks.filter((t) => (t.columnId ?? firstColumnId) === column.id).sort(boardOrder)
        const total = columnCount(column.id, items, column.id === firstColumnId)
        return (
          <div
            key={column.id}
            onDragOver={(e) => {
              if (!editable) return
              e.preventDefault()
              setDragOver(column.id)
            }}
            onDragLeave={() => setDragOver((v) => (v === column.id ? null : v))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const taskId = e.dataTransfer.getData("text/plain")
              if (taskId && editable) move(taskId, column.id)
            }}
            className={cn(
              "flex max-h-[calc(100vh-320px)] min-h-40 w-72 shrink-0 flex-col rounded-[14px] border p-2.5 transition-colors",
              dragOver === column.id ? "border-brand bg-brand-soft/30" : "border-border bg-surface-muted/40",
            )}
          >
            <ColumnHeader column={column} count={total ?? items.length} canDelete={columns.length > 1} editable={editable} />
            <div className="flex-1 space-y-2 overflow-y-auto thin-scrollbar pb-1">
              {items.length === 0 && !total ? (
                <p className="px-1 py-6 text-center text-[12px] text-subtle">{editable ? "Arraste tarefas para cá" : "Sem tarefas"}</p>
              ) : (
                // Colunas com centenas de cartões (as concluídas): 50 por vez; as antigas vêm do banco.
                <LimitedList
                  items={items}
                  listKey={`${column.id}|${listKey}`}
                  server={items.some((t) => t.status === "concluida") || column.isDone ? history : undefined}
                  total={total}
                  className="mt-2"
                >
                  {(visible) =>
                    visible.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        related={describeRelated(data, task.related)}
                        columns={columns}
                        onOpen={() => onOpen(task.id)}
                        onDelete={() => setToDelete(task)}
                        onMove={(columnId) => move(task.id, columnId)}
                      />
                    ))
                  }
                </LimitedList>
              )}
            </div>
          </div>
        )
      })}
      {editable && <AddColumn />}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir "${toDelete?.title}"?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (!toDelete) return
          deleteTask(toDelete.id)
          toast.success("Tarefa excluída.", { description: toDelete.title })
        }}
      />
    </div>
  )
}
