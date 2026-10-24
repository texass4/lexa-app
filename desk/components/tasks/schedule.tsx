"use client"

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import Link from "next/link"
import { createContext, useContext, useId, useOptimistic, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import { updateTaskAction } from "@/app/actions/tasks"
import { cn } from "@/lib/cn"
import type { LocalDate } from "@/lib/domain/dates"
import { isOverdue } from "@/lib/domain/tasks"
import type { TaskItem } from "@/lib/services/tasks"

/*
 * Agendamento por arrastar: soltar uma tarefa num dia muda o prazo dela; soltar em "Sem data"
 * remove o prazo. Usado no calendário mensal e no planejamento semanal.
 */

type Ctx = { tasks: TaskItem[]; today: LocalDate; activeId: string | null }
const ScheduleContext = createContext<Ctx | null>(null)
const useSchedule = () => useContext(ScheduleContext)!

export const NO_DATE = "sem-data"

export function ScheduleDnd({ tasks, today, children }: { tasks: TaskItem[]; today: LocalDate; children: ReactNode }) {
  const [view, move] = useOptimistic(tasks, (state: TaskItem[], change: { id: string; dueDate: string | null }) =>
    state.map((t) => (t.id === change.id ? { ...t, dueDate: change.dueDate, startDate: t.startDate && change.dueDate && t.startDate > change.dueDate ? null : t.startDate } : t)),
  )
  const [, start] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const dndId = useId()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const over = e.over?.id ? String(e.over.id) : null
    if (!over) return
    const dueDate = over === NO_DATE ? null : over
    const task = view.find((t) => t.id === id)
    if (!task || task.dueDate === dueDate) return
    // Se o início ficaria depois do novo prazo, o início é limpo (a regra do banco exige ordem).
    const startDate = task.startDate && dueDate && task.startDate > dueDate ? null : undefined
    start(async () => {
      move({ id, dueDate })
      const result = await updateTaskAction(id, { dueDate, ...(startDate === null ? { startDate: null } : {}) })
      if (!result.ok) toast.error(result.error)
    })
  }

  const active = activeId ? view.find((t) => t.id === activeId) : null
  return (
    <ScheduleContext.Provider value={{ tasks: view, today, activeId }}>
      <DndContext id={dndId} sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        {children}
        <DragOverlay dropAnimation={{ duration: 120 }}>{active ? <ChipBody task={active} today={today} lifted /> : null}</DragOverlay>
      </DndContext>
    </ScheduleContext.Provider>
  )
}

/** Tarefas de um dia (ou sem data) já com o arrasto aplicado. */
export function useTasksOn(date: LocalDate | typeof NO_DATE): TaskItem[] {
  const { tasks } = useSchedule()
  return tasks.filter((t) => (date === NO_DATE ? t.dueDate === null : t.dueDate === date))
}

export function DayDrop({ date, className, children, label }: { date: LocalDate | typeof NO_DATE; className?: string; children: ReactNode; label?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  return (
    <div ref={setNodeRef} aria-label={label} className={cn(className, "transition-colors", isOver && "!bg-cobalt-wash outline outline-1 -outline-offset-1 outline-cobalt")}>
      {children}
    </div>
  )
}

export function TaskChip({ task }: { task: TaskItem }) {
  const { today, activeId } = useSchedule()
  const { setNodeRef, attributes, listeners } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} aria-roledescription="Tarefa arrastável" className={cn("touch-none rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-cobalt", activeId === task.id && "opacity-30")}>
      <ChipBody task={task} today={today} />
    </div>
  )
}

function ChipBody({ task, today, lifted }: { task: TaskItem; today: LocalDate; lifted?: boolean }) {
  const overdue = isOverdue(task, today)
  const done = task.status === "done"
  return (
    <Link
      href={`/tasks/${task.id}`}
      draggable={false}
      title={task.title}
      className={cn(
        "flex items-center gap-1.5 rounded-xs border-l-2 bg-white px-1.5 py-1 text-xs leading-tight text-ink-2 hover:text-ink",
        task.priority === "high" ? "border-clay" : task.status === "in_progress" ? "border-cobalt" : "border-line-strong",
        overdue && "bg-clay-soft/60",
        done && "text-ink-4 line-through",
        lifted && "shadow-float",
      )}
    >
      <span className="truncate">{task.title}</span>
    </Link>
  )
}
