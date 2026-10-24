"use client"

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { CalendarClock, Plus } from "lucide-react"
import Link from "next/link"
import { useId, useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"
import { moveTaskAction } from "@/app/actions/tasks"
import { useShell } from "@/components/shell/shell-context"
import { PriorityMark } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { relativeDayLabel, type LocalDate } from "@/lib/domain/dates"
import { isOverdue, STATUS_LABEL, taskCode, type TaskStatus } from "@/lib/domain/tasks"
import type { TaskItem } from "@/lib/services/tasks"

type Move = { id: string; status: TaskStatus; beforeId: string | null; afterId: string | null }

/**
 * Kanban sobre a mesma tabela de tarefas. Arrastar entre colunas é uma mudança explícita de
 * status (e concluir registra a data); a ordem dentro da coluna também é gravada.
 */
export function Kanban({ tasks, today, columns }: { tasks: TaskItem[]; today: LocalDate; columns: TaskStatus[] }) {
  const sorted = [...tasks].sort((a, b) => a.position - b.position || a.number - b.number)
  const [view, applyMove] = useOptimistic(sorted, (state: TaskItem[], move: Move) => {
    const moving = state.find((t) => t.id === move.id)
    if (!moving) return state
    const rest = state.filter((t) => t.id !== move.id)
    const updated = { ...moving, status: move.status }
    const index = move.afterId ? rest.findIndex((t) => t.id === move.afterId) : -1
    if (index >= 0) rest.splice(index, 0, updated)
    else rest.push(updated)
    return rest
  })
  const [, start] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const dndId = useId()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const over = e.over?.id ? String(e.over.id) : null
    if (!over) return
    let status: TaskStatus
    let afterId: string | null = null
    if (over.startsWith("column:")) status = over.slice(7) as TaskStatus
    else {
      // Soltar sobre um cartão: entra antes dele, na coluna dele.
      const target = view.find((t) => t.id === over)
      if (!target || target.id === id) return
      status = target.status
      afterId = target.id
    }
    const column = view.filter((t) => t.status === status && t.id !== id)
    const afterIndex = afterId ? column.findIndex((t) => t.id === afterId) : column.length
    const beforeId = afterIndex > 0 ? column[afterIndex - 1]!.id : null
    const move: Move = { id, status, beforeId, afterId }
    start(async () => {
      applyMove(move)
      const result = await moveTaskAction(id, { status, beforeId, afterId })
      if (!result.ok) toast.error(result.error)
    })
  }

  const active = activeId ? view.find((t) => t.id === activeId) : null
  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:grid lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((status) => (
          <Column key={status} status={status} tasks={view.filter((t) => t.status === status)} today={today} activeId={activeId} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 120 }}>{active ? <Card task={active} today={today} overlay /> : null}</DragOverlay>
    </DndContext>
  )
}

function Column({ status, tasks, today, activeId }: { status: TaskStatus; tasks: TaskItem[]; today: LocalDate; activeId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })
  const { openQuickTask } = useShell()
  return (
    <section className="flex w-[78vw] max-w-80 shrink-0 snap-start flex-col sm:w-72 lg:w-auto lg:max-w-none" aria-label={STATUS_LABEL[status]}>
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", status === "todo" ? "bg-ink-4" : status === "in_progress" ? "bg-cobalt" : status === "done" ? "bg-sage-ink" : "bg-line-strong")} />
        <h2 className="text-xs font-semibold tracking-wide text-ink uppercase">{STATUS_LABEL[status]}</h2>
        <span className="meta">{tasks.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn("flex min-h-40 flex-1 flex-col gap-2 rounded-md border p-2 transition-colors", isOver ? "border-cobalt bg-cobalt-wash" : "border-line-soft bg-paper-2/50")}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} today={today} dimmed={t.id === activeId} />
        ))}
        {status === "todo" ? (
          <button onClick={() => openQuickTask()} className="flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-4 hover:bg-white hover:text-ink">
            <Plus className="size-3.5" /> Nova tarefa
          </button>
        ) : null}
        {tasks.length === 0 && status !== "todo" ? <p className="px-2 py-6 text-center text-xs text-ink-4">Arraste tarefas para cá</p> : null}
      </div>
    </section>
  )
}

function DraggableCard({ task, today, dimmed }: { task: TaskItem; today: LocalDate; dimmed: boolean }) {
  const drag = useDraggable({ id: task.id })
  const drop = useDroppable({ id: task.id })
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.attributes}
      {...drag.listeners}
      aria-roledescription="Cartão arrastável"
      className={cn("relative touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cobalt", dimmed && "opacity-30")}
    >
      {drop.isOver && !dimmed ? <span className="absolute -top-1.5 right-1 left-1 h-0.5 rounded-full bg-cobalt" aria-hidden /> : null}
      <Card task={task} today={today} />
    </div>
  )
}

function Card({ task, today, overlay }: { task: TaskItem; today: LocalDate; overlay?: boolean }) {
  const overdue = isOverdue(task, today)
  return (
    <article className={cn("rounded-sm border border-line bg-white px-3 py-2.5 transition-shadow hover:border-line-strong", overlay && "rotate-1 shadow-float")}>
      <Link href={`/tasks/${task.id}`} className={cn("block text-sm leading-snug text-ink hover:underline", task.status === "done" && "text-ink-4 line-through")} draggable={false}>
        {task.title}
      </Link>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="meta">{taskCode(task.number)}</span>
        {task.dueDate ? (
          <span className={cn("meta inline-flex items-center gap-1", overdue && "font-medium text-clay")}>
            <CalendarClock className="size-3" />
            {relativeDayLabel(task.dueDate, today)}
          </span>
        ) : null}
        {task.projectTitle ? <span className="min-w-0 flex-1 truncate text-xs text-ink-4">{task.projectTitle}</span> : <span className="flex-1" />}
        <PriorityMark priority={task.priority} />
      </div>
    </article>
  )
}
