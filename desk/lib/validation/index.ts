import { z } from "zod"
import { isLocalDate } from "@/lib/domain/dates"
import { REF_TYPES } from "@/lib/domain/refs"
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain/tasks"

/*
 * Validação de tudo que chega do navegador. Os serviços só recebem dados já conferidos aqui;
 * o banco ainda garante as regras principais com restrições (check, unique, fk).
 */

const trimmed = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`)
const title = (max = 300) => trimmed(max).min(1, "Informe um título.")
const uuid = z.uuid({ message: "Identificador inválido." })
const localDate = z.string().refine(isLocalDate, "Data inválida (use AAAA-MM-DD).")
const optionalDate = z.union([localDate, z.null()]).optional()
const optionalId = z.union([uuid, z.null()]).optional()

export const idSchema = uuid
export const localDateSchema = localDate
export const refTypeSchema = z.enum(REF_TYPES)

export const recurrenceSchema = z
  .object({ freq: z.enum(["daily", "weekly", "monthly", "yearly"]), interval: z.number().int().min(1).max(365) })
  .nullable()

const datesInOrder = (v: { startDate?: string | null; dueDate?: string | null }) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate
const datesMessage = { message: "A data de início precisa ser anterior ao prazo.", path: ["startDate"] }

const taskFields = {
  title: title(),
  description: trimmed(20_000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  startDate: optionalDate,
  dueDate: optionalDate,
  areaId: optionalId,
  projectId: optionalId,
  estimateMinutes: z.union([z.number().int().min(1).max(100_000), z.null()]).optional(),
  recurrence: recurrenceSchema.optional(),
  tags: z.array(trimmed(40).min(1)).max(20).optional(),
}

export const createTaskSchema = z
  .object({
    ...taskFields,
    description: taskFields.description.optional(),
    status: taskFields.status.optional(),
    priority: taskFields.priority.optional(),
    subtasks: z.array(title(300)).max(100).optional(),
  })
  .refine(datesInOrder, datesMessage)
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z.object(taskFields).partial().refine(datesInOrder, datesMessage)
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

export const moveTaskSchema = z.object({
  status: z.enum(TASK_STATUSES),
  beforeId: optionalId,
  afterId: optionalId,
})

export const taskFilterSchema = z.object({
  status: z.array(z.enum(TASK_STATUSES)).optional(),
  priority: z.array(z.enum(TASK_PRIORITIES)).optional(),
  projectId: z.union([uuid, z.literal("none")]).optional(),
  areaId: z.union([uuid, z.literal("none")]).optional(),
  tag: trimmed(40).optional(),
  dueFrom: localDate.optional(),
  dueTo: localDate.optional(),
  noDueDate: z.boolean().optional(),
  query: trimmed(200).optional(),
})
export type TaskFilter = z.infer<typeof taskFilterSchema>

export const subtaskSchema = z.object({ title: title(300) })

export const areaSchema = z.object({
  name: title(120),
  description: trimmed(2000).optional(),
  color: z.enum(["sage", "cobalt", "charcoal", "clay", "sand", "plum"]).optional(),
})
export const updateAreaSchema = areaSchema.partial()

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed", "archived"] as const
export const projectSchema = z
  .object({
    title: title(200),
    description: trimmed(20_000).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    areaId: optionalId,
    startDate: optionalDate,
    targetDate: optionalDate,
  })
  .refine((v) => !v.startDate || !v.targetDate || v.startDate <= v.targetDate, { message: "O início precisa ser anterior à meta.", path: ["startDate"] })
export const updateProjectSchema = z
  .object({
    title: title(200),
    description: trimmed(20_000),
    status: z.enum(PROJECT_STATUSES),
    areaId: optionalId,
    startDate: optionalDate,
    targetDate: optionalDate,
  })
  .partial()
  .refine((v) => !v.startDate || !v.targetDate || v.startDate <= v.targetDate, { message: "O início precisa ser anterior à meta.", path: ["startDate"] })

export const pageMetaSchema = z.object({
  title: trimmed(300).optional(),
  projectId: optionalId,
  areaId: optionalId,
})

/** Conteúdo do editor: a estrutura é conferida por `validateDoc` (lib/domain/doc.ts). */
export const saveDocSchema = z.object({
  content: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().min(0),
  force: z.boolean().optional(),
})

export const inboxCaptureSchema = z.object({
  content: trimmed(10_000).min(1, "Escreva algo para capturar."),
  kind: z.enum(["note", "task", "idea"]).optional(),
})

export const boardSchema = z.object({
  title: trimmed(200).optional(),
  description: trimmed(5000).optional(),
  projectId: optionalId,
  areaId: optionalId,
})

const finite = z.number().finite()
const elementBase = {
  id: uuid,
  x: finite.min(-1e6).max(1e6),
  y: finite.min(-1e6).max(1e6),
  width: finite.min(4).max(20_000),
  height: finite.min(4).max(20_000),
  zIndex: z.number().int().min(-100_000).max(100_000),
  parentId: z.union([uuid, z.null()]),
}
const color = trimmed(32).optional()
const textField = z.string().max(20_000).optional()

/** Elementos do canvas: o que é aparência fica em `data`; registro vinculado só por `ref`. */
export const boardElementSchema = z.discriminatedUnion("kind", [
  z.object({ ...elementBase, kind: z.literal("card"), data: z.object({ title: textField, body: textField, color }), ref: z.null() }),
  z.object({
    ...elementBase,
    kind: z.literal("shape"),
    data: z.object({ shape: z.enum(["rect", "ellipse", "diamond"]), text: textField, color }),
    ref: z.null(),
  }),
  z.object({ ...elementBase, kind: z.literal("text"), data: z.object({ text: textField, size: z.enum(["s", "m", "l", "xl"]).optional() }), ref: z.null() }),
  z.object({ ...elementBase, kind: z.literal("sticky"), data: z.object({ text: textField, color }), ref: z.null() }),
  z.object({ ...elementBase, kind: z.literal("frame"), data: z.object({ title: textField, color }), ref: z.null() }),
  z.object({
    ...elementBase,
    kind: z.literal("drawing"),
    data: z.object({
      points: z.array(z.tuple([finite, finite])).min(2).max(5000),
      color,
      strokeWidth: z.number().min(1).max(40).optional(),
    }),
    ref: z.null(),
  }),
  z.object({
    ...elementBase,
    kind: z.literal("record"),
    data: z.object({ color }),
    ref: z.object({ type: z.enum(["task", "project", "page", "journal"]), id: uuid }),
  }),
])
export type BoardElementInput = z.infer<typeof boardElementSchema>

export const boardConnectionSchema = z.object({
  id: uuid,
  sourceId: uuid,
  targetId: uuid,
  sourceHandle: z.union([trimmed(32), z.null()]),
  targetHandle: z.union([trimmed(32), z.null()]),
  label: trimmed(500),
  style: z.object({
    arrowStart: z.boolean().optional(),
    arrowEnd: z.boolean().optional(),
    dashed: z.boolean().optional(),
    color,
  }),
})
export type BoardConnectionInput = z.infer<typeof boardConnectionSchema>

export const viewportSchema = z.object({ x: finite.min(-1e7).max(1e7), y: finite.min(-1e7).max(1e7), zoom: finite.min(0.02).max(8) })

export const boardSnapshotSchema = z.object({
  baseVersion: z.number().int().min(0),
  force: z.boolean().optional(),
  viewport: viewportSchema,
  elements: z.array(boardElementSchema).max(5000),
  connections: z.array(boardConnectionSchema).max(10_000),
})
export type BoardSnapshotInput = z.infer<typeof boardSnapshotSchema>

export const settingsSchema = z.object({
  ownerName: trimmed(80).optional(),
  timezone: z.union([trimmed(64), z.null()]).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
})

/** Primeira mensagem de erro do zod, para mostrar na interface. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos."
}
