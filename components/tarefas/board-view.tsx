"use client"

import * as React from "react"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, ChevronsLeftRight, Ellipsis, Palette, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { NativeSelect, TextInput } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LimitedList, type MoreFromServer } from "@/components/ui/show-more"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { describeRelated } from "@/lib/store/selectors"
import { createLocalStore } from "@/lib/core/hooks"
import { CATEGORY_COLORS } from "@/lib/core/config"
import { getNow, toLocalISO } from "@/lib/core/dates"
import { currentUserId } from "@/lib/auth/account"
import { boardOrder, type TaskFilters } from "@/lib/tarefas/workspace"
import type { Task, TaskColumn } from "@/types"
import { TaskCard } from "./task-card"
import { useTaskActions } from "./task-actions"

const DRAG_TYPE = "application/x-integra-task"

/** Colunas recolhidas: preferência de quem está usando (não muda o quadro dos outros). */
const collapsedStore = createLocalStore("lexa:tarefas:recolhidas", "")

function useCollapsed() {
  const raw = React.useSyncExternalStore(collapsedStore.subscribe, collapsedStore.get, collapsedStore.getServer)
  const set = React.useMemo(() => new Set(raw.split(",").filter(Boolean)), [raw])
  const toggle = (id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    collapsedStore.set([...next].join(","))
  }
  return [set, toggle] as const
}

function nextColor(columns: TaskColumn[]) {
  const used = new Set(columns.map((c) => c.color))
  return (CATEGORY_COLORS.find((c) => !used.has(c.value)) ?? CATEGORY_COLORS[columns.length % CATEGORY_COLORS.length]).value
}

function AddColumn({ columns }: { columns: TaskColumn[] }) {
  const { addTaskColumn, confirmSaved } = useOfficeActions()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    const column = addTaskColumn({ name: trimmed, color: nextColor(columns) })
    const ok = await confirmSaved("taskColumns", column.id)
    setSaving(false)
    if (!ok) return
    setOpen(false)
    toast.success(`Coluna "${trimmed}" criada.`)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName("")
      }}
    >
      <PopoverTrigger className="flex h-10 w-[272px] shrink-0 items-center justify-center gap-1.5 self-start rounded-[12px] border border-dashed border-border-strong text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:border-brand/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40">
        <Plus className="size-4" /> Nova coluna
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <TextInput
            autoFocus
            placeholder="Ex.: Aguardando cliente"
            aria-label="Nome da coluna"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" className="w-full" disabled={!name.trim() || saving}>
            {saving ? "Criando…" : "Criar coluna"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function ColumnMenu({
  column,
  index,
  columns,
  count,
  onRename,
  onCollapse,
}: {
  column: TaskColumn
  index: number
  columns: TaskColumn[]
  count: number
  onRename: () => void
  onCollapse: () => void
}) {
  const { updateTaskColumn, deleteTaskColumn, reorderTaskColumns, versionOf, confirmSaved } = useOfficeActions()
  const [deleting, setDeleting] = React.useState(false)
  const others = columns.filter((c) => c.id !== column.id)
  const [target, setTarget] = React.useState(others[0]?.id ?? "")
  const item = "h-8 gap-2.5 px-2 text-[13px]"

  const move = async (delta: -1 | 1) => {
    const ids = columns.map((c) => c.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderTaskColumns(ids)
    if (await confirmSaved("taskColumns", column.id)) toast.success(`Coluna "${column.name}" movida.`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Ações da coluna ${column.name}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent"
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem className={item} onClick={onRename}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={item}>
                <Palette /> Cor
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {CATEGORY_COLORS.map((c) => (
                  <DropdownMenuItem
                    key={c.value}
                    className={item}
                    onClick={() => void updateTaskColumn(column.id, { color: c.value }, { baseVersion: versionOf("taskColumns", column.id) })}
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.value }} aria-hidden />
                    {c.name}
                    {c.value === column.color && <span className="ml-auto text-[11px] text-subtle">atual</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem className={item} onClick={onCollapse}>
              <ChevronsLeftRight /> Recolher
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem className={item} disabled={index === 0} onClick={() => void move(-1)}>
              <ArrowLeft /> Mover para a esquerda
            </DropdownMenuItem>
            <DropdownMenuItem className={item} disabled={index === columns.length - 1} onClick={() => void move(1)}>
              <ArrowRight /> Mover para a direita
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {others.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={item}
                variant="destructive"
                onClick={() => {
                  setTarget(others.find((c) => !!c.isDone === !!column.isDone)?.id ?? others[0].id)
                  setDeleting(true)
                }}
              >
                <Trash2 /> Excluir coluna
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir a coluna "${column.name}"?`}
        confirmLabel="Excluir coluna"
        description={
          count > 0
            ? `Nenhuma tarefa é excluída. As ${count} tarefa(s) desta coluna — inclusive concluídas antigas — passam para:`
            : "A coluna está vazia. Nenhuma tarefa é afetada."
        }
        onConfirm={async () => {
          deleteTaskColumn(column.id, target)
          if (await confirmSaved("taskColumns", column.id)) toast.success(`Coluna "${column.name}" excluída.`)
        }}
      >
        {count > 0 && (
          <NativeSelect aria-label="Coluna de destino" value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 text-[13px]">
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isDone ? " (conclui a tarefa)" : ""}
              </option>
            ))}
          </NativeSelect>
        )}
      </ConfirmDialog>
    </>
  )
}

/** Criação rápida dentro da coluna: título e prazo (o resto, depois, no painel). */
function QuickAdd({ column, filters }: { column: TaskColumn; filters: TaskFilters }) {
  const a = useTaskActions()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [date, setDate] = React.useState(() => toLocalISO(getNow()).slice(0, 10))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const submit = async () => {
    const trimmed = title.trim()
    if (saving) return
    if (trimmed.length < 3) return setError("Escreva ao menos 3 letras.")
    if (!date) return setError("Escolha o prazo.")
    setSaving(true)
    setError("")
    // O vínculo segue o filtro aberto (cliente ou processo), quando há um.
    const related = filters.processId
      ? ({ type: "process", id: filters.processId } as const)
      : filters.clientId
        ? ({ type: "client", id: filters.clientId } as const)
        : undefined
    const created = await a.quickCreate({
      title: trimmed,
      dueAt: `${date}T18:00:00`,
      priority: "media",
      assigneeId: filters.assignees.length === 1 ? filters.assignees[0] : currentUserId(),
      columnId: column.id,
      related,
    })
    setSaving(false)
    if (!created) return setError("Não foi salva. Tente de novo.")
    setTitle("")
    toast.success("Tarefa criada.", { description: created.title })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full shrink-0 items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Plus className="size-3.5" /> Adicionar tarefa
      </button>
    )
  }
  return (
    <form
      className="shrink-0 space-y-2 rounded-[10px] border border-brand/30 bg-card p-2 shadow-card"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation()
          setOpen(false)
          setError("")
        }
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void submit()
          }
        }}
        placeholder="O que precisa ser feito?"
        aria-label={`Título da nova tarefa em ${column.name}`}
        className="w-full resize-none rounded-[6px] bg-transparent px-1 text-[13px] leading-snug text-foreground outline-none placeholder:text-subtle"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <label className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          Prazo
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 min-w-0 rounded-[6px] border border-border bg-surface px-1.5 text-[12px] text-foreground outline-none focus:border-brand/60"
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="xs" disabled={saving || !title.trim()}>
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-1 text-[11.5px] text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

function ColumnTitle({
  column,
  renaming,
  setRenaming,
  editable,
}: {
  column: TaskColumn
  renaming: boolean
  setRenaming: (v: boolean) => void
  editable: boolean
}) {
  const { updateTaskColumn, versionOf } = useOfficeActions()
  const [name, setName] = React.useState(column.name)
  const [baseVersion, setBaseVersion] = React.useState<string | null>(null)
  const [lastRenaming, setLastRenaming] = React.useState(renaming)
  if (renaming !== lastRenaming) {
    setLastRenaming(renaming)
    if (renaming) {
      setName(column.name)
      setBaseVersion(versionOf("taskColumns", column.id))
    }
  }
  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== column.name) void updateTaskColumn(column.id, { name: trimmed }, { baseVersion })
    setRenaming(false)
  }
  if (renaming) {
    return (
      <TextInput
        autoFocus
        aria-label="Nome da coluna"
        maxLength={40}
        className="h-7 min-w-0 flex-1 px-2 text-[13px]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") setRenaming(false)
        }}
      />
    )
  }
  return (
    <h3
      className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground"
      title={editable ? "Clique duas vezes para renomear" : column.name}
      onDoubleClick={() => editable && setRenaming(true)}
    >
      {column.name}
    </h3>
  )
}

/**
 * Quadro (Kanban) com as colunas do escritório. A coluna é a situação real da tarefa
 * (a que "conclui" encerra a tarefa). Dentro da coluna, a ordem é a do prazo — o
 * modelo não guarda ordem manual, e o prazo é o que importa num escritório.
 */
export function BoardView({
  tasks,
  columns,
  columnOf,
  columnTotal,
  history,
  listKey,
  activeId,
  showAssignee,
  filters,
  onOpen,
}: {
  tasks: Task[]
  columns: TaskColumn[]
  columnOf: (t: Task) => TaskColumn | undefined
  columnTotal: (column: TaskColumn, items: Task[]) => number | undefined
  history: MoreFromServer
  listKey: string
  activeId?: string
  showAssignee: (t: Task) => boolean
  filters: TaskFilters
  onOpen: (id: string) => void
}) {
  const data = useOfficeData()
  const a = useTaskActions()
  const [collapsed, toggleCollapsed] = useCollapsed()
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const prazoTaskIds = React.useMemo(() => new Set(data.deadlines.map((d) => d.taskId).filter(Boolean)), [data.deadlines])

  const byColumn = React.useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      const id = columnOf(t)?.id
      if (!id) continue
      const list = map.get(id)
      if (list) list.push(t)
      else map.set(id, [t])
    }
    for (const list of map.values()) list.sort(boardOrder)
    return map
  }, [tasks, columnOf])

  if (!columns.length) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-80 w-[272px] shrink-0 animate-pulse rounded-[14px] bg-surface-muted/60 motion-reduce:animate-none" />
        ))}
      </div>
    )
  }

  const dragged = dragId ? tasks.find((t) => t.id === dragId) : undefined

  return (
    <div
      className="-mx-1 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-1 pb-3 thin-scrollbar sm:snap-none"
      role="list"
      aria-label="Quadro de tarefas"
    >
      {columns.map((column, index) => {
        const items = byColumn.get(column.id) ?? []
        const total = columnTotal(column, items) ?? items.length
        const isCollapsed = collapsed.has(column.id)
        const canDrop = a.editable && !!dragged && columnOf(dragged)?.id !== column.id
        const dropProps = {
          onDragOver: (e: React.DragEvent) => {
            if (!a.editable || !e.dataTransfer.types.includes(DRAG_TYPE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            if (over !== column.id) setOver(column.id)
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((v) => (v === column.id ? null : v))
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            setOver(null)
            const id = e.dataTransfer.getData(DRAG_TYPE)
            const task = id ? data.tasks.find((t) => t.id === id) : undefined
            if (task && a.editable) void a.move(task, column.id)
          },
        }

        if (isCollapsed) {
          return (
            <div
              key={column.id}
              role="listitem"
              {...dropProps}
              className={cn(
                "flex w-11 shrink-0 snap-start flex-col items-center gap-2 rounded-[14px] border py-3 transition-colors duration-150",
                over === column.id && canDrop ? "border-brand bg-brand-soft/40" : "border-border bg-surface-muted/50",
              )}
            >
              <button
                type="button"
                onClick={() => toggleCollapsed(column.id)}
                aria-label={`Expandir a coluna ${column.name} (${total} tarefas)`}
                className="flex flex-col items-center gap-2 rounded-[8px] px-1 py-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: column.color }} aria-hidden />
                <span className="tabular text-[11px] font-semibold text-muted-foreground">{total}</span>
                <span className="text-[12.5px] font-semibold text-foreground [writing-mode:vertical-rl]">{column.name}</span>
              </button>
            </div>
          )
        }

        return (
          <section
            key={column.id}
            role="listitem"
            aria-label={`${column.name}: ${total} tarefa${total === 1 ? "" : "s"}`}
            {...dropProps}
            className={cn(
              "flex max-h-[calc(100dvh-300px)] min-h-[180px] w-[min(84vw,288px)] shrink-0 snap-start flex-col rounded-[14px] border p-2 transition-[border-color,background-color] duration-150 sm:w-[288px]",
              over === column.id && canDrop
                ? "border-brand bg-brand-soft/40"
                : canDrop
                  ? "border-dashed border-brand/40 bg-surface-muted/50"
                  : "border-border bg-surface-muted/50",
            )}
          >
            <header className="relative flex items-center gap-1.5 px-1.5 pt-0.5 pb-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} aria-hidden />
              <ColumnTitle
                column={column}
                renaming={renaming === column.id}
                setRenaming={(v) => setRenaming(v ? column.id : null)}
                editable={a.editable}
              />
              <span className="tabular rounded-[5px] bg-card px-1.5 py-px text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                {total}
              </span>
              {column.isDone && <span className="sr-only">(conclui a tarefa)</span>}
              {a.editable && (
                <ColumnMenu
                  column={column}
                  index={index}
                  columns={columns}
                  count={total}
                  onRename={() => setRenaming(column.id)}
                  onCollapse={() => toggleCollapsed(column.id)}
                />
              )}
              {!a.editable && (
                <Button variant="ghost" size="icon-xs" aria-label={`Recolher a coluna ${column.name}`} onClick={() => toggleCollapsed(column.id)}>
                  <ChevronsLeftRight />
                </Button>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-0.5 pb-1 thin-scrollbar">
              {items.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-[12px] text-subtle">
                  {canDrop ? "Solte aqui" : a.editable ? "Nenhuma tarefa. Arraste um cartão para cá." : "Nenhuma tarefa."}
                </p>
              ) : (
                // Colunas com centenas de cartões (as concluídas): 50 por vez; as antigas vêm do banco.
                <LimitedList
                  items={items}
                  listKey={`${column.id}|${listKey}`}
                  server={column.isDone ? history : undefined}
                  total={column.isDone ? total : undefined}
                  className="mt-2"
                >
                  {(visible) =>
                    visible.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        related={describeRelated(data, task.related)}
                        columns={columns}
                        currentColumnId={column.id}
                        showAssignee={showAssignee(task)}
                        isPrazo={prazoTaskIds.has(task.id)}
                        active={activeId === task.id}
                        onOpen={onOpen}
                        onDragState={setDragId}
                      />
                    ))
                  }
                </LimitedList>
              )}
            </div>
            {a.editable && !column.isDone && (
              <div className="pt-1.5">
                <QuickAdd column={column} filters={filters} />
              </div>
            )}
          </section>
        )
      })}
      {a.editable && <AddColumn columns={columns} />}
    </div>
  )
}
